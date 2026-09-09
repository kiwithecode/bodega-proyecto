-- =============================================================================
--  07 · PRUEBAS de fn_editar_lote, fn_quitar_jaba, fn_anular_lote (07) y sobrante (10) (pgTAP)
--  Requiere 01–05 y 07–17. Todo dentro de una transacción que se
--  revierte al final: NO deja datos. Cualquier línea "not ok" es una falla.
-- =============================================================================
create extension if not exists pgtap;

begin;
select plan(57);
create temp table _res (linea text);   -- guarda cada resultado para listar los fallos al final

-- Si estas fallan, falta cargar (o volver a cargar) 07_correcciones.sql: todo lo demás va a fallar también.
insert into _res select has_function('fn_editar_lote', array['uuid','date','text'], 'existe fn_editar_lote (cargar 07_correcciones.sql)');
insert into _res select has_function('fn_anular_lote', array['uuid','text'], 'existe fn_anular_lote (cargar 07_correcciones.sql)');
insert into _res select has_function('fn_quitar_jaba', array['uuid','text'], 'existe fn_quitar_jaba (cargar 07_correcciones.sql)');

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
insert into _res select lives_ok($$ select fn_editar_lote((_lote(131,'AR','2026-05-04')).id, '2026-05-03'::date, 'fecha mal digitada') $$, 'editar fecha de un lote recibido');
insert into _res select is((_lote(131,'AR','2026-05-03')).codigo, '131AR030526', 'el código se rearma con la nueva fecha');
insert into _res select is((_lote(131,'AR','2026-05-03')).kg_inicial, 116.500, 'los kg no cambian');
insert into _res select is((_lote(131,'AR','2026-05-03')).costo_kg, 6.6000, 'el costo no cambia');
insert into _res select is((_lote(131,'AR','2026-05-03')).observaciones, 'fecha mal digitada', 'guarda la observación');
insert into _res select is((select fecha from recepciones where id = 'a1111111-1111-1111-1111-111111111111'), '2026-05-04'::date,
  'la recepción conserva su fecha porque también trae DR');
insert into _res select is((select count(*) from recepcion_detalle where lote_id = (_lote(131,'AR','2026-05-03')).id), 2::bigint, 'las jabas siguen colgadas del lote');

-- Recepción de un solo producto: la fecha se hereda
insert into recepciones (id, fecha, proveedor_id) values ('a2222222-2222-2222-2222-222222222222', '2026-05-10', _pr(16));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('a2222222-2222-2222-2222-222222222222', _p('AR'), 37.9, 7.0);
select fn_editar_lote((_lote(16,'AR','2026-05-10')).id, '2026-05-09'::date);
insert into _res select is((select fecha from recepciones where id = 'a2222222-2222-2222-2222-222222222222'), '2026-05-09'::date,
  'la recepción hereda la fecha cuando todas sus jabas son del lote');

-- Protecciones
insert into _res select throws_like($$ select fn_editar_lote((_lote(131,'AR','2026-05-03')).id, (current_date + 1)::date) $$, '%no puede ser futura%', 'no acepta fecha futura');
insert into recepciones (id, fecha, proveedor_id) values ('a3333333-3333-3333-3333-333333333333', '2026-05-02', _pr(131));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('a3333333-3333-3333-3333-333333333333', _p('AR'), 10, 6.0);
insert into _res select throws_like($$ select fn_editar_lote((_lote(131,'AR','2026-05-03')).id, '2026-05-02'::date) $$, 'Ya existe el lote 131AR020526%', 'no pisa un lote que ya existe con esa fecha');
insert into _res select is((_lote(131,'AR','2026-05-03')).codigo, '131AR030526', 'tras el error el lote queda intacto');

-- Lote consumido en un proceso: puede cambiar la fecha, pero no a después del proceso
insert into procesos (id, tipo_proceso_id, fecha) values ('b1111111-1111-1111-1111-111111111111', (select id from tipos_proceso where codigo='LIMPIEZA'), '2026-05-06');
insert into proceso_entradas (proceso_id, lote_id, kg_tomados) values ('b1111111-1111-1111-1111-111111111111', (_lote(131,'AR','2026-05-03')).id, 50);
insert into proceso_salidas (proceso_id, producto_id, rol, kg, precio_credito) values
  ('b1111111-1111-1111-1111-111111111111', _p('ARL'), 'principal', 45, null),
  ('b1111111-1111-1111-1111-111111111111', _p('VNR'), 'merma',      5, null);
select fn_procesar('b1111111-1111-1111-1111-111111111111');
insert into _res select throws_like($$ select fn_editar_lote((_lote(131,'AR','2026-05-03')).id, '2026-05-07'::date) $$, '%se procesó el 06/05/2026%', 'no acepta fecha posterior al proceso que lo consumió');
insert into _res select lives_ok($$ select fn_editar_lote((_lote(131,'AR','2026-05-03')).id, '2026-05-01'::date) $$, 'sí acepta una fecha anterior al proceso');
insert into _res select is((select count(*) from v_trazabilidad where lote_padre = '131AR010526'), 2::bigint, 'la trazabilidad sigue al lote con su nuevo código (una fila por salida)');
insert into _res select throws_like($$ select fn_editar_lote((_lote(131,'ARL','2026-05-06')).id, '2026-05-05'::date) $$, '%salió de un proceso%', 'un lote hijo se corrige en el proceso, no aquí');

-- -----------------------------------------------------------------------------
-- 2. Anular
-- -----------------------------------------------------------------------------
insert into _res select throws_like($$ select fn_anular_lote((_lote(131,'AR','2026-05-01')).id) $$, '%ya se usó en 1 proceso%', 'no anula un lote del que ya se tomaron kg');
insert into _res select throws_like($$ select fn_anular_lote((_lote(131,'ARL','2026-05-06')).id) $$, '%salió de un proceso%', 'no anula un lote hijo');

-- DR comparte recepción con AR: se van sus jabas y su lote, la recepción se queda
insert into _res select lives_ok($$ select fn_anular_lote((_lote(131,'DR','2026-05-04')).id, 'era otro producto') $$, 'anular el lote DR');
insert into _res select is((select count(*) from lotes where codigo = '131DR040526'), 0::bigint, 'el lote desaparece');
insert into _res select is((select count(*) from recepcion_detalle where producto_id = _p('DR') and recepcion_id = 'a1111111-1111-1111-1111-111111111111'), 0::bigint, 'sus jabas se borran');
insert into _res select is((select count(*) from recepciones where id = 'a1111111-1111-1111-1111-111111111111'), 1::bigint, 'la recepción se conserva porque aún tiene jabas de AR');
insert into _res select cmp_ok((select count(*) from auditoria where tabla = 'recepcion_detalle' and operacion = 'DELETE'), '>=', 1::bigint, 'el borrado de las jabas quedó auditado');
insert into _res select is((select count(*) from logs_app where origen = 'correccion' and mensaje like 'Lote 131DR040526 anulado%era otro producto'), 1::bigint, 'queda constancia del motivo');

-- Recepción de un solo lote: se va completa
select fn_anular_lote((_lote(16,'AR','2026-05-09')).id);
insert into _res select is((select count(*) from recepciones where id = 'a2222222-2222-2222-2222-222222222222'), 0::bigint, 'la recepción vacía se borra');

-- -----------------------------------------------------------------------------
-- 3. Quitar una sola jaba (mismo producto digitado dos veces)
-- -----------------------------------------------------------------------------
insert into recepciones (id, fecha, proveedor_id, numero_registro) values ('c1111111-1111-1111-1111-111111111111', '2026-05-20', _pr(131), '8777');
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('c1111111-1111-1111-1111-111111111111', _p('AR'), 100, 6.0);
insert into recepciones (id, fecha, proveedor_id, numero_registro) values ('c2222222-2222-2222-2222-222222222222', '2026-05-20', _pr(131), '88000');
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('c2222222-2222-2222-2222-222222222222', _p('AR'), 50, 7.0);
insert into _res select is((_lote(131,'AR','2026-05-20')).kg_inicial, 150.000, 'dos registros del mismo día se juntan en un lote');

insert into _res select is((select fn_quitar_jaba(id, 'registro repetido') from recepcion_detalle where recepcion_id = 'c2222222-2222-2222-2222-222222222222'), false, 'quitar la jaba repetida: el lote sigue');
insert into _res select is((_lote(131,'AR','2026-05-20')).kg_inicial, 100.000, 'el lote queda con la jaba buena');
insert into _res select is((_lote(131,'AR','2026-05-20')).costo_kg, 6.0000, 'el costo se recalculó sin la jaba quitada');
insert into _res select is((select count(*) from recepciones where id = 'c2222222-2222-2222-2222-222222222222'), 0::bigint, 'la recepción que quedó vacía se borra');

-- Si ya se procesó más de lo que quedaría, no deja
insert into procesos (id, tipo_proceso_id, fecha) values ('c3333333-3333-3333-3333-333333333333', (select id from tipos_proceso where codigo='LIMPIEZA'), '2026-05-21');
insert into proceso_entradas (proceso_id, lote_id, kg_tomados) values ('c3333333-3333-3333-3333-333333333333', (_lote(131,'AR','2026-05-20')).id, 80);
insert into proceso_salidas (proceso_id, producto_id, rol, kg, precio_credito) values ('c3333333-3333-3333-3333-333333333333', _p('ARL'), 'principal', 80, null);
select fn_procesar('c3333333-3333-3333-3333-333333333333');
insert into _res select throws_like($$ select fn_quitar_jaba(id) from recepcion_detalle where recepcion_id = 'c1111111-1111-1111-1111-111111111111' $$,
  '%ya se procesaron 80.000 kg%', 'no quita una jaba si lo procesado ya no cabría');

-- Última jaba de un lote sin uso: el lote se borra
insert into recepciones (id, fecha, proveedor_id) values ('c4444444-4444-4444-4444-444444444444', '2026-05-22', _pr(16));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('c4444444-4444-4444-4444-444444444444', _p('AR'), 20, 6.5);
insert into _res select is((select fn_quitar_jaba(id) from recepcion_detalle where recepcion_id = 'c4444444-4444-4444-4444-444444444444'), true, 'última jaba: devuelve true');
insert into _res select is((select count(*) from lotes where codigo = '16AR220526'), 0::bigint, 'y el lote desaparece');

-- -----------------------------------------------------------------------------
-- 4. Sobrante (10_sobrante.sql): salidas > entrada se cierra, no descuenta merma y alerta
-- -----------------------------------------------------------------------------
insert into recepciones (id, fecha, proveedor_id) values ('d1111111-1111-1111-1111-111111111111', current_date - 1, _pr(131));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('d1111111-1111-1111-1111-111111111111', _p('AR'), 109, 6.6);
insert into procesos (id, tipo_proceso_id, fecha) values ('d2222222-2222-2222-2222-222222222222', (select id from tipos_proceso where codigo='LIMPIEZA'), current_date);
insert into proceso_entradas (proceso_id, lote_id, kg_tomados) values ('d2222222-2222-2222-2222-222222222222', (_lote(131,'AR',current_date - 1)).id, 109);
insert into proceso_salidas (proceso_id, producto_id, rol, kg, precio_credito) values
  ('d2222222-2222-2222-2222-222222222222', _p('ARL'), 'principal', 99.10, null),
  ('d2222222-2222-2222-2222-222222222222', _p('ER'),  'subproducto', 7.80, 3.3),
  ('d2222222-2222-2222-2222-222222222222', _p('VNR'), 'merma',       8.15, null);
insert into _res select lives_ok($$ select fn_procesar('d2222222-2222-2222-2222-222222222222') $$, 'un proceso con salidas > entrada se cierra igual');
insert into _res select is((select kg_merma_no_reg from procesos where id = 'd2222222-2222-2222-2222-222222222222'), -6.050, 'el sobrante queda como merma no registrada negativa');
insert into _res select cmp_ok((select kg_sobrante from fn_kpis(current_date, current_date)), '>=', 6.050, 'fn_kpis expone el sobrante');
insert into _res select cmp_ok((select kg_merma from fn_kpis(current_date, current_date)), '>=', 8.150, 'la merma del período no se descuenta con el sobrante');
insert into _res select is((select count(*) from v_alertas where tipo = 'SOBRANTE' and proceso_id = 'd2222222-2222-2222-2222-222222222222'), 1::bigint, 'aparece la alerta SOBRANTE');

-- -----------------------------------------------------------------------------
-- 5. Pedidos (13_pedidos.sql): stock y pedido del mismo producto van a lotes distintos
-- -----------------------------------------------------------------------------
insert into recepciones (id, fecha, proveedor_id) values ('e1111111-1111-1111-1111-111111111111', '2026-05-25', _pr(131));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('e1111111-1111-1111-1111-111111111111', _p('AR'), 100, 6.0);
insert into procesos (id, tipo_proceso_id, fecha) values ('e2222222-2222-2222-2222-222222222222', (select id from tipos_proceso where codigo='LIMPIEZA'), '2026-05-26');
insert into proceso_entradas (proceso_id, lote_id, kg_tomados) values ('e2222222-2222-2222-2222-222222222222', (_lote(131,'AR','2026-05-25')).id, 100);
insert into proceso_salidas (proceso_id, producto_id, rol, kg, precio_credito, destino, cliente) values
  ('e2222222-2222-2222-2222-222222222222', _p('ARL'), 'principal', 40, null, 'stock',  null),
  ('e2222222-2222-2222-2222-222222222222', _p('ARL'), 'principal', 30, null, 'pedido', 'Supermaxi Ñ.'),
  ('e2222222-2222-2222-2222-222222222222', _p('ARL'), 'principal', 20, null, 'pedido', 'Supermaxi Ñ.'),
  ('e2222222-2222-2222-2222-222222222222', _p('VNR'), 'merma',     10, null, 'stock',  null);
update proceso_salidas set kg = 30 where proceso_id = 'e2222222-2222-2222-2222-222222222222' and producto_id = _p('ARL') and destino = 'stock';
insert into proceso_salidas (proceso_id, producto_id, rol, kg, precio_credito, destino) values
  ('e2222222-2222-2222-2222-222222222222', _p('ER'), 'subproducto', 10, 3.3, 'moler');
select fn_procesar('e2222222-2222-2222-2222-222222222222');
insert into _res select is((select kg_inicial from lotes where codigo = '131ER260526-MOLER'), 10.000, 'una salida "para moler" va a su lote -MOLER');
insert into _res select is((select destino from lotes where codigo = '131ER260526-MOLER'), 'moler', 'y el lote queda marcado para moler');
insert into _res select is(fn_sufijo_pedido('Supermaxi Ñ.'), '-SUPERMAXIN', 'sufijo: mayúsculas, sin acentos ni símbolos');
insert into _res select is((_lote(131,'ARL','2026-05-26')).kg_inicial, 30.000, 'el lote de stock solo tiene los kg para stock');
insert into _res select is((select kg_inicial from lotes where codigo = '131ARL260526-SUPERMAXIN'), 50.000, 'el pedido tiene su propio lote y suma las dos salidas del mismo cliente');
insert into _res select is((select cliente from lotes where codigo = '131ARL260526-SUPERMAXIN'), 'Supermaxi Ñ.', 'el lote recuerda para quién se elaboró');
insert into _res select is((select destino from lotes where codigo = '131ARL260526-SUPERMAXIN'), 'pedido', 'y su destino');
insert into _res select is((select count(*) from v_trazabilidad where lote_hijo = '131ARL260526-SUPERMAXIN' and cliente = 'Supermaxi Ñ.'), 2::bigint, 'la trazabilidad muestra el cliente (una fila por cada salida del pedido)');

-- -----------------------------------------------------------------------------
-- 6. Obreros (15_obreros.sql): catálogo sin duplicados, nombre sincronizado y rendimiento
-- -----------------------------------------------------------------------------
insert into obreros (nombre) values ('Test Obrero Uno');
insert into _res select throws_like($$ insert into obreros (nombre) values ('  test obrero UNO ') $$, '%obreros_nombre_uk%', 'no deja repetir el nombre aunque cambien mayúsculas o espacios');
insert into procesos (id, tipo_proceso_id, fecha, obrero_id, hora_inicio, hora_fin) values
  ('f1111111-1111-1111-1111-111111111111', (select id from tipos_proceso where codigo='LIMPIEZA'), '2026-05-27', (select id from obreros where nombre='Test Obrero Uno'), '08:00', '10:00');
insert into _res select is((select obrero from procesos where id = 'f1111111-1111-1111-1111-111111111111'), 'Test Obrero Uno', 'el trigger copia el nombre del catálogo a procesos.obrero');
update obreros set nombre = 'Test Obrero Renombrado' where nombre = 'Test Obrero Uno';
insert into _res select is((select obrero from procesos where id = 'f1111111-1111-1111-1111-111111111111'), 'Test Obrero Renombrado', 'renombrar al obrero actualiza sus procesos');
insert into proceso_entradas (proceso_id, lote_id, kg_tomados) values ('f1111111-1111-1111-1111-111111111111', (_lote(131,'AR','2026-05-20')).id, 20);
insert into proceso_salidas (proceso_id, producto_id, rol, kg, precio_credito) values
  ('f1111111-1111-1111-1111-111111111111', _p('ARL'), 'principal', 16, null),
  ('f1111111-1111-1111-1111-111111111111', _p('VNR'), 'merma',      4, null);
select fn_procesar('f1111111-1111-1111-1111-111111111111');
insert into _res select is((select rendimiento_pct from fn_rendimiento_obrero('2026-05-27','2026-05-27') where obrero = 'Test Obrero Renombrado'), 80.0, 'rendimiento del obrero = principal / entrada');
insert into _res select is((select horas from fn_rendimiento_obrero('2026-05-27','2026-05-27') where obrero = 'Test Obrero Renombrado'), 2.00, 'horas trabajadas = fin − inicio');
insert into _res select is((select kg_por_hora from fn_rendimiento_obrero('2026-05-27','2026-05-27') where obrero = 'Test Obrero Renombrado'), 10.0, 'kg por hora');

-- -----------------------------------------------------------------------------
-- 7. Alarmas de volumen (17): compras de la semana y stock alto
-- -----------------------------------------------------------------------------
insert into recepciones (id, fecha, proveedor_id) values ('a7777777-7777-7777-7777-777777777777', current_date, _pr(16));
insert into recepcion_detalle (recepcion_id, producto_id, kg_real, precio_kg) values ('a7777777-7777-7777-7777-777777777777', _p('DR'), 1100, 13.0);
insert into _res select is((select count(*) from v_alertas where tipo = 'COMPRAS ALTAS' and referencia = 'DR'), 1::bigint, 'más de 1000 kg comprados en la semana → COMPRAS ALTAS');
insert into _res select is((select semaforo from v_stock_semaforo where codigo = 'DR'), 'ALTO', 'más de 1000 kg en bodega sin ideal propio → semáforo ALTO');
insert into _res select is((select count(*) from v_alertas where tipo = 'STOCK ALTO' and referencia = 'DR'), 1::bigint, '→ y alerta STOCK ALTO');

-- Resumen + detalle de las que fallaron (el SQL Editor solo muestra el último resultado).
select * from finish()
union all
select linea from _res where linea like 'not ok%';
rollback;
