-- =============================================================================
--  BODEGA DE PRODUCCIÓN CÁRNICA  ·  Esquema para Supabase (Postgres 15+)
--  Pegar completo en  SQL Editor  >  New query  >  Run
--
--  Idea central: TODO es un lote.  Un lote nace de una recepción o de un
--  proceso, tiene kg disponibles y un costo/kg.  Un proceso consume lotes y
--  produce lotes.  El costo viaja de padre a hijo y se recalcula en cascada.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 0. TIPOS
-- -----------------------------------------------------------------------------
do $$ begin
    if not exists (select 1 from pg_type where typname = 'rol_salida') then
        create type rol_salida  as enum ('principal', 'subproducto', 'merma', 'devolucion');
    end if;
    if not exists (select 1 from pg_type where typname = 'estado_lote') then
        create type estado_lote as enum ('disponible', 'agotado', 'anulado');
    end if;
    if not exists (select 1 from pg_type where typname = 'origen_lote') then
        create type origen_lote as enum ('recepcion', 'proceso');
    end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. CATÁLOGOS
-- -----------------------------------------------------------------------------
create table if not exists especies (
    id      serial primary key,
    codigo  text unique not null,          -- R, C, P, V, B, I, PV, M, T, O
    nombre  text not null
);

create table if not exists proveedores (
    id                serial primary key,
    codigo            int  unique not null,   -- el número que va al inicio del lote: 131
    nombre            text not null,
    acuerdo_limpieza  text,                   -- qué se limpia al recibir según acuerdo
    activo            boolean not null default true,
    notas             text,
    created_at        timestamptz not null default now()
);

create table if not exists productos (
    id            serial primary key,
    codigo        text unique not null,        -- las letras del lote: AR, CR, EMC
    nombre        text not null,
    especie_id    int references especies(id),
    rol_defecto   rol_salida not null default 'principal',
    -- true = solo nace de un proceso (industrial, goulash, venas, molida...)
    interno       boolean not null default false,
    -- true = pendiente de que la bodega confirme el código
    por_confirmar boolean not null default false,
    activo        boolean not null default true,
    created_at    timestamptz not null default now()
);

create table if not exists tipos_proceso (
    id      serial primary key,
    codigo  text unique not null,   -- LIMPIEZA, MOLIENDA, FILETEADA, ACUMULACION
    nombre  text not null
);

-- -----------------------------------------------------------------------------
-- 2. LOTES  (tabla central)
-- -----------------------------------------------------------------------------
create table if not exists lotes (
    id              uuid primary key default gen_random_uuid(),
    codigo          text unique not null,     -- 131AR040526  ·  EMC050526
    producto_id     int  not null references productos(id),
    proveedor_id    int  references proveedores(id),   -- null en lotes mezclados (EMC)
    fecha           date not null,
    origen          origen_lote not null,
    kg_inicial      numeric(12,3) not null default 0,
    kg_disponible   numeric(12,3) not null default 0,
    costo_kg        numeric(12,4) not null default 0,
    estado          estado_lote not null default 'disponible',
    observaciones   text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists lotes_producto_idx on lotes(producto_id);
create index if not exists lotes_estado_idx on lotes(estado) where estado = 'disponible';
create index if not exists lotes_fecha_idx on lotes(fecha);

-- -----------------------------------------------------------------------------
-- 3. RECEPCIÓN  (llega el proveedor)
-- -----------------------------------------------------------------------------
create table if not exists recepciones (
    id               uuid primary key default gen_random_uuid(),
    fecha            date not null default current_date,
    proveedor_id     int  not null references proveedores(id),
    numero_registro  text,      -- el "H REG COMPRA" del Excel (8264...)
    numero_factura   text,
    observaciones    text,
    created_at       timestamptz not null default now()
);

-- Una fila por jaba pesada.  Mismo producto + mismo proveedor + misma fecha
-- => mismo lote (así lo trabaja la bodega), así que varias filas apuntan a
-- un solo lote y el lote suma los kg.
create table if not exists recepcion_detalle (
    id                    uuid primary key default gen_random_uuid(),
    recepcion_id          uuid not null references recepciones(id) on delete cascade,
    producto_id           int  not null references productos(id),
    lote_id               uuid references lotes(id),
    kg_real               numeric(12,3) not null check (kg_real > 0),
    kg_factura            numeric(12,3),                -- opcional, para comparar
    precio_kg             numeric(12,4) not null check (precio_kg >= 0),
    -- total = kg_real * precio_kg  (así arma la factura la bodega)
    total                 numeric(14,4) generated always as (kg_real * precio_kg) stored,
    calidad_textura       text,
    calidad_color         text,
    calidad_olor          text,
    calidad_ok            boolean not null default true,
    limpiado_en_recepcion boolean not null default false,
    observaciones         text,
    created_at            timestamptz not null default now()
);
create index if not exists recdet_lote_idx on recepcion_detalle(lote_id);

-- -----------------------------------------------------------------------------
-- 4. PROCESOS  (limpieza, molienda, fileteada, acumulación)
-- -----------------------------------------------------------------------------
create table if not exists procesos (
    id                    uuid primary key default gen_random_uuid(),
    tipo_proceso_id       int  not null references tipos_proceso(id),
    fecha                 date not null default current_date,
    observaciones         text,
    -- resultados (los llena fn_procesar)
    kg_consumidos         numeric(12,3) not null default 0,
    kg_salidas            numeric(12,3) not null default 0,
    kg_merma_no_reg       numeric(12,3) not null default 0,  -- lo que no cuadró
    costo_entrada         numeric(14,4) not null default 0,
    credito_subproductos  numeric(14,4) not null default 0,
    costo_neto            numeric(14,4) not null default 0,
    procesado_at          timestamptz,
    created_at            timestamptz not null default now()
);

create table if not exists proceso_entradas (
    id                 uuid primary key default gen_random_uuid(),
    proceso_id         uuid not null references procesos(id) on delete cascade,
    lote_id            uuid not null references lotes(id),
    kg_tomados         numeric(12,3) not null check (kg_tomados > 0),
    kg_devueltos       numeric(12,3) not null default 0 check (kg_devueltos >= 0),
    costo_kg_aplicado  numeric(12,4) not null default 0,   -- foto del costo usado
    check (kg_devueltos <= kg_tomados),
    unique (proceso_id, lote_id)
);
create index if not exists procent_lote_idx on proceso_entradas(lote_id);

create table if not exists proceso_salidas (
    id                  uuid primary key default gen_random_uuid(),
    proceso_id          uuid not null references procesos(id) on delete cascade,
    producto_id         int  not null references productos(id),
    rol                 rol_salida not null,
    kg                  numeric(12,3) not null check (kg > 0),
    -- precio al que se acredita un subproducto (lo escriben en cada proceso)
    precio_credito      numeric(12,4),
    -- true => el lote hijo hereda el proveedor de la entrada (industrial esp.)
    -- false => lote mezclado sin proveedor (molida EMC, goulash acumulado)
    conserva_proveedor  boolean not null default true,
    costo_kg            numeric(12,4) not null default 0,   -- lo llena fn_procesar
    lote_id             uuid references lotes(id),          -- lote hijo generado
    check (rol <> 'subproducto' or precio_credito is not null)
);
create index if not exists procsal_lote_idx on proceso_salidas(lote_id);

-- -----------------------------------------------------------------------------
-- 5. FUNCIONES
-- -----------------------------------------------------------------------------

-- 5.1 Código de lote:  <proveedor><producto><ddmmyy>   (proveedor puede ser null)
create or replace function fn_codigo_lote(p_prov_codigo int, p_prod_codigo text, p_fecha date)
returns text language sql immutable as $$
    select coalesce(p_prov_codigo::text, '') || upper(p_prod_codigo) || to_char(p_fecha, 'DDMMYY');
$$;

-- 5.2 Busca o crea el lote con ese código
create or replace function fn_obtener_lote(
    p_producto_id int, p_proveedor_id int, p_fecha date, p_origen origen_lote)
returns uuid language plpgsql as $$
declare
    v_codigo text;
    v_id     uuid;
begin
    select fn_codigo_lote(pr.codigo, po.codigo, p_fecha)
      into v_codigo
      from productos po
      left join proveedores pr on pr.id = p_proveedor_id
     where po.id = p_producto_id;

    select id into v_id from lotes where codigo = v_codigo;
    if v_id is null then
        insert into lotes (codigo, producto_id, proveedor_id, fecha, origen)
        values (v_codigo, p_producto_id, p_proveedor_id, p_fecha, p_origen)
        returning id into v_id;
    end if;
    return v_id;
end $$;

-- 5.3 Recalcula un lote desde sus fuentes (idempotente) y dispara la cascada
create or replace function fn_actualizar_lote(p_lote_id uuid)
returns void language plpgsql as $$
declare
    v_origen      origen_lote;
    v_kg          numeric := 0;
    v_costo_total numeric := 0;
    v_consumido   numeric := 0;
    v_costo_ant   numeric;
    v_costo_new   numeric;
    v_proceso     uuid;
begin
    select origen, costo_kg into v_origen, v_costo_ant from lotes where id = p_lote_id;
    if v_origen is null then return; end if;

    if v_origen = 'recepcion' then
        select coalesce(sum(kg_real),0), coalesce(sum(kg_real*precio_kg),0)
          into v_kg, v_costo_total
          from recepcion_detalle where lote_id = p_lote_id;
    else
        select coalesce(sum(kg),0), coalesce(sum(kg*costo_kg),0)
          into v_kg, v_costo_total
          from proceso_salidas where lote_id = p_lote_id and rol <> 'devolucion';
    end if;

    select coalesce(sum(kg_tomados - kg_devueltos),0) into v_consumido
      from proceso_entradas where lote_id = p_lote_id;

    v_costo_new := case when v_kg > 0 then round(v_costo_total / v_kg, 4) else 0 end;

    update lotes
       set kg_inicial    = v_kg,
           kg_disponible = v_kg - v_consumido,
           costo_kg      = v_costo_new,
           estado        = (case when estado = 'anulado' then 'anulado'
                                 when v_kg - v_consumido <= 0.0005 then 'agotado'
                                 else 'disponible' end)::estado_lote,
           updated_at    = now()
     where id = p_lote_id;

    -- cascada: si cambió el costo, re-procesar todo lo que consumió este lote
    if v_costo_new <> coalesce(v_costo_ant, -1) then
        for v_proceso in
            select distinct pe.proceso_id
              from proceso_entradas pe
              join procesos p on p.id = pe.proceso_id
             where pe.lote_id = p_lote_id and p.procesado_at is not null
        loop
            perform fn_procesar(v_proceso);
        end loop;
    end if;
end $$;

-- 5.4 EL MOTOR DE COSTO.  Se llama al terminar de digitar un proceso
--     (y se vuelve a llamar automáticamente si cambia un costo aguas arriba).
--
--     costo_entrada = Σ (tomados - devueltos) × costo_kg del lote
--     crédito       = Σ subproductos kg × precio_credito
--     neto          = costo_entrada - crédito
--     principal     = neto / Σ kg de salidas 'principal'   (limpio + para filetear)
--     merma         = costo 0, solo resta kilos
--     devolución    = vuelve al lote origen; ni costo ni kilos salen
create or replace function fn_procesar(p_proceso_id uuid)
returns void language plpgsql as $$
declare
    v_fecha         date;
    v_kg_consumidos numeric := 0;
    v_costo_entrada numeric := 0;
    v_credito       numeric := 0;
    v_kg_principal  numeric := 0;
    v_kg_salidas    numeric := 0;
    v_costo_neto    numeric := 0;
    v_costo_ppal    numeric := 0;
    v_prov          int;
    v_n_prov        int;
    s               record;
    v_lote          uuid;
    v_lote_ant      uuid;
begin
    select fecha into v_fecha from procesos where id = p_proceso_id;
    if v_fecha is null then raise exception 'Proceso % no existe', p_proceso_id; end if;

    -- congelar el costo de entrada que se está aplicando
    update proceso_entradas pe
       set costo_kg_aplicado = l.costo_kg
      from lotes l
     where l.id = pe.lote_id and pe.proceso_id = p_proceso_id;

    select coalesce(sum(kg_tomados - kg_devueltos),0),
           coalesce(sum((kg_tomados - kg_devueltos) * costo_kg_aplicado),0)
      into v_kg_consumidos, v_costo_entrada
      from proceso_entradas where proceso_id = p_proceso_id;

    if v_kg_consumidos <= 0 then
        raise exception 'El proceso no tiene kilos de entrada';
    end if;

    -- proveedor a heredar: solo si TODAS las entradas son del mismo proveedor
    select count(distinct l.proveedor_id), min(l.proveedor_id)
      into v_n_prov, v_prov
      from proceso_entradas pe join lotes l on l.id = pe.lote_id
     where pe.proceso_id = p_proceso_id;
    if v_n_prov <> 1 then v_prov := null; end if;

    select coalesce(sum(case when rol = 'subproducto' then kg * precio_credito end),0),
           coalesce(sum(case when rol = 'principal'   then kg end),0),
           coalesce(sum(case when rol <> 'devolucion' then kg end),0)
      into v_credito, v_kg_principal, v_kg_salidas
      from proceso_salidas where proceso_id = p_proceso_id;

    v_costo_neto := v_costo_entrada - v_credito;
    v_costo_ppal := case when v_kg_principal > 0 then round(v_costo_neto / v_kg_principal, 4) else 0 end;

    -- asignar costo a cada salida y crear/actualizar su lote hijo
    for s in select * from proceso_salidas where proceso_id = p_proceso_id loop
        v_lote_ant := s.lote_id;

        if s.rol = 'devolucion' then
            -- no genera lote: la devolución se registra como kg_devueltos en la
            -- entrada; esta fila queda solo como constancia.
            update proceso_salidas set costo_kg = 0, lote_id = null where id = s.id;
        else
            v_lote := fn_obtener_lote(
                s.producto_id,
                case when s.conserva_proveedor then v_prov else null end,
                v_fecha, 'proceso');

            -- un lote no puede alimentar el proceso que lo crea
            if exists (select 1 from proceso_entradas
                        where proceso_id = p_proceso_id and lote_id = v_lote) then
                raise exception 'La salida % generaría el mismo lote que consume', s.id;
            end if;

            update proceso_salidas
               set costo_kg = case s.rol
                                when 'principal'   then v_costo_ppal
                                when 'subproducto' then s.precio_credito
                                else 0 end,
                   lote_id  = v_lote
             where id = s.id;

            perform fn_actualizar_lote(v_lote);
        end if;

        -- si la salida cambió de lote (editaron producto/fecha), refrescar el viejo
        if v_lote_ant is not null and v_lote_ant is distinct from s.lote_id then
            perform fn_actualizar_lote(v_lote_ant);
        end if;
    end loop;

    update procesos
       set kg_consumidos        = v_kg_consumidos,
           kg_salidas           = v_kg_salidas,
           kg_merma_no_reg      = v_kg_consumidos - v_kg_salidas,
           costo_entrada        = v_costo_entrada,
           credito_subproductos = v_credito,
           costo_neto           = v_costo_neto,
           procesado_at         = now()
     where id = p_proceso_id;
end $$;

-- -----------------------------------------------------------------------------
-- 6. TRIGGERS  (mantienen los lotes cuadrados sin que el frontend haga nada)
-- -----------------------------------------------------------------------------

-- 6.1 Recepción: asigna lote automáticamente y recalcula
create or replace function trg_recdet_asignar_lote() returns trigger
language plpgsql as $$
declare
    v_fecha date;
    v_prov  int;
begin
    if new.lote_id is null or (tg_op = 'UPDATE' and new.producto_id <> old.producto_id) then
        select r.fecha, r.proveedor_id into v_fecha, v_prov
          from recepciones r where r.id = new.recepcion_id;
        new.lote_id := fn_obtener_lote(new.producto_id, v_prov, v_fecha, 'recepcion');
    end if;
    return new;
end $$;

drop trigger if exists recdet_bi on recepcion_detalle;
create trigger recdet_bi before insert or update on recepcion_detalle
for each row execute function trg_recdet_asignar_lote();

create or replace function trg_recdet_recalcular() returns trigger
language plpgsql as $$
begin
    if tg_op in ('INSERT','UPDATE') then perform fn_actualizar_lote(new.lote_id); end if;
    if tg_op in ('DELETE','UPDATE') and (tg_op = 'DELETE' or old.lote_id is distinct from new.lote_id) then
        perform fn_actualizar_lote(old.lote_id);
    end if;
    return null;
end $$;

drop trigger if exists recdet_ai on recepcion_detalle;
create trigger recdet_ai after insert or update or delete on recepcion_detalle
for each row execute function trg_recdet_recalcular();

-- 6.2 Entradas de proceso: descuentan disponible del lote padre
create or replace function trg_procent_recalcular() returns trigger
language plpgsql as $$
declare v_disp numeric;
begin
    if tg_op in ('INSERT','UPDATE') then
        -- la fila nueva ya está insertada (AFTER), así que el recálculo la incluye
        perform fn_actualizar_lote(new.lote_id);
        select kg_disponible into v_disp from lotes where id = new.lote_id;
        if v_disp < -0.0005 then
            raise exception 'El lote no tiene suficientes kilos disponibles (faltan % kg)', abs(v_disp);
        end if;
    end if;
    if tg_op in ('DELETE','UPDATE') and (tg_op = 'DELETE' or old.lote_id <> new.lote_id) then
        perform fn_actualizar_lote(old.lote_id);
    end if;
    return null;
end $$;

drop trigger if exists procent_ai on proceso_entradas;
create trigger procent_ai after insert or update or delete on proceso_entradas
for each row execute function trg_procent_recalcular();

-- 6.3 Si borran una salida ya procesada, refrescar su lote hijo
create or replace function trg_procsal_borrado() returns trigger
language plpgsql as $$
begin
    if old.lote_id is not null then perform fn_actualizar_lote(old.lote_id); end if;
    return null;
end $$;

drop trigger if exists procsal_ad on proceso_salidas;
create trigger procsal_ad after delete on proceso_salidas
for each row execute function trg_procsal_borrado();

-- -----------------------------------------------------------------------------
-- 7. VISTAS  (lo que ven las pantallas y lo que se exporta a Excel)
-- -----------------------------------------------------------------------------

-- Stock por lote
create or replace view v_stock_lotes as
select l.id, l.codigo, l.fecha,
       current_date - l.fecha            as dias_en_camara,
       e.nombre                          as especie,
       po.codigo                         as producto_codigo,
       po.nombre                         as producto,
       po.rol_defecto,
       pr.codigo                         as proveedor_codigo,
       pr.nombre                         as proveedor,
       l.origen, l.kg_inicial, l.kg_disponible, l.costo_kg,
       round(l.kg_disponible * l.costo_kg, 2) as valor_stock,
       l.estado
  from lotes l
  join productos po on po.id = l.producto_id
  left join especies e on e.id = po.especie_id
  left join proveedores pr on pr.id = l.proveedor_id
 where l.estado = 'disponible'
   and po.rol_defecto <> 'merma';      -- venas, sangre, desperdicio no son inventario

-- Stock resumido por producto
create or replace view v_stock_productos as
select producto_codigo, producto, especie,
       count(*)                                        as lotes,
       sum(kg_disponible)                              as kg_disponible,
       round(sum(kg_disponible * costo_kg) / nullif(sum(kg_disponible),0), 4) as costo_kg_promedio,
       round(sum(kg_disponible * costo_kg), 2)         as valor_stock,
       min(fecha)                                      as lote_mas_antiguo
  from v_stock_lotes
 group by producto_codigo, producto, especie;

-- Último costo por producto (lo que hacía la hoja Consulta_Costos_Actuales)
create or replace view v_costo_actual as
select distinct on (l.producto_id)
       po.codigo as producto_codigo, po.nombre as producto,
       l.costo_kg as ultimo_costo_kg, l.fecha as fecha_ultimo, l.codigo as lote,
       pr.nombre as proveedor
  from lotes l
  join productos po on po.id = l.producto_id
  left join proveedores pr on pr.id = l.proveedor_id
 where l.kg_inicial > 0
 order by l.producto_id, l.fecha desc, l.created_at desc;

-- Bandeja de acumulables: industriales y goulash disponibles para agrupar
create or replace view v_acumulables as
select * from v_stock_lotes
 where rol_defecto = 'subproducto' and kg_disponible > 0
 order by producto_codigo, fecha;

-- Historial de precios de compra por proveedor y producto
create or replace view v_precios_compra as
select r.fecha, pr.codigo as proveedor_codigo, pr.nombre as proveedor,
       po.codigo as producto_codigo, po.nombre as producto,
       sum(d.kg_real) as kg, round(sum(d.total)/sum(d.kg_real),4) as precio_kg,
       sum(d.total) as total, l.codigo as lote
  from recepcion_detalle d
  join recepciones r on r.id = d.recepcion_id
  join proveedores pr on pr.id = r.proveedor_id
  join productos po on po.id = d.producto_id
  join lotes l on l.id = d.lote_id
 group by r.fecha, pr.codigo, pr.nombre, po.codigo, po.nombre, l.codigo;

-- Árbol: de dónde viene cada lote hijo
create or replace view v_trazabilidad as
select hijo.codigo as lote_hijo, ps.rol, ps.kg as kg_salida, ps.costo_kg,
       p.id as proceso_id, tp.nombre as proceso, p.fecha as fecha_proceso,
       padre.codigo as lote_padre, pe.kg_tomados, pe.kg_devueltos, pe.costo_kg_aplicado
  from proceso_salidas ps
  join procesos p on p.id = ps.proceso_id
  join tipos_proceso tp on tp.id = p.tipo_proceso_id
  join lotes hijo on hijo.id = ps.lote_id
  join proceso_entradas pe on pe.proceso_id = p.id
  join lotes padre on padre.id = pe.lote_id;

-- -----------------------------------------------------------------------------
-- 8. SEGURIDAD  (Supabase RLS: solo usuarios con sesión)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
    for t in select unnest(array['especies','proveedores','productos','tipos_proceso',
                                 'lotes','recepciones','recepcion_detalle',
                                 'procesos','proceso_entradas','proceso_salidas'])
    loop
        execute format('alter table %I enable row level security', t);
        execute format('drop policy if exists %I on %I', t || '_auth_all', t);
        execute format('create policy %I on %I for all to authenticated using (true) with check (true)',
                       t || '_auth_all', t);
    end loop;
end $$;

grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
