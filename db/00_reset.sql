-- =============================================================================
--  00 · RESET  —  borra TODO lo que crean 01, 02, 03 y 04 (datos incluidos)
--  Úsalo solo para volver a empezar limpio. Después corre 01 → 02 → 03 → 04.
-- =============================================================================
drop view if exists v_compras_proveedor, v_costo_semanal, v_rendimiento_proveedor,
    v_metricas_diarias, v_alertas, v_stock_semaforo, v_consumo_producto,
    v_trazabilidad, v_precios_compra, v_acumulables, v_costo_actual,
    v_stock_productos, v_stock_lotes cascade;

drop function if exists fn_kpis(date, date), fn_alertas_resumen(), fn_param(text),
    fn_crear_proveedor(text, text, boolean), fn_crear_producto(text, text, text, rol_salida, boolean, boolean),
    fn_siguiente_codigo_proveedor(), fn_sugerir_codigos(text, text),
    fn_productos_similares(text, text, real), fn_proveedores_similares(text, real), fn_normalizar(text),
    trg_procsal_borrado(), trg_procent_recalcular(), trg_recdet_recalcular(), trg_recdet_asignar_lote(),
    fn_procesar(uuid), fn_actualizar_lote(uuid), fn_obtener_lote(int, int, date, origen_lote),
    fn_codigo_lote(int, text, date) cascade;

drop table if exists stock_minimos, parametros,
    proceso_salidas, proceso_entradas, procesos,
    recepcion_detalle, recepciones, lotes,
    tipos_proceso, productos, proveedores, especies cascade;

drop type if exists rol_salida, estado_lote, origen_lote cascade;
