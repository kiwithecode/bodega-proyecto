-- =============================================================================
--  17 · ALARMAS DE VOLUMEN  —  compras de la semana y stock alto por producto
--  Ejecutar después de 10 y 11. Idempotente.
--
--  Dos umbrales en `parametros` (editables en Catálogos → Parámetros):
--    compras_max_semana_kg  1000  → alerta COMPRAS ALTAS (nivel 2) si un producto suma más kg recibidos en la semana en curso
--    stock_max_kg           1000  → alerta STOCK ALTO (nivel 3) si un producto tiene más kg en bodega.
--                                   Si el producto tiene "Ideal kg" en Stock, ese manda en vez del general.
--  El semáforo ALTO de Stock usa la misma regla. Definiciones vigentes de v_stock_semaforo y v_alertas.
-- =============================================================================
insert into parametros (clave, valor, descripcion) values
  ('compras_max_semana_kg', 1000, 'Kg de un mismo producto comprados en la semana (lunes a domingo) que disparan la alerta COMPRAS ALTAS'),
  ('stock_max_kg',          1000, 'Kg de un producto en bodega que disparan STOCK ALTO cuando el producto no tiene su propio Ideal kg')
on conflict (clave) do nothing;

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
         when d.kg_disponible > coalesce(sm.kg_ideal, fn_param('stock_max_kg')) then 'ALTO'
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


create or replace view v_alertas as
select 1 as nivel, 'SIN STOCK' as tipo, s.codigo as referencia,
       format('%s sin stock%s', s.producto,
              case when s.kg_por_dia > 0 then format(' (consumo %s kg/día)', s.kg_por_dia) else '' end) as mensaje,
       null::uuid as lote_id, null::uuid as proceso_id, s.producto_id
  from v_stock_semaforo s
 where s.semaforo = 'SIN STOCK' and (s.kg_minimo is not null or s.kg_por_dia > 0)
union all
select 2, 'STOCK BAJO', s.codigo,
       format('%s: %s kg disponibles%s%s', s.producto, s.kg_disponible,
              case when s.kg_minimo is not null then format(' (mínimo %s)', s.kg_minimo) else '' end,
              case when s.dias_cobertura is not null then format(', %s días de cobertura', s.dias_cobertura) else '' end),
       null, null, s.producto_id
  from v_stock_semaforo s
 where s.semaforo = 'BAJO'
union all
select case when current_date - l.fecha > 2 * lim then 1 else 3 end, 'LOTE VIEJO', l.codigo,
       format('%s de %s lleva %s días en cámara (%s kg)', po.nombre, coalesce(pr.nombre,'mezcla'),
              current_date - l.fecha, l.kg_disponible),
       l.id, null, l.producto_id
  from lotes l
  join productos po on po.id = l.producto_id
  left join proveedores pr on pr.id = l.proveedor_id
  cross join lateral (select case when l.origen = 'recepcion'
                                  then fn_param('dias_max_camara_mp')
                                  else fn_param('dias_max_camara_proc') end as lim) x
 where l.estado = 'disponible' and l.kg_disponible > 0
   and po.rol_defecto <> 'merma'
   and current_date - l.fecha > lim
union all
select 3, 'MERMA ALTA', p.id::text,
       format('Proceso %s del %s: %s kg sin justificar (%s%% de %s kg)', tp.nombre, to_char(p.fecha,'DD/MM'),
              p.kg_merma_no_reg, round(100*p.kg_merma_no_reg/p.kg_consumidos,1), p.kg_consumidos),
       null, p.id, null
  from procesos p join tipos_proceso tp on tp.id = p.tipo_proceso_id
 where p.procesado_at is not null and p.kg_consumidos > 0
   and 100 * p.kg_merma_no_reg / p.kg_consumidos > fn_param('merma_max_pct')
   and p.fecha >= current_date - 30
union all
-- 3i. Salidas mayores que la entrada: error de pesaje o de digitación
select 3, 'SOBRANTE', p.id::text,
       format('Proceso %s del %s: las salidas pesan %s kg más que la entrada (%s kg). Revisa el pesaje de la jaba o de las salidas.',
              tp.nombre, to_char(p.fecha,'DD/MM'), -p.kg_merma_no_reg, p.kg_consumidos),
       null, p.id, null
  from procesos p join tipos_proceso tp on tp.id = p.tipo_proceso_id
 where p.procesado_at is not null and p.kg_merma_no_reg < -0.0005
   and p.fecha >= current_date - 30
union all
select 3, 'PRECIO ATÍPICO', l.codigo,
       format('%s de %s a $%s/kg; promedio 60 días $%s (%s%%)', po.nombre, pr.nombre, d.precio_kg,
              h.prom, round(100*(d.precio_kg-h.prom)/h.prom)),
       l.id, null, po.id
  from recepcion_detalle d
  join recepciones r on r.id = d.recepcion_id
  join lotes l on l.id = d.lote_id
  join productos po on po.id = d.producto_id
  join proveedores pr on pr.id = r.proveedor_id
  join lateral (
        select round(sum(d2.kg_real*d2.precio_kg)/sum(d2.kg_real),4) as prom, count(distinct r2.id) as n
          from recepcion_detalle d2 join recepciones r2 on r2.id = d2.recepcion_id
         where d2.producto_id = d.producto_id and r2.id <> r.id
           and r2.fecha between r.fecha - 60 and r.fecha) h on true
 where r.fecha >= current_date - 14
   and h.n >= 2 and h.prom > 0
   and abs(d.precio_kg - h.prom) / h.prom * 100 > fn_param('precio_desvio_pct')
union all
select 2, 'PROCESO SIN CERRAR', p.id::text,
       format('Proceso %s del %s tiene entradas pero no se ha cerrado', tp.nombre, to_char(p.fecha,'DD/MM')),
       null, p.id, null
  from procesos p join tipos_proceso tp on tp.id = p.tipo_proceso_id
 where p.procesado_at is null
   and exists (select 1 from proceso_entradas where proceso_id = p.id)
   and p.created_at < now() - make_interval(hours => fn_param('horas_proceso_abierto')::int)
union all
-- 3j. Compras de la semana por producto por encima del límite (parametros.compras_max_semana_kg)
select 2, 'COMPRAS ALTAS', po.codigo,
       format('Compras de %s esta semana: %s kg (límite %s kg/semana)', po.nombre, sum(d.kg_real), fn_param('compras_max_semana_kg')),
       null, null, po.id
  from recepcion_detalle d
  join recepciones r on r.id = d.recepcion_id
  join productos po on po.id = d.producto_id
 where r.fecha >= date_trunc('week', current_date)::date
 group by po.id, po.nombre
having sum(d.kg_real) > fn_param('compras_max_semana_kg')
union all
-- 3k. Stock alto: más kilos en bodega que el ideal del producto o, si no tiene, que parametros.stock_max_kg
select 3, 'STOCK ALTO', s.codigo,
       format('%s: %s kg en bodega (límite %s kg)', s.producto, s.kg_disponible, coalesce(s.kg_ideal, fn_param('stock_max_kg'))),
       null, null, s.producto_id
  from v_stock_semaforo s
 where s.semaforo = 'ALTO'
union all
select 4, 'ACUMULAR', po.codigo,
       format('%s: %s kg en %s lotes esperando molienda/agrupación', po.nombre, sum(l.kg_disponible), count(*)),
       null, null, po.id
  from lotes l join productos po on po.id = l.producto_id
 where po.rol_defecto = 'subproducto' and l.estado = 'disponible' and l.kg_disponible > 0
 group by po.id, po.codigo, po.nombre
having count(*) >= 3
union all
select 4, 'CATÁLOGO', po.codigo, format('Código %s (%s) sigue por confirmar', po.codigo, po.nombre), null, null, po.id
  from productos po where po.por_confirmar and po.activo;


grant select on v_stock_semaforo, v_alertas, parametros to authenticated;
