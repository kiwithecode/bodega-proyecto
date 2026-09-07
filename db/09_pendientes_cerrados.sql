-- =============================================================================
--  09 · PENDIENTES CERRADOS  —  confirmación de HUP y limpieza semanal de logs
--  Ejecutar después de 01–05. Idempotente.
-- =============================================================================

-- 1) Hueso pollo: la bodega confirmó el código HUP el 07/09/2026.
--    Deja de mostrarse el aviso "por confirmar" en Catálogos.
update productos set por_confirmar = false where codigo = 'HUP' and por_confirmar;

-- 2) Retención automática: fn_limpiar_logs() borra logs_app > 90 días y auditoria > 2 años.
--    pg_cron corre en UTC: '0 8 * * 0' = domingos 08:00 UTC = 03:00 en Quito.
--    Si falla con "extension pg_cron is not available", activarla en
--    Dashboard → Database → Extensions → pg_cron, y volver a correr este archivo.
create extension if not exists pg_cron;
grant usage on schema cron to postgres;

-- cron.schedule por nombre es un upsert: si la tarea existe, la actualiza.
select cron.schedule('limpiar-logs', '0 8 * * 0', $$ select fn_limpiar_logs() $$);

-- Ver que quedó programada (y su historial en cron.job_run_details):
select jobid, jobname, schedule, command, active from cron.job where jobname = 'limpiar-logs';
