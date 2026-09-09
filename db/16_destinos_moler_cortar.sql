-- =============================================================================
--  16 · DESTINOS "PARA MOLER" Y "PARA CORTAR"
--  Ejecutar después de 13. Idempotente.
--
--  Además de stock y pedido, una salida puede ir:
--    moler   → industrial corriente / especial que espera molienda   (lote 131ER050526-MOLER)
--    cortar  → goulash corriente / especial que espera corte           (lote 131GCR050526-CORTAR)
--  El sufijo separa esos kilos de los que quedan en stock normal, y Stock → Por lote
--  los filtra como "Para moler" / "Para cortar". Cuando se procesan (molienda / corte)
--  se consumen como cualquier lote de entrada.
-- =============================================================================

alter table proceso_salidas drop constraint if exists proceso_salidas_destino_check;
alter table proceso_salidas add constraint proceso_salidas_destino_check check (destino in ('stock','pedido','moler','cortar'));
alter table lotes drop constraint if exists lotes_destino_check;
alter table lotes add constraint lotes_destino_check check (destino in ('stock','pedido','moler','cortar'));
drop index if exists lotes_destino_idx;
create index if not exists lotes_destino_idx on lotes(destino) where destino <> 'stock';

-- Sufijo del código según destino (null para stock).
create or replace function fn_sufijo_destino(p_destino text, p_cliente text)
returns text language sql immutable as $$
    select case p_destino
             when 'pedido' then fn_sufijo_pedido(p_cliente)
             when 'moler'  then '-MOLER'
             when 'cortar' then '-CORTAR'
             else null end
$$;

-- fn_procesar: igual que en 13, usando fn_sufijo_destino para todos los destinos.
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

    for s in select * from proceso_salidas where proceso_id = p_proceso_id loop
        v_lote_ant := s.lote_id;

        if s.rol = 'devolucion' then
            update proceso_salidas set costo_kg = 0, lote_id = null where id = s.id;
        else
            v_lote := fn_obtener_lote(
                s.producto_id,
                case when s.conserva_proveedor then v_prov else null end,
                v_fecha, 'proceso',
                fn_sufijo_destino(s.destino, s.cliente));

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

            -- el lote hijo recuerda para quién se elaboró
            update lotes
               set destino = s.destino,
                   cliente = case when s.destino = 'pedido' then nullif(trim(s.cliente), '') else null end
             where id = v_lote and (destino is distinct from s.destino or cliente is distinct from nullif(trim(s.cliente), ''));

            perform fn_actualizar_lote(v_lote);
        end if;

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

grant execute on function fn_sufijo_destino(text, text) to authenticated;
