import { supabase, ok } from '../lib/supabase'
import type { Lote, RecepcionDetalle, Trazabilidad } from '../lib/types'
const SEL = '*, productos(nombre,codigo), proveedores(nombre,codigo)'
export const buscarLotes = (q: string) => {
  let s = supabase.from('lotes').select(SEL).order('fecha', { ascending: false }).limit(200)
  if (q?.trim()) s = s.ilike('codigo', `%${q.trim()}%`)
  return s.then((r) => ok<Lote[]>(r))
}
export const getLote = (id: string) => supabase.from('lotes').select(SEL).eq('id', id).single().then((r) => ok<Lote>(r))
export async function getDetalleLote(lote: Lote) {
  const [compras, padres, hijos] = await Promise.all([
    supabase.from('recepcion_detalle').select('*, recepciones(fecha,numero_registro,numero_factura)').eq('lote_id', lote.id).then((r) => ok<RecepcionDetalle[]>(r)),
    supabase.from('v_trazabilidad').select('*').eq('lote_hijo', lote.codigo).then((r) => ok<Trazabilidad[]>(r)),
    supabase.from('v_trazabilidad').select('*').eq('lote_padre', lote.codigo).then((r) => ok<Trazabilidad[]>(r)),
  ])
  return { compras, padres, hijos }
}
export const actualizarCompra = (id: string, v: { kg_real: number | string; precio_kg: number | string }) =>
  supabase.from('recepcion_detalle').update({ kg_real: Number(v.kg_real), precio_kg: Number(v.precio_kg) }).eq('id', id).then(ok)

/** Cambia la fecha de un lote recibido; la base rearma el código (fn_editar_lote, 07_correcciones.sql). */
export const editarLote = (id: string, v: { fecha: string; observaciones?: string | null }) =>
  supabase.rpc('fn_editar_lote', { p_lote_id: id, p_fecha: v.fecha, p_observaciones: v.observaciones?.trim() || null }).then((r) => ok<Lote>(r))
/** Quita una sola jaba (fn_quitar_jaba). Devuelve true si era la última y el lote se borró. */
export const quitarJaba = (detalleId: string, motivo?: string | null) =>
  supabase.rpc('fn_quitar_jaba', { p_detalle_id: detalleId, p_motivo: motivo?.trim() || null }).then((r) => ok<boolean>(r))
/** Deshace una recepción equivocada: borra jabas y lote (fn_anular_lote). Falla si el lote ya se procesó. */
export const anularLote = (id: string, motivo?: string | null) =>
  supabase.rpc('fn_anular_lote', { p_lote_id: id, p_motivo: motivo?.trim() || null }).then(ok)
