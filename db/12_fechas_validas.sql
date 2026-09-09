-- =============================================================================
--  12 · FECHAS VÁLIDAS  —  ninguna recepción, proceso o lote con año mal digitado
--  Ejecutar después de 01–05. Idempotente.
--
--  Un año como 0226 o 20260 pasa por el <input type="date"> y rompía el tablero
--  (rango de cientos de miles de días). El frontend ya lo valida; esto lo garantiza.
--  Los CHECK se crean NOT VALID: no fallan si ya hay filas malas; la consulta
--  final las lista para corregirlas (fecha del lote: Stock → Corregir lote).
-- =============================================================================
alter table recepciones drop constraint if exists recepciones_fecha_valida;
alter table recepciones add constraint recepciones_fecha_valida check (fecha between '2020-01-01' and current_date + 1) not valid;
alter table procesos    drop constraint if exists procesos_fecha_valida;
alter table procesos    add constraint procesos_fecha_valida    check (fecha between '2020-01-01' and current_date + 1) not valid;
alter table lotes       drop constraint if exists lotes_fecha_valida;
alter table lotes       add constraint lotes_fecha_valida       check (fecha between '2020-01-01' and current_date + 1) not valid;

-- Filas que hoy violan la regla (si sale vacío, todo bien; si no, corrígelas y luego: alter table … validate constraint …)
select 'recepcion' tabla, id::text, fecha, numero_registro referencia from recepciones where fecha not between '2020-01-01' and current_date + 1
union all
select 'proceso', id::text, fecha, null from procesos where fecha not between '2020-01-01' and current_date + 1
union all
select 'lote', id::text, fecha, codigo from lotes where fecha not between '2020-01-01' and current_date + 1
order by 1, 3;
