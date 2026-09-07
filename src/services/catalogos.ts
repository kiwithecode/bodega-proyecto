import { supabase, ok } from '../lib/supabase'
import type { CodigoSugerido, Especie, Producto, Proveedor, Rol, Similar, TipoProceso } from '../lib/types'

export const listEspecies = () => supabase.from('especies').select('*').order('id').then((r) => ok<Especie[]>(r))
export const listTiposProceso = () => supabase.from('tipos_proceso').select('*').order('id').then((r) => ok<TipoProceso[]>(r))

export const listProveedores = ({ soloActivos = true } = {}) => {
  let q = supabase.from('proveedores').select('*').order('nombre')
  if (soloActivos) q = q.eq('activo', true)
  return q.then((r) => ok<Proveedor[]>(r))
}
export const listProductos = ({ soloActivos = true, soloComprables = false } = {}) => {
  let q = supabase.from('productos').select('*, especies(nombre)').order('nombre')
  if (soloActivos) q = q.eq('activo', true)
  if (soloComprables) q = q.eq('interno', false)
  return q.then((r) => ok<Producto[]>(r))
}

export const productosSimilares = (nombre: string, especie: string) => supabase.rpc('fn_productos_similares', { p_nombre: nombre, p_especie_codigo: especie }).then((r) => ok<Similar[]>(r))
export const sugerirCodigos = (nombre: string, especie: string) => supabase.rpc('fn_sugerir_codigos', { p_nombre: nombre, p_especie_codigo: especie }).then((r) => ok<CodigoSugerido[]>(r))
export interface NuevoProducto { codigo: string; nombre: string; especie: string; rol: Rol; interno: boolean; forzar: boolean }
export const crearProducto = (p: NuevoProducto) => supabase.rpc('fn_crear_producto', { p_codigo: p.codigo, p_nombre: p.nombre, p_especie_codigo: p.especie, p_rol: p.rol, p_interno: p.interno, p_forzar: p.forzar }).then((r) => ok<Producto>(r))
export const setProductoActivo = (id: number, activo: boolean) => supabase.from('productos').update({ activo }).eq('id', id).then(ok)

export const proveedoresSimilares = (nombre: string) => supabase.rpc('fn_proveedores_similares', { p_nombre: nombre }).then((r) => ok<Similar[]>(r))
export const siguienteCodigoProveedor = () => supabase.rpc('fn_siguiente_codigo_proveedor').then((r) => ok<number>(r))
export interface NuevoProveedor { nombre: string; acuerdo: string; forzar: boolean }
export const crearProveedor = (p: NuevoProveedor) => supabase.rpc('fn_crear_proveedor', { p_nombre: p.nombre, p_acuerdo: p.acuerdo || null, p_forzar: p.forzar }).then((r) => ok<Proveedor>(r))
export const actualizarProveedor = (id: number, cambios: Partial<Proveedor>) => supabase.from('proveedores').update(cambios).eq('id', id).then(ok)
