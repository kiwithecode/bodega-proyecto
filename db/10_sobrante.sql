-- =============================================================================
--  10 · SOBRANTE  —  cuando las salidas de un proceso pesan MÁS que la entrada
--  Ejecutar después de 01–05 (y 07–09). Idempotente.
--
--  Físicamente no puede salir más carne de la que entró: si pasa, alguien pesó o
--  digitó mal (la jaba de entrada, o una salida). La bodega igual necesita cerrar
--  el proceso y seguir. fn_procesar ya lo permite: kg_merma_no_reg queda NEGATIVO
--  (= sobrante). Lo que faltaba:
--    · que ese negativo NO descuente merma en KPIs, serie diaria y rendimiento
--      (greatest(kg_merma_no_reg, 0)), y se exponga aparte como kg_sobrante;
--    · una alerta "SOBRANTE" para revisar el pesaje.
-- =============================================================================

-- 1) KPIs del período: merma nunca negativa + kg_sobrante nuevo (cambia el tipo de retorno → drop + create)
drop function if exists fn_kpis(date, date);
create function fn_kpis(p_desde date, p_hasta date)
returns table (
    kg_recibidos numeric, compras_usd numeric, recepciones bigint, proveedores_distintos bigint,
    kg_procesados numeric, kg_principal numeric, kg_subproductos numeric, kg_merma numeric,
    rendimiento_pct numeric, merma_pct numeric, credito_subproductos numeric,
    valor_stock_actual numeric, kg_stock_actual numeric, lotes_disponibles bigint,
    kg_sobrante numeric
) language sql stable as $$
    with rec as (
        select coalesce(sum(d.kg_real),0) kg, coalesce(sum(d.total),0) usd,
               count(distinct r.id) n, count(distinct r.proveedor_id) np
          from recepciones r join recepcion_detalle d on d.recepcion_id = r.id
         where r.fecha between p_desde and p_hasta),
    proc as (
        select coalesce(sum(p.kg_consumidos),0) kgc,
               coalesce(sum(sal.kgp),0) kgp,
               coalesce(sum(sal.kgs),0) kgs,
               coalesce(sum(sal.kgm),0) + coalesce(sum(greatest(p.kg_merma_no_reg, 0)),0) kgm,
               coalesce(sum(greatest(-p.kg_merma_no_reg, 0)),0) sobr,
               coalesce(sum(p.credito_subproductos),0) cred
          from procesos p
          left join lateral (
                select coalesce(sum(kg) filter (where rol='principal'),0)   kgp,
                       coalesce(sum(kg) filter (where rol='subproducto'),0) kgs,
                       coalesce(sum(kg) filter (where rol='merma'),0)       kgm
                  from proceso_salidas where proceso_id = p.id) sal on true
         where p.procesado_at is not null and p.fecha between p_desde and p_hasta),
    stock as (
        select coalesce(sum(kg_disponible*costo_kg),0) v, coalesce(sum(kg_disponible),0) k, count(*) n
          from lotes where estado = 'disponible')
    select rec.kg, rec.usd, rec.n, rec.np,
           proc.kgc, proc.kgp, proc.kgs, proc.kgm,
           case when proc.kgc > 0 then round(100*proc.kgp/proc.kgc,1) end,
           case when proc.kgc > 0 then round(100*proc.kgm/proc.kgc,1) end,
           proc.cred,
           round(stock.v,2), stock.k, stock.n,
           proc.sobr
      from rec, proc, stock;
$$;
grant execute on function fn_kpis(date, date) to authenticated;

-- 2) Serie diaria: merma sin negativos + columna kg_sobrante al final
create or replace view v_metricas_diarias as
with dias as (
    select fecha from recepciones union select fecha from procesos where procesado_at is not null),
rec as (
    select r.fecha, sum(d.kg_real) kg_recibidos, sum(d.total) compras_usd
      from recepciones r join recepcion_detalle d on d.recepcion_id = r.id group by r.fecha),
proc as (
    select p.fecha, sum(p.kg_consumidos) kg_procesados,
           sum(p.costo_neto) costo_neto, sum(p.credito_subproductos) credito,
           sum(greatest(p.kg_merma_no_reg, 0)) merma_no_reg,
           sum(greatest(-p.kg_merma_no_reg, 0)) sobrante
      from procesos p where p.procesado_at is not null group by p.fecha),
sal as (
    select p.fecha,
           sum(s.kg) filter (where s.rol='principal')   kg_principal,
           sum(s.kg) filter (where s.rol='subproducto') kg_subproductos,
           sum(s.kg) filter (where s.rol='merma')       kg_merma
      from proceso_salidas s join procesos p on p.id = s.proceso_id
     where p.procesado_at is not null group by p.fecha)
select d.fecha,
       coalesce(rec.kg_recibidos,0) kg_recibidos, coalesce(rec.compras_usd,0) compras_usd,
       coalesce(proc.kg_procesados,0) kg_procesados,
       coalesce(sal.kg_principal,0) kg_principal, coalesce(sal.kg_subproductos,0) kg_subproductos,
       coalesce(sal.kg_merma,0) + coalesce(proc.merma_no_reg,0) kg_merma,
       coalesce(proc.credito,0) credito_subproductos, coalesce(proc.costo_neto,0) costo_neto,
       case when proc.kg_procesados > 0 then round(100*sal.kg_principal/proc.kg_procesados,1) end rendimiento_pct,
       coalesce(proc.sobrante,0) kg_sobrante
  from dias d
  left join rec  on rec.fecha  = d.fecha
  left join proc on proc.fecha = d.fecha
  left join sal  on sal.fecha  = d.fecha
 order by d.fecha;

-- 3) Rendimiento por proveedor: la merma no se descuenta con sobrantes
create or replace view v_rendimiento_proveedor as
select pr.codigo proveedor_codigo, pr.nombre proveedor, po.codigo producto_codigo, po.nombre producto,
       count(distinct p.id)                                          procesos,
       sum(pe.kg_tomados - pe.kg_devueltos)                          kg_entrada,
       sum(sal.kg_principal)                                         kg_principal,
       round(100 * sum(sal.kg_principal) / nullif(sum(pe.kg_tomados - pe.kg_devueltos),0), 1) rendimiento_pct,
       round(100 * sum(sal.kg_merma + greatest(p.kg_merma_no_reg, 0)) / nullif(sum(pe.kg_tomados - pe.kg_devueltos),0), 1) merma_pct,
       round(avg(pe.costo_kg_aplicado), 4)                           costo_compra_kg,
       round(sum(p.costo_neto) / nullif(sum(sal.kg_principal),0), 4) costo_real_kg
  from procesos p
  join proceso_entradas pe on pe.proceso_id = p.id
  join lotes l on l.id = pe.lote_id
  join productos po on po.id = l.producto_id
  join proveedores pr on pr.id = l.proveedor_id
  join lateral (
        select coalesce(sum(kg) filter (where rol='principal'),0) kg_principal,
               coalesce(sum(kg) filter (where rol='merma'),0)     kg_merma
          from proceso_salidas where proceso_id = p.id) sal on true
 where p.procesado_at is not null
   and (select count(*) from proceso_entradas where proceso_id = p.id) = 1
 group by pr.codigo, pr.nombre, po.codigo, po.nombre;

-- 4) Alerta SOBRANTE (nivel 3) en procesos de los últimos 30 días. Misma vista de 04 + bloque 3i.
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

grant select on v_metricas_diarias, v_rendimiento_proveedor, v_alertas to authenticated;
