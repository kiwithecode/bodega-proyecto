import { supabase, ok } from '../lib/supabase'
import { num } from '../lib/format'
import type { LineaRecepcion } from '../lib/types'

export interface CabeceraRecepcion { fecha: string; proveedor_id: number | null; registro: string; factura: string; obs: string }
export interface LoteCreado { codigo: string; kg_inicial: number; costo_kg: number; productos?: { nombre: string } | null }

/** Crea la recepción y sus jabas; devuelve los lotes creados o actualizados. Si falla el detalle, borra la cabecera. */
export async function crearRecepcion(cab: CabeceraRecepcion, lineas: LineaRecepcion[]) {
  const rec = await supabase.from('recepciones').insert({
    fecha: cab.fecha, proveedor_id: cab.proveedor_id,
    numero_registro: cab.registro || null, numero_factura: cab.factura || null, observaciones: cab.obs || null,
  }).select().single().then((r) => ok<{ id: string }>(r))
  try {
    await supabase.from('recepcion_detalle').insert(lineas.map((l) => ({
      recepcion_id: rec.id, producto_id: l.producto_id, kg_real: num(l.kg_real), precio_kg: num(l.precio_kg),
      kg_factura: l.kg_factura ? num(l.kg_factura) : null, calidad_ok: l.calidad_ok, observaciones: l.observaciones || null,
    }))).then(ok)
  } catch (e) {
    await supabase.from('recepciones').delete().eq('id', rec.id); throw e
  }
  const det = await supabase.from('recepcion_detalle').select('lotes(codigo,kg_inicial,costo_kg,productos(nombre))').eq('recepcion_id', rec.id)
    .then((r) => ok<{ lotes: LoteCreado | null }[]>(r))
  const unicos = new Map<string, LoteCreado>(); det.forEach((r) => r.lotes && unicos.set(r.lotes.codigo, r.lotes))
  return { recepcion: rec, lotes: [...unicos.values()] }
}
