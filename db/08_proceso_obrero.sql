-- =============================================================================
--  08 · QUIÉN PROCESÓ  —  nombre del obrero que hizo cada proceso
--  Ejecutar después de 01–05 (y 07). Idempotente.
--
--  Texto libre (no hay catálogo de personal): la pantalla Procesar sugiere los
--  nombres ya usados. Queda auditado como cualquier columna de `procesos` y se
--  ve en la trazabilidad de cada lote hijo.
-- =============================================================================

alter table procesos add column if not exists obrero text;

-- v_trazabilidad: misma definición de 01_schema.sql + `obrero` al final
-- (create or replace view solo permite agregar columnas al final).
create or replace view v_trazabilidad as
select hijo.codigo as lote_hijo, ps.rol, ps.kg as kg_salida, ps.costo_kg,
       p.id as proceso_id, tp.nombre as proceso, p.fecha as fecha_proceso,
       padre.codigo as lote_padre, pe.kg_tomados, pe.kg_devueltos, pe.costo_kg_aplicado,
       p.obrero
  from proceso_salidas ps
  join procesos p on p.id = ps.proceso_id
  join tipos_proceso tp on tp.id = p.tipo_proceso_id
  join lotes hijo on hijo.id = ps.lote_id
  join proceso_entradas pe on pe.proceso_id = p.id
  join lotes padre on padre.id = pe.lote_id;

-- Nombres ya usados, el más reciente primero (para el autocompletado de Procesar).
create or replace function fn_obreros()
returns table (obrero text, procesos bigint, ultimo date) language sql stable as $$
    select obrero, count(*), max(fecha)
      from procesos where nullif(trim(obrero), '') is not null
     group by obrero order by max(fecha) desc, count(*) desc
$$;
grant execute on function fn_obreros() to authenticated;
