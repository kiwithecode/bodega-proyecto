-- =============================================================================
--  05 · AUDITORÍA Y LOGS
--  Ejecutar después de 01–04.
--
--  auditoria  : quién cambió qué y cuándo, en las tablas de operación.
--               Lo llena un trigger genérico; el frontend no hace nada.
--  logs_app   : errores y eventos de la aplicación (navegador o base),
--               los manda el frontend con fn_log().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AUDITORÍA
-- -----------------------------------------------------------------------------
create table if not exists auditoria (
    id          bigserial primary key,
    ts          timestamptz not null default now(),
    usuario     text,                  -- email del usuario autenticado (o 'sistema')
    tabla       text not null,
    operacion   text not null,         -- INSERT / UPDATE / DELETE
    registro_id text,                  -- id de la fila (uuid o serial, como texto)
    referencia  text,                  -- algo legible: código de lote, nombre, etc.
    cambios     jsonb,                 -- UPDATE: solo las columnas que cambiaron {col: {de, a}}
    antes       jsonb,                 -- DELETE: fila completa
    despues     jsonb                  -- INSERT: fila completa
);
create index if not exists auditoria_ts_idx on auditoria (ts desc);
create index if not exists auditoria_tabla_reg_idx on auditoria (tabla, registro_id);

-- Email del usuario de la sesión Supabase (o 'sistema' si es un job / SQL editor)
create or replace function fn_usuario_actual() returns text
language sql stable as $$
    select coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
        'sistema')
$$;

create or replace function trg_auditar() returns trigger
language plpgsql security definer as $$
declare
    v_ant   jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
    v_desp  jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
    v_camb  jsonb := '{}';
    v_ref   text;
    k       text;
begin
    if tg_op = 'UPDATE' then
        for k in select jsonb_object_keys(v_desp) loop
            if k not in ('updated_at') and v_ant -> k is distinct from v_desp -> k then
                v_camb := v_camb || jsonb_build_object(k, jsonb_build_object('de', v_ant -> k, 'a', v_desp -> k));
            end if;
        end loop;
        if v_camb = '{}' then return null; end if;   -- nada relevante cambió
    end if;

    v_ref := coalesce(v_desp ->> 'codigo', v_ant ->> 'codigo', v_desp ->> 'nombre', v_ant ->> 'nombre',
                      v_desp ->> 'numero_registro', v_ant ->> 'numero_registro');

    insert into auditoria (usuario, tabla, operacion, registro_id, referencia, cambios, antes, despues)
    values (fn_usuario_actual(), tg_table_name, tg_op,
            coalesce(v_desp ->> 'id', v_ant ->> 'id'), v_ref,
            case when tg_op = 'UPDATE' then v_camb end,
            case when tg_op = 'DELETE' then v_ant end,
            case when tg_op = 'INSERT' then v_desp end);
    return null;
end $$;

-- Se auditan las tablas donde una persona toma decisiones. Los lotes NO se
-- auditan fila a fila porque los recalcula el sistema todo el tiempo y sería ruido;
-- su historia se reconstruye desde recepcion_detalle y proceso_*.
do $$
declare t text;
begin
    for t in select unnest(array['recepciones','recepcion_detalle','procesos','proceso_entradas',
                                 'proceso_salidas','productos','proveedores','stock_minimos','parametros'])
    loop
        execute format('drop trigger if exists aud_%s on %I', t, t);
        execute format('create trigger aud_%s after insert or update or delete on %I for each row execute function trg_auditar()', t, t);
    end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. LOGS DE LA APLICACIÓN
-- -----------------------------------------------------------------------------
create table if not exists logs_app (
    id        bigserial primary key,
    ts        timestamptz not null default now(),
    nivel     text not null check (nivel in ('error','warn','info')),
    origen    text not null,          -- 'navegador', 'supabase', 'pantalla:Procesar'
    mensaje   text not null,
    detalle   jsonb,                  -- stack, payload, respuesta…
    url       text,
    usuario   text,
    agente    text                    -- user agent del navegador
);
create index if not exists logs_app_ts_idx on logs_app (ts desc);
create index if not exists logs_app_nivel_idx on logs_app (nivel) where nivel = 'error';

-- El frontend llama esto. Nunca falla hacia afuera: si el log no se puede
-- guardar, no debe romper la pantalla que ya estaba fallando.
create or replace function fn_log(p_nivel text, p_origen text, p_mensaje text,
                                  p_detalle jsonb default null, p_url text default null, p_agente text default null)
returns void language plpgsql security definer as $$
begin
    insert into logs_app (nivel, origen, mensaje, detalle, url, usuario, agente)
    values (coalesce(p_nivel,'error'), coalesce(p_origen,'navegador'), left(coalesce(p_mensaje,'(sin mensaje)'), 2000),
            p_detalle, left(p_url, 500), fn_usuario_actual(), left(p_agente, 300));
exception when others then null;
end $$;

-- -----------------------------------------------------------------------------
-- 3. VISTAS PARA LA PANTALLA "ACTIVIDAD"
-- -----------------------------------------------------------------------------
create or replace view v_auditoria as
select a.id, a.ts, a.usuario, a.tabla, a.operacion, a.registro_id, a.referencia,
       case a.tabla
         when 'recepciones'       then 'Recepción'
         when 'recepcion_detalle' then 'Jaba recibida'
         when 'procesos'          then 'Proceso'
         when 'proceso_entradas'  then 'Entrada de proceso'
         when 'proceso_salidas'   then 'Salida de proceso'
         when 'productos'         then 'Producto'
         when 'proveedores'       then 'Proveedor'
         when 'stock_minimos'     then 'Mínimo de stock'
         when 'parametros'        then 'Parámetro'
         else a.tabla end as entidad,
       case a.operacion when 'INSERT' then 'creó' when 'UPDATE' then 'modificó' else 'borró' end as accion,
       a.cambios, a.antes, a.despues,
       -- resumen legible de un UPDATE: "precio_kg: 6.6 → 7"
       (select string_agg(k || ': ' || coalesce(c -> k ->> 'de','∅') || ' → ' || coalesce(c -> k ->> 'a','∅'), ' · ')
          from jsonb_each(coalesce(a.cambios,'{}')) as e(k, v), lateral (select a.cambios c) x) as resumen
  from auditoria a
 order by a.ts desc;

create or replace view v_logs_resumen as
select nivel, count(*) filter (where ts > now() - interval '24 hours') as ultimas_24h,
       count(*) filter (where ts > now() - interval '7 days') as ultimos_7d,
       max(ts) as ultimo
  from logs_app group by nivel;

-- -----------------------------------------------------------------------------
-- 4. RETENCIÓN — programada semanalmente con pg_cron en 09_pendientes_cerrados.sql
-- -----------------------------------------------------------------------------
create or replace function fn_limpiar_logs(p_dias_logs int default 90, p_dias_auditoria int default 730)
returns table (logs_borrados bigint, auditoria_borrada bigint) language plpgsql security definer as $$
declare a bigint; b bigint;
begin
    delete from logs_app  where ts < now() - make_interval(days => p_dias_logs);      get diagnostics a = row_count;
    delete from auditoria where ts < now() - make_interval(days => p_dias_auditoria); get diagnostics b = row_count;
    return query select a, b;
end $$;

-- -----------------------------------------------------------------------------
-- 5. SEGURIDAD: se puede leer y escribir logs; la auditoría solo se lee
-- -----------------------------------------------------------------------------
alter table auditoria enable row level security;
alter table logs_app  enable row level security;
drop policy if exists auditoria_leer on auditoria;
drop policy if exists logs_leer on logs_app;
create policy auditoria_leer on auditoria for select to authenticated using (true);
create policy logs_leer      on logs_app  for select to authenticated using (true);
revoke insert, update, delete on auditoria from authenticated;
revoke insert, update, delete on logs_app  from authenticated;      -- solo vía fn_log
grant select on auditoria, logs_app, v_auditoria, v_logs_resumen to authenticated;
grant execute on function fn_log(text,text,text,jsonb,text,text), fn_limpiar_logs(int,int), fn_usuario_actual() to authenticated;
