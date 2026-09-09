import { supabase, ok } from '../lib/supabase'
import { num } from '../lib/format'
import type { Cliente, EntradaForm, Lote, Obrero, Proceso, ProcesoEntrada, ProcesoSalida, SalidaForm, StockLote } from '../lib/types'

export const listLotesDisponibles = () => supabase.from('v_stock_lotes').select('*').gt('kg_disponible', 0).order('fecha').then((r) => ok<StockLote[]>(r))

export async function getProceso(id: string) {
  const [proceso, entradas, salidas] = await Promise.all([
    supabase.from('procesos').select('*').eq('id', id).single().then((r) => ok<Proceso>(r)),
    supabase.from('proceso_entradas').select('*').eq('proceso_id', id).then((r) => ok<ProcesoEntrada[]>(r)),
    supabase.from('proceso_salidas').select('*').eq('proceso_id', id).then((r) => ok<ProcesoSalida[]>(r)),
  ])
  const lotes = entradas.length
    ? await supabase.from('lotes').select('*, productos(nombre,codigo), proveedores(nombre,codigo)').in('id', entradas.map((e) => e.lote_id)).then((r) => ok<Lote[]>(r))
    : []
  return { proceso, entradas, salidas, lotes }
}

export interface CabeceraProceso { tipo_proceso_id: number | null; fecha: string; observaciones: string | null; obrero: string | null }
/** Nombres de quienes ya procesaron, el más reciente primero (fn_obreros, 08_proceso_obrero.sql). */
export const listObreros = () => supabase.rpc('fn_obreros').then((r) => ok<Obrero[]>(r))
/** Clientes con pedidos elaborados, el más reciente primero (fn_clientes, 13_pedidos.sql). */
export const listClientes = () => supabase.rpc('fn_clientes').then((r) => ok<Cliente[]>(r))
export interface ResultadoProceso { proceso: Proceso; hijos: ProcesoSalida[] }

/** Guarda (o reemplaza) entradas y salidas y cierra el proceso con fn_procesar. */
export async function guardarProceso({ id, cabecera, entradas, salidas }: { id: string | null; cabecera: CabeceraProceso; entradas: EntradaForm[]; salidas: SalidaForm[] }): Promise<ResultadoProceso> {
  let nuevo = false
  if (!id) {
    const p = await supabase.from('procesos').insert(cabecera).select().single().then((r) => ok<Proceso>(r))
    id = p.id; nuevo = true
  } else {
    await supabase.from('procesos').update(cabecera).eq('id', id).then(ok)
    await supabase.from('proceso_salidas').delete().eq('proceso_id', id).then(ok)
    await supabase.from('proceso_entradas').delete().eq('proceso_id', id).then(ok)
  }
  try {
    await supabase.from('proceso_entradas').insert(entradas.map((e) => ({
      proceso_id: id, lote_id: e.lote_id, kg_tomados: num(e.kg_tomados), kg_devueltos: num(e.kg_devueltos),
    }))).then(ok)
    await supabase.from('proceso_salidas').insert(salidas.map((s) => ({
      proceso_id: id, producto_id: s.producto_id, rol: s.rol, kg: num(s.kg),
      precio_credito: s.rol === 'subproducto' ? num(s.precio_credito) : null, conserva_proveedor: s.conserva_proveedor,
      destino: s.rol !== 'merma' && s.destino === 'pedido' ? 'pedido' : 'stock', cliente: s.rol !== 'merma' && s.destino === 'pedido' ? s.cliente.trim() || null : null,
    }))).then(ok)
  } catch (e) {
    if (nuevo) await supabase.from('procesos').delete().eq('id', id)
    throw e
  }
  await supabase.rpc('fn_procesar', { p_proceso_id: id }).then(ok)
  const [proceso, hijos] = await Promise.all([
    supabase.from('procesos').select('*').eq('id', id).single().then((r) => ok<Proceso>(r)),
    supabase.from('proceso_salidas').select('rol,kg,costo_kg,destino,cliente,lotes(codigo),productos(nombre)').eq('proceso_id', id).then((r) => ok<ProcesoSalida[]>(r)),
  ])
  return { proceso, hijos }
}
