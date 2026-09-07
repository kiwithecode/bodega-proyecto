-- =============================================================================
--  07 · PRUEBAS de fn_editar_lote y fn_anular_lote (pgTAP)
--  Requiere 01–05 y 07_correcciones.sql. Todo dentro de una transacción que se
--  revierte al final: NO deja datos. Cualquier línea "not ok" es una falla.
-- =============================================================================
create extension if not exists pgtap;

begin;
select plan(26);

-- Si estas dos fallan, falta cargar 07_correcciones.sql: todo lo demás va a fallar también.
select has_function('fn_editar_lote', array['uuid','date','text'], 'existe fn_editar_lote (cargar 07_correcciones.sql)');
select has_function('fn_anular_lote', array['uuid','text'], 'existe fn_anular_lote (cargar 07_correcciones.sql)');

create or replace function _p(c text) returns int language sql as $$ select id from productos where codigo = c $$;
create or replace function _pr(c int) returns int language sql as $$ select id from proveedores where codigo = c $$;
create or replace function _lote(prov int, prod text, d date) returns lotes language sql as $$
    select * from lotes where codigo = fn_codigo_lote(prov, prod, d) $$;

-- Recepción con dos productos (AR en dos jabas, DR en una) ---------------------
insert into recepciones (id, fecha, proveedor_id) values ('a1111111-1111-1111-1111-111111111111', '2026-05-04', _pr(131));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values
  ('a1111111-1111-1111-1111-111111111111', _p('AR'), 70.0, 6.6),
  ('a1111111-1111-1111-1111-111111111111', _p('AR'), 46.5, 6.6),
  ('a1111111-1111-1111-1111-111111111111', _p('DR'),  7.1, 13.2);

-- -----------------------------------------------------------------------------
-- 1. Editar fecha
-- -----------------------------------------------------------------------------
select lives_ok($$ select fn_editar_lote((_lote(131,'AR','2026-05-04')).id, '2026-05-03'::date, 'fecha mal digitada') $$, 'editar fecha de un lote recibido');
select is((_lote(131,'AR','2026-05-03')).codigo, '131AR030526', 'el código se rearma con la nueva fecha');
select is((_lote(131,'AR','2026-05-03')).kg_inicial, 116.500, 'los kg no cambian');
select is((_lote(131,'AR','2026-05-03')).costo_kg, 6.6000, 'el costo no cambia');
select is((_lote(131,'AR','2026-05-03')).observaciones, 'fecha mal digitada', 'guarda la observación');
select is((select fecha from recepciones where id = 'a1111111-1111-1111-1111-111111111111'), '2026-05-04'::date,
  'la recepción conserva su fecha porque también trae DR');
select is((select count(*) from recepcion_detalle where lote_id = (_lote(131,'AR','2026-05-03')).id), 2::bigint, 'las jabas siguen colgadas del lote');

-- Recepción de un solo producto: la fecha se hereda
insert into recepciones (id, fecha, proveedor_id) values ('a2222222-2222-2222-2222-222222222222', '2026-05-10', _pr(16));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('a2222222-2222-2222-2222-222222222222', _p('AR'), 37.9, 7.0);
select fn_editar_lote((_lote(16,'AR','2026-05-10')).id, '2026-05-09'::date);
select is((select fecha from recepciones where id = 'a2222222-2222-2222-2222-222222222222'), '2026-05-09'::date,
  'la recepción hereda la fecha cuando todas sus jabas son del lote');

-- Protecciones
select throws_like($$ select fn_editar_lote((_lote(131,'AR','2026-05-03')).id, (current_date + 1)::date) $$, '%no puede ser futura%', 'no acepta fecha futura');
insert into recepciones (id, fecha, proveedor_id) values ('a3333333-3333-3333-3333-333333333333', '2026-05-02', _pr(131));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('a3333333-3333-3333-3333-333333333333', _p('AR'), 10, 6.0);
select throws_like($$ select fn_editar_lote((_lote(131,'AR','2026-05-03')).id, '2026-05-02'::date) $$, 'Ya existe el lote 131AR020526%', 'no pisa un lote que ya existe con esa fecha');
select is((_lote(131,'AR','2026-05-03')).codigo, '131AR030526', 'tras el error el lote queda intacto');

-- Lote consumido en un proceso: puede cambiar la fecha, pero no a después del proceso
insert into procesos (id, tipo_proceso_id, fecha) values ('b1111111-1111-1111-1111-111111111111', (select id from tipos_proceso where codigo='LIMPIEZA'), '2026-05-06');
insert into proceso_entradas (proceso_id, lote_id, kg_tomados) values ('b1111111-1111-1111-1111-111111111111', (_lote(131,'AR','2026-05-03')).id, 50);
insert into proceso_salidas (proceso_id, producto_id, rol, kg, precio_credito) values
  ('b1111111-1111-1111-1111-111111111111', _p('ARL'), 'principal', 45, null),
  ('b1111111-1111-1111-1111-111111111111', _p('VNR'), 'merma',      5, null);
select fn_procesar('b1111111-1111-1111-1111-111111111111');
select throws_like($$ select fn_editar_lote((_lote(131,'AR','2026-05-03')).id, '2026-05-07'::date) $$, '%se procesó el 06/05/2026%', 'no acepta fecha posterior al proceso que lo consumió');
select lives_ok($$ select fn_editar_lote((_lote(131,'AR','2026-05-03')).id, '2026-05-01'::date) $$, 'sí acepta una fecha anterior al proceso');
select is((select count(*) from v_trazabilidad where lote_padre = '131AR010526'), 2::bigint, 'la trazabilidad sigue al lote con su nuevo código (una fila por salida)');
select throws_like($$ select fn_editar_lote((_lote(131,'ARL','2026-05-06')).id, '2026-05-05'::date) $$, '%salió de un proceso%', 'un lote hijo se corrige en el proceso, no aquí');

-- -----------------------------------------------------------------------------
-- 2. Anular
-- -----------------------------------------------------------------------------
select throws_like($$ select fn_anular_lote((_lote(131,'AR','2026-05-01')).id) $$, '%ya se usó en 1 proceso%', 'no anula un lote del que ya se tomaron kg');
select throws_like($$ select fn_anular_lote((_lote(131,'ARL','2026-05-06')).id) $$, '%salió de un proceso%', 'no anula un lote hijo');

-- DR comparte recepción con AR: se van sus jabas y su lote, la recepción se queda
select lives_ok($$ select fn_anular_lote((_lote(131,'DR','2026-05-04')).id, 'era otro producto') $$, 'anular el lote DR');
select is((select count(*) from lotes where codigo = '131DR040526'), 0::bigint, 'el lote desaparece');
select is((select count(*) from recepcion_detalle where producto_id = _p('DR') and recepcion_id = 'a1111111-1111-1111-1111-111111111111'), 0::bigint, 'sus jabas se borran');
select is((select count(*) from recepciones where id = 'a1111111-1111-1111-1111-111111111111'), 1::bigint, 'la recepción se conserva porque aún tiene jabas de AR');
select cmp_ok((select count(*) from auditoria where tabla = 'recepcion_detalle' and operacion = 'DELETE'), '>=', 1::bigint, 'el borrado de las jabas quedó auditado');
select is((select count(*) from logs_app where origen = 'correccion' and mensaje like 'Lote 131DR040526 anulado%era otro producto'), 1::bigint, 'queda constancia del motivo');

-- Recepción de un solo lote: se va completa
select fn_anular_lote((_lote(16,'AR','2026-05-09')).id);
select is((select count(*) from recepciones where id = 'a2222222-2222-2222-2222-222222222222'), 0::bigint, 'la recepción vacía se borra');

select * from finish();
rollback;
