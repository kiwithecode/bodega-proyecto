import { supabase, ok } from '../lib/supabase'
import type { Alerta, CostoSemanal, Kpis, MetricaDiaria, PrecioCompra, RendimientoObrero, RendimientoProveedor } from '../lib/types'
export const getKpis = (desde: string, hasta: string) => supabase.rpc('fn_kpis', { p_desde: desde, p_hasta: hasta }).then((r) => ok<Kpis[]>(r)).then((d) => d?.[0] ?? null)
export const getAlertas = () => supabase.from('v_alertas').select('*').order('nivel').then((r) => ok<Alerta[]>(r))
export const getAlertasResumen = () => supabase.rpc('fn_alertas_resumen').then((r) => ok<{ nivel: number; cantidad: number }[]>(r))

/** Serie diaria del período (kg recibidos/procesados, rendimiento, merma, $). */
export const getMetricasDiarias = (desde: string, hasta: string) =>
  supabase.from('v_metricas_diarias').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha').then((r) => ok<MetricaDiaria[]>(r))
/** Compras del período, una fila por (fecha, proveedor, producto); el tablero las suma por proveedor. */
export const getComprasPeriodo = (desde: string, hasta: string) =>
  supabase.from('v_precios_compra').select('fecha,proveedor_codigo,proveedor,producto_codigo,producto,kg,total').gte('fecha', desde).lte('fecha', hasta).then((r) => ok<PrecioCompra[]>(r))
/** Costo real semanal de todos los productos desde una semana dada (para elegir producto y graficar su tendencia). */
export const getCostoSemanal = (desdeSemana: string) =>
  supabase.from('v_costo_semanal').select('*').gte('semana', desdeSemana).order('semana').then((r) => ok<CostoSemanal[]>(r))
/** Rendimiento acumulado por proveedor para un producto (procesos de un solo lote). */
export const getRendimientoProducto = (productoCodigo: string) =>
  supabase.from('v_rendimiento_proveedor').select('*').eq('producto_codigo', productoCodigo).order('rendimiento_pct', { ascending: false }).then((r) => ok<RendimientoProveedor[]>(r))
/** Fecha del primer movimiento (recepción o proceso), para que el tablero arranque mostrando todo. */
export const getPrimeraFecha = () => supabase.from('v_metricas_diarias').select('fecha').gte('fecha', '2020-01-01').order('fecha').limit(1).then((r) => ok<{ fecha: string }[]>(r)).then((d) => d?.[0]?.fecha ?? null)
/** Rendimiento por obrero en el período (fn_rendimiento_obrero, 15_obreros.sql). */
export const getRendimientoObrero = (desde: string, hasta: string) => supabase.rpc('fn_rendimiento_obrero', { p_desde: desde, p_hasta: hasta }).then((r) => ok<RendimientoObrero[]>(r))
