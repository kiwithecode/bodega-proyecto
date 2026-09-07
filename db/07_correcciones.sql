-- =============================================================================
--  07 · CORRECCIONES  —  deshacer errores de digitación en lotes desde Stock / Lotes
--  Ejecutar después de 01–05.
--
--  fn_editar_lote(lote, fecha, observaciones)  cambia la fecha de un lote recibido.
--        El código se rearma con fn_codigo_lote (misma regla que al recibir), así que
--        131AR040526 pasa a ser 131AR030526. La recepción hereda la fecha si todas
--        sus jabas son de ese lote.
--  fn_quitar_jaba(jaba, motivo)                quita UNA fila de recepcion_detalle (p. ej. el mismo producto
--        digitado dos veces). El trigger recalcula kg y costo del lote; si era la última jaba y nada
--        salió del lote, el lote se borra también. Devuelve true si el lote se borró.
--  fn_anular_lote(lote, motivo)                deshace una recepción equivocada.
--        Borra las jabas (recepcion_detalle → queda en auditoría como "borró"), la
--        recepción si quedó vacía, y el lote. Se borra en vez de marcar 'anulado'
--        porque fn_obtener_lote busca por código: un lote anulado con el mismo
--        código atraparía las jabas cuando vuelvan a recibirlas bien.
--
--  Lo que NO hacen, a propósito, para no romper costos ni trazabilidad:
--    · kg y precio: se corrigen en recepcion_detalle (Lotes → "Compra") y la base recalcula en cascada.
--    · lotes que salieron de un proceso: se corrige el proceso (Procesar?id=…) y fn_procesar reparte de nuevo.
--    · lotes de los que ya se tomaron kg en un proceso: primero se corrige o borra ese proceso.
--  Ambas son SECURITY INVOKER: respetan RLS del usuario logueado.
-- =============================================================================

create or replace function fn_editar_lote(p_lote_id uuid, p_fecha date, p_observaciones text default null)
returns lotes language plpgsql as $$
declare
    v_lote     lotes%rowtype;
    v_codigo   text;
    v_choque   text;
    v_min_proc date;
begin
    select * into v_lote from lotes where id = p_lote_id for update;
    if not found then raise exception 'El lote no existe.'; end if;
    if v_lote.estado = 'anulado' then raise exception 'El lote % está anulado.', v_lote.codigo; end if;
    if v_lote.origen <> 'recepcion' then
        raise exception 'El lote % salió de un proceso: corrige la fecha en ese proceso, no en el lote.', v_lote.codigo;
    end if;
    if p_fecha is null then raise exception 'Falta la fecha.'; end if;
    if p_fecha > current_date then raise exception 'La fecha no puede ser futura.'; end if;

    select min(p.fecha) into v_min_proc
      from proceso_entradas pe join procesos p on p.id = pe.proceso_id
     where pe.lote_id = p_lote_id;
    if v_min_proc is not null and p_fecha > v_min_proc then
        raise exception 'El lote % se procesó el %: la fecha de ingreso no puede ser posterior.', v_lote.codigo, to_char(v_min_proc, 'DD/MM/YYYY');
    end if;

    select fn_codigo_lote(pr.codigo, po.codigo, p_fecha) into v_codigo
      from productos po left join proveedores pr on pr.id = v_lote.proveedor_id
     where po.id = v_lote.producto_id;

    if v_codigo <> v_lote.codigo then
        select codigo into v_choque from lotes where codigo = v_codigo and id <> p_lote_id;
        if found then
            raise exception 'Ya existe el lote % con esa fecha. Si son las mismas jabas, anula este lote y vuelve a recibirlas con la fecha correcta.', v_choque
                using errcode = 'unique_violation';
        end if;
    end if;

    update lotes
       set fecha = p_fecha, codigo = v_codigo,
           observaciones = coalesce(nullif(trim(p_observaciones), ''), observaciones),
           updated_at = now()
     where id = p_lote_id
     returning * into v_lote;

    -- La recepción hereda la fecha solo si todas sus jabas son de este lote (si mezcla productos, se deja).
    update recepciones r
       set fecha = p_fecha
     where r.id in (select recepcion_id from recepcion_detalle where lote_id = p_lote_id)
       and not exists (select 1 from recepcion_detalle d where d.recepcion_id = r.id and d.lote_id <> p_lote_id);

    return v_lote;
end $$;

create or replace function fn_anular_lote(p_lote_id uuid, p_motivo text default null)
returns void language plpgsql as $$
declare
    v_lote lotes%rowtype;
    v_usos int;
    v_recs uuid[];
begin
    select * into v_lote from lotes where id = p_lote_id for update;
    if not found then raise exception 'El lote no existe.'; end if;
    if v_lote.origen <> 'recepcion' then
        raise exception 'El lote % salió de un proceso: corrige o borra ese proceso, no el lote.', v_lote.codigo;
    end if;
    select count(*) into v_usos from proceso_entradas where lote_id = p_lote_id;
    if v_usos > 0 then
        raise exception 'El lote % ya se usó en % proceso(s). Corrige o borra ese proceso primero.', v_lote.codigo, v_usos;
    end if;
    if exists (select 1 from proceso_salidas where lote_id = p_lote_id) then
        raise exception 'El lote % también recibió salidas de un proceso. Corrige ese proceso primero.', v_lote.codigo;
    end if;

    -- 1) Las jabas: dejan de contar en KPIs, precios y costos. Quedan en auditoría como "borró".
    select array_agg(distinct recepcion_id) into v_recs from recepcion_detalle where lote_id = p_lote_id;
    delete from recepcion_detalle where lote_id = p_lote_id;
    -- La recepción se borra solo si quedó sin jabas (si traía otros productos, se conserva).
    delete from recepciones r
     where r.id = any(coalesce(v_recs, '{}'))
       and not exists (select 1 from recepcion_detalle d where d.recepcion_id = r.id);

    -- 2) El lote (ya sin kg por el trigger de recepcion_detalle). Nada lo referencia.
    delete from lotes where id = p_lote_id;

    -- 3) Constancia con el motivo (los lotes no se auditan fila a fila).
    perform fn_log('info', 'correccion',
        format('Lote %s anulado (%s kg de %s)%s', v_lote.codigo, v_lote.kg_inicial, v_lote.fecha,
               coalesce(': ' || nullif(trim(p_motivo), ''), '')),
        jsonb_build_object('lote_id', v_lote.id, 'codigo', v_lote.codigo, 'kg_inicial', v_lote.kg_inicial, 'costo_kg', v_lote.costo_kg, 'motivo', p_motivo),
        null, null);
end $$;

create or replace function fn_quitar_jaba(p_detalle_id uuid, p_motivo text default null)
returns boolean language plpgsql as $$
declare
    v_det       recepcion_detalle%rowtype;
    v_lote      lotes%rowtype;
    v_consumido numeric;
    v_restantes int;
    v_borrado   boolean := false;
begin
    select * into v_det from recepcion_detalle where id = p_detalle_id for update;
    if not found then raise exception 'Esa jaba ya no existe (quizá ya se quitó).'; end if;
    select * into v_lote from lotes where id = v_det.lote_id for update;

    -- Lo que ya se procesó del lote tiene que caber en las jabas que quedan.
    v_consumido := v_lote.kg_inicial - v_lote.kg_disponible;
    if v_consumido > v_lote.kg_inicial - v_det.kg_real + 0.0005 then
        raise exception 'Del lote % ya se procesaron % kg; sin esta jaba quedarían solo % kg. Corrige primero ese proceso.',
            v_lote.codigo, v_consumido, v_lote.kg_inicial - v_det.kg_real;
    end if;

    delete from recepcion_detalle where id = p_detalle_id;          -- el trigger recalcula el lote (y la cascada)
    delete from recepciones r
     where r.id = v_det.recepcion_id
       and not exists (select 1 from recepcion_detalle d where d.recepcion_id = r.id);

    select count(*) into v_restantes from recepcion_detalle where lote_id = v_lote.id;
    if v_restantes = 0
       and not exists (select 1 from proceso_entradas where lote_id = v_lote.id)
       and not exists (select 1 from proceso_salidas  where lote_id = v_lote.id) then
        delete from lotes where id = v_lote.id;                     -- misma razón que en fn_anular_lote
        v_borrado := true;
    end if;

    perform fn_log('info', 'correccion',
        format('Jaba de %s kg quitada del lote %s%s%s', v_det.kg_real, v_lote.codigo,
               case when v_borrado then ' (era la última: lote borrado)' else '' end,
               coalesce(': ' || nullif(trim(p_motivo), ''), '')),
        jsonb_build_object('detalle_id', v_det.id, 'recepcion_id', v_det.recepcion_id, 'lote_id', v_lote.id, 'codigo', v_lote.codigo,
                           'kg_real', v_det.kg_real, 'precio_kg', v_det.precio_kg, 'lote_borrado', v_borrado, 'motivo', p_motivo),
        null, null);
    return v_borrado;
end $$;

grant execute on function fn_editar_lote(uuid, date, text), fn_anular_lote(uuid, text), fn_quitar_jaba(uuid, text) to authenticated;
