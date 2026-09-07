import { supabase, ok } from '../lib/supabase'
import type { CostoActual, PrecioCompra, RendimientoProveedor } from '../lib/types'
export const getCostoActual = () => supabase.from('v_costo_actual').select('*').order('producto').then((r) => ok<CostoActual[]>(r))
export const getRendimientoProveedor = () => supabase.from('v_rendimiento_proveedor').select('*').order('producto').order('costo_real_kg').then((r) => ok<RendimientoProveedor[]>(r))
export const getPreciosCompra = () => supabase.from('v_precios_compra').select('*').order('fecha', { ascending: false }).limit(300).then((r) => ok<PrecioCompra[]>(r))
