-- =============================================================================
--  04 · MÉTRICAS Y ALERTAS  (monitoreo de la bodega)
--  Ejecutar después de 01, 02 y 03.
--
--  Nada de esto requiere digitar información adicional: se calcula sobre las
--  recepciones, procesos y lotes que ya existen.  Lo único opcional es fijar
--  el mínimo de stock por producto (tabla stock_minimos).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PARÁMETROS
-- -----------------------------------------------------------------------------
create table if not exists parametros (
    clave   text primary key,
    valor   numeric not null,
    descripcion text
);
insert into parametros (clave, valor, descripcion) values
  ('dias_max_camara_mp',     5,  'Días que un lote de materia prima puede estar en cámara antes de alertar'),
  ('dias_max_camara_proc',   7,  'Días para lotes ya procesados (limpio, subproductos)'),
  ('merma_max_pct',          3,  '% de merma NO registrada por proceso que dispara alerta'),
  ('precio_desvio_pct',     25,  '% de desvío del precio de compra frente al promedio de 60 días'),
  ('dias_consumo_promedio', 30,  'Ventana para calcular consumo diario y días de cobertura'),
  ('horas_proceso_abierto', 24,  'Horas que un proceso puede quedar sin cerrar (sin fn_procesar)')
on conflict (clave) do nothing;

create or replace function fn_param(p_clave text) returns numeric
language sql stable as $$ select valor from parametros where clave = p_clave $$;

-- Mínimo de stock por producto.  Si un producto no está aquí, solo se alerta
-- cuando llega a cero habiendo tenido movimiento.
create table if not exists stock_minimos (
    producto_id  int primary key references productos(id),
    kg_minimo    numeric(12,3) not null check (kg_minimo >= 0),
    kg_ideal     numeric(12,3),
    notas        text,
    updated_at   timestamptz not null default now()
);

alter table parametros    enable row level security;
alter table stock_minimos enable row level security;
drop policy if exists parametros_auth    on parametros;
drop policy if exists stock_minimos_auth on stock_minimos;
create policy parametros_auth    on parametros    for all to authenticated using (true) with check (true);
create policy stock_minimos_auth on stock_minimos for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 2. CONSUMO Y COBERTURA
--    consumo diario = kg que salieron a proceso en los últimos N días / N
--    días de cobertura = kg disponibles / consumo diario
-- -----------------------------------------------------------------------------
create or replace view v_consumo_producto as
select l.producto_id,
       sum(pe.kg_tomados - pe.kg_devueltos)                                          as kg_consumidos_ventana,
       round(sum(pe.kg_tomados - pe.kg_devueltos) / fn_param('dias_consumo_promedio'), 3) as kg_por_dia
  from proceso_entradas pe
  join procesos p on p.id = pe.proceso_id
  join lotes l    on l.id = pe.lote_id
 where p.fecha >= current_date - (fn_param('dias_consumo_promedio'))::int
 group by l.producto_id;

-- Semáforo de stock: una fila por producto que alguna vez tuvo lotes
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
         when coalesce(d.kg_disponible,0) <= 0                          then 'SIN STOCK'
         when sm.kg_minimo is not null and d.kg_disponible < sm.kg_minimo then 'BAJO'
         when c.kg_por_dia > 0 and d.kg_disponible / c.kg_por_dia < 2     then 'BAJO'
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

-- -----------------------------------------------------------------------------
-- 3. ALERTAS  (una vista; la pantalla la lee y pinta por nivel)
--    nivel: 1 crítico · 2 alto · 3 medio · 4 aviso
-- -----------------------------------------------------------------------------
create or replace view v_alertas as
-- 3a. Sin stock de un producto con mínimo definido o que tuvo movimiento
select 1 as nivel, 'SIN STOCK' as tipo, s.codigo as referencia,
       format('%s sin stock%s', s.producto,
              case when s.kg_por_dia > 0 then format(' (consumo %s kg/día)', s.kg_por_dia) else '' end) as mensaje,
       null::uuid as lote_id, null::uuid as proceso_id, s.producto_id
  from v_stock_semaforo s
 where s.semaforo = 'SIN STOCK' and (s.kg_minimo is not null or s.kg_por_dia > 0)

union all
-- 3b. Stock bajo mínimo o con menos de 2 días de cobertura
select 2, 'STOCK BAJO', s.codigo,
       format('%s: %s kg disponibles%s%s', s.producto, s.kg_disponible,
              case when s.kg_minimo is not null then format(' (mínimo %s)', s.kg_minimo) else '' end,
              case when s.dias_cobertura is not null then format(', %s días de cobertura', s.dias_cobertura) else '' end),
       null, null, s.producto_id
  from v_stock_semaforo s
 where s.semaforo = 'BAJO'

union all
-- 3c. Lote demasiado tiempo en cámara
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
-- 3d. Merma no registrada alta en un proceso (kilos que no cuadraron)
select 3, 'MERMA ALTA', p.id::text,
       format('Proceso %s del %s: %s kg sin justificar (%s%% de %s kg)', tp.nombre, to_char(p.fecha,'DD/MM'),
              p.kg_merma_no_reg, round(100*p.kg_merma_no_reg/p.kg_consumidos,1), p.kg_consumidos),
       null, p.id, null
  from procesos p join tipos_proceso tp on tp.id = p.tipo_proceso_id
 where p.procesado_at is not null and p.kg_consumidos > 0
   and 100 * p.kg_merma_no_reg / p.kg_consumidos > fn_param('merma_max_pct')
   and p.fecha >= current_date - 30

union all
-- 3e. Precio de compra fuera de lo normal (vs promedio 60 días del mismo producto)
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
-- 3f. Proceso abierto sin cerrar (digitaron entradas pero nunca llamaron fn_procesar)
select 2, 'PROCESO SIN CERRAR', p.id::text,
       format('Proceso %s del %s tiene entradas pero no se ha cerrado', tp.nombre, to_char(p.fecha,'DD/MM')),
       null, p.id, null
  from procesos p join tipos_proceso tp on tp.id = p.tipo_proceso_id
 where p.procesado_at is null
   and exists (select 1 from proceso_entradas where proceso_id = p.id)
   and p.created_at < now() - make_interval(hours => fn_param('horas_proceso_abierto')::int)

union all
-- 3g. Subproductos acumulándose sin agrupar (industrial, goulash)
select 4, 'ACUMULAR', po.codigo,
       format('%s: %s kg en %s lotes esperando molienda/agrupación', po.nombre, sum(l.kg_disponible), count(*)),
       null, null, po.id
  from lotes l join productos po on po.id = l.producto_id
 where po.rol_defecto = 'subproducto' and l.estado = 'disponible' and l.kg_disponible > 0
 group by po.id, po.codigo, po.nombre
having count(*) >= 3

union all
-- 3h. Catálogo pendiente
select 4, 'CATÁLOGO', po.codigo, format('Código %s (%s) sigue por confirmar', po.codigo, po.nombre), null, null, po.id
  from productos po where po.por_confirmar and po.activo;

-- Contador para el badge de la pantalla
create or replace function fn_alertas_resumen()
returns table (nivel int, cantidad bigint)
language sql stable as $$
    select nivel, count(*) from v_alertas group by nivel order by nivel;
$$;

-- -----------------------------------------------------------------------------
-- 4. MÉTRICAS
-- -----------------------------------------------------------------------------

-- 4a. KPIs de un período (para las tarjetas del tablero)
create or replace function fn_kpis(p_desde date, p_hasta date)
returns table (
    kg_recibidos numeric, compras_usd numeric, recepciones bigint, proveedores_distintos bigint,
    kg_procesados numeric, kg_principal numeric, kg_subproductos numeric, kg_merma numeric,
    rendimiento_pct numeric, merma_pct numeric, credito_subproductos numeric,
    valor_stock_actual numeric, kg_stock_actual numeric, lotes_disponibles bigint
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
               coalesce(sum(sal.kgm),0) + coalesce(sum(p.kg_merma_no_reg),0) kgm,
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
           round(stock.v,2), stock.k, stock.n
      from rec, proc, stock;
$$;

-- 4b. Serie diaria (para el gráfico de barras/líneas)
create or replace view v_metricas_diarias as
with dias as (
    select fecha from recepciones union select fecha from procesos where procesado_at is not null),
rec as (
    select r.fecha, sum(d.kg_real) kg_recibidos, sum(d.total) compras_usd
      from recepciones r join recepcion_detalle d on d.recepcion_id = r.id group by r.fecha),
proc as (
    select p.fecha, sum(p.kg_consumidos) kg_procesados,
           sum(p.costo_neto) costo_neto, sum(p.credito_subproductos) credito,
           sum(p.kg_merma_no_reg) merma_no_reg
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
       case when proc.kg_procesados > 0 then round(100*sal.kg_principal/proc.kg_procesados,1) end rendimiento_pct
  from dias d
  left join rec  on rec.fecha  = d.fecha
  left join proc on proc.fecha = d.fecha
  left join sal  on sal.fecha  = d.fecha
 order by d.fecha;

-- 4c. Rendimiento por proveedor y producto (¿quién trae mejor carne?)
create or replace view v_rendimiento_proveedor as
select pr.codigo proveedor_codigo, pr.nombre proveedor, po.codigo producto_codigo, po.nombre producto,
       count(distinct p.id)                                          procesos,
       sum(pe.kg_tomados - pe.kg_devueltos)                          kg_entrada,
       sum(sal.kg_principal)                                         kg_principal,
       round(100 * sum(sal.kg_principal) / nullif(sum(pe.kg_tomados - pe.kg_devueltos),0), 1) rendimiento_pct,
       round(100 * sum(sal.kg_merma + p.kg_merma_no_reg) / nullif(sum(pe.kg_tomados - pe.kg_devueltos),0), 1) merma_pct,
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
   and (select count(*) from proceso_entradas where proceso_id = p.id) = 1   -- solo procesos de un solo lote
 group by pr.codigo, pr.nombre, po.codigo, po.nombre;

-- 4d. Tendencia semanal del costo real por producto
create or replace view v_costo_semanal as
select po.codigo producto_codigo, po.nombre producto,
       date_trunc('week', l.fecha)::date semana,
       round(sum(l.kg_inicial*l.costo_kg)/nullif(sum(l.kg_inicial),0),4) costo_kg,
       sum(l.kg_inicial) kg
  from lotes l join productos po on po.id = l.producto_id
 where l.kg_inicial > 0
 group by po.codigo, po.nombre, date_trunc('week', l.fecha)
 order by po.codigo, semana;

-- 4e. Top proveedores del período (por $ y kg)
create or replace view v_compras_proveedor as
select pr.codigo proveedor_codigo, pr.nombre proveedor,
       date_trunc('month', r.fecha)::date mes,
       count(distinct r.id) recepciones, sum(d.kg_real) kg, round(sum(d.total),2) usd,
       round(sum(d.total)/sum(d.kg_real),4) precio_prom_kg
  from recepciones r
  join recepcion_detalle d on d.recepcion_id = r.id
  join proveedores pr on pr.id = r.proveedor_id
 group by pr.codigo, pr.nombre, date_trunc('month', r.fecha);

grant select on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
