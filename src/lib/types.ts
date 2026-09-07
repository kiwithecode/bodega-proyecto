/** Espejo de las tablas, vistas y funciones de 01–05 .sql */
export type Rol = 'principal' | 'subproducto' | 'merma' | 'devolucion'
export type EstadoLote = 'disponible' | 'agotado' | 'anulado'
export type Semaforo = 'OK' | 'BAJO' | 'SIN STOCK'
export type Veredicto = 'REPETIDO' | 'MUY PARECIDO' | 'PARECIDO' | 'MISMO NOMBRE, OTRA ESPECIE'
export type NivelLog = 'error' | 'warn' | 'info'

export interface Especie { id: number; codigo: string; nombre: string }
export interface Proveedor { id: number; codigo: number; nombre: string; acuerdo_limpieza: string | null; activo: boolean; notas?: string | null }
export interface Producto {
  id: number; codigo: string; nombre: string; especie_id: number | null; rol_defecto: Rol
  interno: boolean; por_confirmar: boolean; activo: boolean; especies?: { nombre: string } | null
}
export interface TipoProceso { id: number; codigo: string; nombre: string }

export interface Lote {
  id: string; codigo: string; producto_id: number; proveedor_id: number | null; fecha: string
  origen: 'recepcion' | 'proceso'; kg_inicial: number; kg_disponible: number; costo_kg: number; estado: EstadoLote
  observaciones: string | null
  productos?: { nombre: string; codigo: string } | null
  proveedores?: { nombre: string; codigo: number } | null
}
export interface RecepcionDetalle {
  id: string; recepcion_id: string; producto_id: number; lote_id: string; kg_real: number; kg_factura: number | null
  precio_kg: number; total: number; calidad_ok: boolean; observaciones: string | null
  recepciones?: { fecha: string; numero_registro: string | null; numero_factura: string | null } | null
}
export interface Proceso {
  id: string; tipo_proceso_id: number; fecha: string; observaciones: string | null
  kg_consumidos: number; kg_salidas: number; kg_merma_no_reg: number
  costo_entrada: number; credito_subproductos: number; costo_neto: number; procesado_at: string | null
}
export interface ProcesoEntrada { id?: string; proceso_id?: string; lote_id: string; kg_tomados: number; kg_devueltos: number; costo_kg_aplicado?: number }
export interface ProcesoSalida {
  id?: string; proceso_id?: string; producto_id: number; rol: Rol; kg: number; precio_credito: number | null
  conserva_proveedor: boolean; costo_kg?: number; lote_id?: string | null
  lotes?: { codigo: string } | null; productos?: { nombre: string } | null
}

/** v_stock_lotes */
export interface StockLote {
  id: string; codigo: string; fecha: string; dias_en_camara: number; especie: string | null
  producto_codigo: string; producto: string; rol_defecto: Rol; proveedor_codigo: number | null; proveedor: string | null
  origen: 'recepcion' | 'proceso'; kg_inicial: number; kg_disponible: number; costo_kg: number; valor_stock: number; estado: EstadoLote
}
/** v_stock_semaforo */
export interface StockSemaforo {
  producto_id: number; codigo: string; producto: string; especie: string | null; rol_defecto: Rol
  kg_disponible: number; lotes: number; lote_mas_antiguo: string | null; dias_lote_mas_antiguo: number | null
  ultimo_ingreso: string | null; costo_kg_prom: number | null; valor_stock: number; kg_minimo: number | null
  kg_ideal: number | null; kg_por_dia: number | null; dias_cobertura: number | null; semaforo: Semaforo
}
export interface Alerta { nivel: 1 | 2 | 3 | 4; tipo: string; referencia: string | null; mensaje: string; lote_id: string | null; proceso_id: string | null; producto_id: number | null }
export interface Kpis {
  kg_recibidos: number; compras_usd: number; recepciones: number; proveedores_distintos: number
  kg_procesados: number; kg_principal: number; kg_subproductos: number; kg_merma: number
  rendimiento_pct: number | null; merma_pct: number | null; credito_subproductos: number
  valor_stock_actual: number; kg_stock_actual: number; lotes_disponibles: number
}
export interface CostoActual { producto_codigo: string; producto: string; ultimo_costo_kg: number; fecha_ultimo: string; lote: string; proveedor: string | null }
export interface RendimientoProveedor {
  proveedor_codigo: number; proveedor: string; producto_codigo: string; producto: string; procesos: number
  kg_entrada: number; kg_principal: number; rendimiento_pct: number; merma_pct: number; costo_compra_kg: number; costo_real_kg: number
}
export interface PrecioCompra { fecha: string; proveedor_codigo: number; proveedor: string; producto_codigo: string; producto: string; kg: number; precio_kg: number; total: number; lote: string }
export interface Trazabilidad {
  lote_hijo: string; rol: Rol; kg_salida: number; costo_kg: number; proceso_id: string; proceso: string; fecha_proceso: string
  lote_padre: string; kg_tomados: number; kg_devueltos: number; costo_kg_aplicado: number
}
export interface Similar { id: number; codigo: string | number; nombre: string; especie?: string; misma_especie?: boolean; similitud: number; veredicto: Veredicto }
export interface CodigoSugerido { codigo: string; regla: string; prioridad: number }
export interface Auditoria {
  id: number; ts: string; usuario: string | null; tabla: string; operacion: string; registro_id: string | null; referencia: string | null
  entidad: string; accion: 'creó' | 'modificó' | 'borró'; cambios: Record<string, { de: unknown; a: unknown }> | null
  antes: Record<string, unknown> | null; despues: Record<string, unknown> | null; resumen: string | null
}
export interface LogApp { id: number; ts: string; nivel: NivelLog; origen: string; mensaje: string; detalle: unknown; url: string | null; usuario: string | null; agente: string | null }
export interface LogResumen { nivel: NivelLog; ultimas_24h: number; ultimos_7d: number; ultimo: string | null }

/** Formularios (lo que digita la persona, antes de convertir a número) */
export interface LineaRecepcion { producto_id: number | null; kg_real: string; precio_kg: string; kg_factura: string; calidad_ok: boolean; observaciones: string }
export interface EntradaForm { lote_id: string | null; kg_tomados: string | number; kg_devueltos: string | number }
export interface SalidaForm { producto_id: number | null; rol: Rol; kg: string | number; precio_credito: string | number; conserva_proveedor: boolean }
