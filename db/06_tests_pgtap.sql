-- =============================================================================
--  06 · PRUEBAS DE LA BASE (pgTAP)
--  Se corre en Supabase (SQL Editor) o en local. Todo va dentro de una
--  transacción que se revierte al final: NO deja datos.
--
--  Ejecutar completo. La última consulta muestra el detalle; cualquier
--  línea que empiece con "not ok" es una prueba fallida.
-- =============================================================================
create extension if not exists pgtap;

begin;
select plan(29);

-- Helpers locales -------------------------------------------------------------
create temp table _t (k text primary key, v text);
create or replace function _p(c text) returns int language sql as $$ select id from productos where codigo = c $$;
create or replace function _pr(c int) returns int language sql as $$ select id from proveedores where codigo = c $$;
create or replace function _lote(prov int, prod text, d date) returns lotes language sql as $$
    select * from lotes where codigo = fn_codigo_lote(prov, prod, d) $$;

-- -----------------------------------------------------------------------------
-- 1. Catálogo cargado
-- -----------------------------------------------------------------------------
select cmp_ok((select count(*) from productos), '>=', 120::bigint, 'catálogo de productos cargado');
select cmp_ok((select count(*) from proveedores), '>=', 160::bigint, 'catálogo de proveedores cargado');
select is((select nombre from productos where codigo = 'AR'), 'Pulpa res', 'AR es pulpa res');

-- -----------------------------------------------------------------------------
-- 2. Código de lote
-- -----------------------------------------------------------------------------
select is(fn_codigo_lote(131, 'AR', '2026-05-04'), '131AR040526', 'código = proveedor + producto + ddmmyy');
select is(fn_codigo_lote(null, 'EMC', '2026-02-03'), 'EMC030226', 'lote mezcla sin proveedor');

-- -----------------------------------------------------------------------------
-- 3. Recepción: dos jabas del mismo producto = un lote que suma kg
-- -----------------------------------------------------------------------------
insert into recepciones (id, fecha, proveedor_id) values ('11111111-1111-1111-1111-111111111111', '2026-05-04', _pr(131));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values
  ('11111111-1111-1111-1111-111111111111', _p('AR'), 70.0, 6.6),
  ('11111111-1111-1111-1111-111111111111', _p('AR'), 46.5, 6.6),
  ('11111111-1111-1111-1111-111111111111', _p('DR'),  7.1, 13.2);

select is((select count(*) from lotes where codigo like '131%040526'), 2::bigint, 'dos productos → dos lotes');
select is((_lote(131,'AR','2026-05-04')).kg_inicial, 116.500, 'las dos jabas suman en el lote');
select is((_lote(131,'AR','2026-05-04')).costo_kg, 6.6000, 'costo/kg del lote = precio de compra');
select is((_lote(131,'AR','2026-05-04')).estado, 'disponible'::estado_lote, 'lote nuevo disponible');

-- -----------------------------------------------------------------------------
-- 4. Proceso de limpieza (números del Excel original)
-- -----------------------------------------------------------------------------
insert into procesos (id, tipo_proceso_id, fecha) values ('22222222-2222-2222-2222-222222222222', (select id from tipos_proceso where codigo='LIMPIEZA'), '2026-05-05');
insert into proceso_entradas (proceso_id, lote_id, kg_tomados) values ('22222222-2222-2222-2222-222222222222', (_lote(131,'AR','2026-05-04')).id, 116.5);
insert into proceso_salidas (proceso_id, producto_id, rol, kg, precio_credito) values
  ('22222222-2222-2222-2222-222222222222', _p('ER'),  'subproducto', 8.90, 3.3),
  ('22222222-2222-2222-2222-222222222222', _p('ERE'), 'subproducto', 3.85, 4.5),
  ('22222222-2222-2222-2222-222222222222', _p('VNR'), 'merma',       5.15, null),
  ('22222222-2222-2222-2222-222222222222', _p('SGR'), 'merma',       0.20, null),
  ('22222222-2222-2222-2222-222222222222', _p('ARL'), 'principal',  89.20, null),
  ('22222222-2222-2222-2222-222222222222', _p('ARF'), 'principal',   9.20, null);
select fn_procesar('22222222-2222-2222-2222-222222222222');

select is((select costo_entrada from procesos where id='22222222-2222-2222-2222-222222222222'), 768.9000, 'costo de entrada = 116.5 × 6.6');
select is((select credito_subproductos from procesos where id='22222222-2222-2222-2222-222222222222'), 46.6950, 'crédito de subproductos');
select is((select costo_neto from procesos where id='22222222-2222-2222-2222-222222222222'), 722.2050, 'costo neto');
select is((_lote(131,'ARL','2026-05-05')).costo_kg, 7.3395, 'costo real del limpio = neto / kg principales');
select is((_lote(131,'ARF','2026-05-05')).costo_kg, 7.3395, 'para filetear lleva el mismo costo/kg');
select is((_lote(131,'ER','2026-05-05')).costo_kg, 3.3000, 'subproducto nace con su precio de crédito');
select is((_lote(131,'VNR','2026-05-05')).costo_kg, 0.0000, 'merma nace con costo 0');
select is((select kg_merma_no_reg from procesos where id='22222222-2222-2222-2222-222222222222'), 0.000, 'todo cuadró: sin merma no registrada');
select is((_lote(131,'AR','2026-05-04')).kg_disponible, 0.000, 'el lote padre quedó en 0');
select is((_lote(131,'AR','2026-05-04')).estado, 'agotado'::estado_lote, 'y marcado agotado');
select is((select count(*) from v_stock_lotes where codigo like '131VNR%'), 0::bigint, 'la merma no aparece como stock');

-- -----------------------------------------------------------------------------
-- 5. Devolución a cámara y molienda con costo ponderado
-- -----------------------------------------------------------------------------
insert into recepciones (id, fecha, proveedor_id) values ('33333333-3333-3333-3333-333333333333', '2026-05-05', _pr(16));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('33333333-3333-3333-3333-333333333333', _p('AR'), 37.9, 7.0);
insert into procesos (id, tipo_proceso_id, fecha) values ('44444444-4444-4444-4444-444444444444', (select id from tipos_proceso where codigo='LIMPIEZA'), '2026-05-06');
insert into proceso_entradas (proceso_id, lote_id, kg_tomados, kg_devueltos) values ('44444444-4444-4444-4444-444444444444', (_lote(16,'AR','2026-05-05')).id, 30, 2);
insert into proceso_salidas (proceso_id, producto_id, rol, kg, precio_credito) values
  ('44444444-4444-4444-4444-444444444444', _p('ER'),  'subproducto', 4.0, 4.0),
  ('44444444-4444-4444-4444-444444444444', _p('ARL'), 'principal',  24.0, null);
select fn_procesar('44444444-4444-4444-4444-444444444444');
select is((_lote(16,'AR','2026-05-05')).kg_disponible, 9.900, 'devolución: 37.9 − (30 − 2) = 9.9 disponibles');

insert into procesos (id, tipo_proceso_id, fecha) values ('55555555-5555-5555-5555-555555555555', (select id from tipos_proceso where codigo='MOLIENDA'), '2026-05-07');
insert into proceso_entradas (proceso_id, lote_id, kg_tomados) values
  ('55555555-5555-5555-5555-555555555555', (_lote(131,'ER','2026-05-05')).id, 8.9),
  ('55555555-5555-5555-5555-555555555555', (_lote(16,'ER','2026-05-06')).id, 4.0);
insert into proceso_salidas (proceso_id, producto_id, rol, kg, precio_credito, conserva_proveedor) values
  ('55555555-5555-5555-5555-555555555555', _p('EMC'), 'principal', 12.5, null, false),
  ('55555555-5555-5555-5555-555555555555', _p('SGR'), 'merma',      0.3, null, false);
select fn_procesar('55555555-5555-5555-5555-555555555555');
select is((_lote(null,'EMC','2026-05-07')).costo_kg, 3.6296, 'molida EMC: costo ponderado (8.9×3.3 + 4×4.0) / 12.5');
select is((_lote(null,'EMC','2026-05-07')).proveedor_id, null::int, 'lote mezcla sin proveedor');
select is((select kg_merma_no_reg from procesos where id='55555555-5555-5555-5555-555555555555'), 0.100, 'merma no registrada = 12.9 − 12.8');

-- -----------------------------------------------------------------------------
-- 6. Cascada: subir el precio de compra recalcula los hijos
-- -----------------------------------------------------------------------------
update recepcion_detalle set precio_kg = 7.0 where recepcion_id = '11111111-1111-1111-1111-111111111111' and producto_id = _p('AR');
select is((_lote(131,'AR','2026-05-04')).costo_kg, 7.0000, 'lote padre toma el nuevo precio');
select is((_lote(131,'ARL','2026-05-05')).costo_kg, 7.8131, 'el limpio se recalculó en cascada: (815.5 − 46.695)/98.4');

-- -----------------------------------------------------------------------------
-- 7. Protecciones
-- -----------------------------------------------------------------------------
select throws_like(
  $$ insert into proceso_entradas (proceso_id, lote_id, kg_tomados)
     values ('22222222-2222-2222-2222-222222222222', (select id from lotes where codigo = '131DR040526'), 50) $$,
  '%no tiene suficientes kilos%', 'no deja tomar más kilos de los disponibles');
select throws_like($$ select fn_crear_producto('XXR','Pulpa Res','R') $$, 'Ya existe:%', 'no deja crear un producto repetido');

-- -----------------------------------------------------------------------------
-- 8. Auditoría
-- -----------------------------------------------------------------------------
select cmp_ok((select count(*) from auditoria where tabla = 'recepcion_detalle' and operacion = 'UPDATE'), '>=', 1::bigint,
  'el cambio de precio quedó auditado');

select * from finish();
rollback;
