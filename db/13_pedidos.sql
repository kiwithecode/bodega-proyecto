-- =============================================================================
--  13 · PEDIDOS  —  salidas de proceso "para stock" o "para el pedido de un cliente"
--  Ejecutar después de 01–05 y 08 (redefine v_trazabilidad con la columna obrero). Idempotente.
--
--  La misma pulpa limpia puede salir para la cámara (stock) o elaborarse para un
--  cliente concreto (pedido). Para trazabilidad esos kilos NO deben caer en el mismo
--  lote: el lote de pedido lleva sufijo con el cliente, p. ej.
--      131ARL050526            ← stock
--      131ARL050526-SUPERMAXI  ← pedido para "Supermaxi" (mismo cliente el mismo día se suma)
--  y guarda destino='pedido' y el nombre del cliente.
-- =============================================================================

alter table proceso_salidas add column if not exists destino text not null default 'stock';
alter table proceso_salidas drop constraint if exists proceso_salidas_destino_check;
alter table proceso_salidas add constraint proceso_salidas_destino_check check (destino in ('stock','pedido'));
alter table proceso_salidas add column if not exists cliente text;

alter table lotes add column if not exists destino text not null default 'stock';
alter table lotes drop constraint if exists lotes_destino_check;
alter table lotes add constraint lotes_destino_check check (destino in ('stock','pedido'));
alter table lotes add column if not exists cliente text;
create index if not exists lotes_destino_idx on lotes(destino) where destino = 'pedido';

-- Sufijo del código para un pedido: "-" + cliente en mayúsculas sin acentos ni símbolos (máx. 12), o "-PEDIDO".
create or replace function fn_sufijo_pedido(p_cliente text)
returns text language sql immutable as $$
    select '-' || coalesce(nullif(left(upper(regexp_replace(unaccent(coalesce(p_cliente,'')), '[^A-Za-z0-9]', '', 'g')), 12), ''), 'PEDIDO')
$$;

-- fn_obtener_lote con sufijo opcional (reemplaza la de 01; las llamadas de 4 argumentos siguen funcionando).
drop function if exists fn_obtener_lote(int, int, date, origen_lote);
create function fn_obtener_lote(p_producto_id int, p_proveedor_id int, p_fecha date, p_origen origen_lote, p_sufijo text default null)
returns uuid language plpgsql as $$
declare
    v_codigo text;
    v_id     uuid;
begin
    select fn_codigo_lote(pr.codigo, po.codigo, p_fecha) || coalesce(p_sufijo, '')
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

-- fn_procesar: igual que en 01, pero las salidas con destino='pedido' van a su propio lote hijo.
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
                case when s.destino = 'pedido' then fn_sufijo_pedido(s.cliente) else null end);

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

-- Vistas: mismas columnas + destino y cliente al final.
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
       l.estado,
       l.destino, l.cliente
  from lotes l
  join productos po on po.id = l.producto_id
  left join especies e on e.id = po.especie_id
  left join proveedores pr on pr.id = l.proveedor_id
 where l.estado = 'disponible'
   and po.rol_defecto <> 'merma';

create or replace view v_trazabilidad as
select hijo.codigo as lote_hijo, ps.rol, ps.kg as kg_salida, ps.costo_kg,
       p.id as proceso_id, tp.nombre as proceso, p.fecha as fecha_proceso,
       padre.codigo as lote_padre, pe.kg_tomados, pe.kg_devueltos, pe.costo_kg_aplicado,
       p.obrero,
       hijo.destino, hijo.cliente
  from proceso_salidas ps
  join procesos p on p.id = ps.proceso_id
  join tipos_proceso tp on tp.id = p.tipo_proceso_id
  join lotes hijo on hijo.id = ps.lote_id
  join proceso_entradas pe on pe.proceso_id = p.id
  join lotes padre on padre.id = pe.lote_id;

-- Clientes ya usados, el más reciente primero (autocompletado en Procesar).
create or replace function fn_clientes()
returns table (cliente text, pedidos bigint, ultimo date) language sql stable as $$
    select cliente, count(*), max(fecha) from lotes
     where destino = 'pedido' and nullif(trim(cliente), '') is not null
     group by cliente order by max(fecha) desc, count(*) desc
$$;
grant execute on function fn_obtener_lote(int, int, date, origen_lote, text), fn_sufijo_pedido(text), fn_clientes() to authenticated;
grant select on v_stock_lotes, v_trazabilidad to authenticated;
