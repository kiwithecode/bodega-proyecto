-- =============================================================================
--  14 · HORAS DEL PROCESO  —  a qué hora empezó y terminó cada proceso
--  Ejecutar después de 08 y 13. Es la definición vigente de v_trazabilidad (obrero, destino, cliente, horas). Idempotente.
--  Ambas opcionales. Si termina después de medianoche (fin < inicio) el frontend suma 24 h.
-- =============================================================================
alter table procesos add column if not exists hora_inicio time;
alter table procesos add column if not exists hora_fin    time;

create or replace view v_trazabilidad as
select hijo.codigo as lote_hijo, ps.rol, ps.kg as kg_salida, ps.costo_kg,
       p.id as proceso_id, tp.nombre as proceso, p.fecha as fecha_proceso,
       padre.codigo as lote_padre, pe.kg_tomados, pe.kg_devueltos, pe.costo_kg_aplicado,
       p.obrero,
       hijo.destino, hijo.cliente,
       p.hora_inicio, p.hora_fin
  from proceso_salidas ps
  join procesos p on p.id = ps.proceso_id
  join tipos_proceso tp on tp.id = p.tipo_proceso_id
  join lotes hijo on hijo.id = ps.lote_id
  join proceso_entradas pe on pe.proceso_id = p.id
  join lotes padre on padre.id = pe.lote_id;
grant select on v_trazabilidad to authenticated;
