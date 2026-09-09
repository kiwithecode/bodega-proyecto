-- =============================================================================
--  11 · NIVEL "ALTO" DE STOCK  —  semáforo con cuatro estados y kg ideal editable
--  Ejecutar después de 01–05. Idempotente.
--
--  stock_minimos ya tenía kg_ideal pero nadie lo usaba. Ahora:
--    SIN STOCK  kg = 0                          (rojo)
--    BAJO       kg < mínimo, o < 2 días de cobertura   (ámbar)
--    ALTO       kg > ideal (si el producto tiene ideal)  (azul)  ← nuevo
--    OK         lo demás                        (verde)
--  Mínimo e ideal se editan en Stock → Por producto; cualquiera puede quedar vacío.
-- =============================================================================

alter table stock_minimos alter column kg_minimo drop not null;
alter table stock_minimos drop constraint if exists stock_minimos_kg_ideal_check;
alter table stock_minimos add constraint stock_minimos_kg_ideal_check check (kg_ideal is null or kg_ideal >= 0);

create or replace view v_stock_semaforo as
with disp as (
    select producto_id,
           sum(kg_disponible)                                       as kg_disponible,
           count(*) filter (where kg_disponible > 0)                as lotes,
           min(fecha) filter (where kg_disponible > 0)              as lote_mas_antiguo,
           round(sum(kg_disponible*costo_kg)/nullif(sum(kg_disponible),0),4) as costo_kg_prom,
           max(fecha)                                               as ultimo_ingreso
      from lotes where estado <> 'anulado'
     group by producto_id
)
select po.id as producto_id, po.codigo, po.nombre as producto, e.nombre as especie, po.rol_defecto,
       coalesce(d.kg_disponible,0)            as kg_disponible,
       coalesce(d.lotes,0)                    as lotes,
       d.lote_mas_antiguo,
       current_date - d.lote_mas_antiguo      as dias_lote_mas_antiguo,
       d.ultimo_ingreso,
       d.costo_kg_prom,
       round(coalesce(d.kg_disponible,0) * coalesce(d.costo_kg_prom,0), 2) as valor_stock,
       sm.kg_minimo, sm.kg_ideal,
       c.kg_por_dia,
       case when c.kg_por_dia > 0 then round(coalesce(d.kg_disponible,0) / c.kg_por_dia, 1) end as dias_cobertura,
       case
         when coalesce(d.kg_disponible,0) <= 0                            then 'SIN STOCK'
         when sm.kg_minimo is not null and d.kg_disponible < sm.kg_minimo then 'BAJO'
         when c.kg_por_dia > 0 and d.kg_disponible / c.kg_por_dia < 2     then 'BAJO'
         when sm.kg_ideal is not null and d.kg_disponible > sm.kg_ideal   then 'ALTO'
         else 'OK'
       end as semaforo
  from productos po
  left join especies e on e.id = po.especie_id
  left join disp d  on d.producto_id = po.id
  left join stock_minimos sm on sm.producto_id = po.id
  left join v_consumo_producto c on c.producto_id = po.id
 where po.activo
   and po.rol_defecto <> 'merma'
   and (d.producto_id is not null or sm.producto_id is not null);

grant select on v_stock_semaforo to authenticated;
