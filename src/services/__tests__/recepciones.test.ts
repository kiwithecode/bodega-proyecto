import { describe, it, expect, vi, beforeEach } from 'vitest'

// Supabase simulado: registra las llamadas y responde lo que le indiquemos por tabla.
const llamadas: { tabla: string; op: string; payload?: unknown }[] = []
const respuestas: Record<string, { data: unknown; error: unknown }> = {}
function builder(tabla: string) {
  const b: Record<string, unknown> = {}
  const chain = (op: string) => (payload?: unknown) => { llamadas.push({ tabla, op, payload }); return b }
  Object.assign(b, {
    insert: chain('insert'), select: chain('select'), delete: chain('delete'), eq: chain('eq'), single: chain('single'),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(respuestas[tabla] ?? { data: [], error: null }).then(res, rej),
  })
  return b
}
vi.mock('../../lib/supabase', () => ({
  supabase: { from: (t: string) => builder(t), rpc: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r) }) },
  ok: ({ data, error }: { data: unknown; error: { message?: string } | null }) => { if (error) throw new Error(error.message); return data },
}))

import { crearRecepcion } from '../recepciones'

const cab = { fecha: '2026-05-04', proveedor_id: 7, registro: '8264', factura: '', obs: '' }
const lineas = [
  { producto_id: 1, kg_real: '70', precio_kg: '6,6', kg_factura: '', calidad_ok: true, observaciones: '' },
  { producto_id: 1, kg_real: '46.5', precio_kg: '6.6', kg_factura: '47', calidad_ok: false, observaciones: 'olor' },
]

beforeEach(() => { llamadas.length = 0; for (const k of Object.keys(respuestas)) delete respuestas[k] })

describe('crearRecepcion', () => {
  it('inserta cabecera y jabas convirtiendo texto a número (coma incluida)', async () => {
    respuestas.recepciones = { data: { id: 'R1' }, error: null }
    respuestas.recepcion_detalle = { data: [{ lotes: { codigo: '7AR040526', kg_inicial: 116.5, costo_kg: 6.6 } }, { lotes: { codigo: '7AR040526', kg_inicial: 116.5, costo_kg: 6.6 } }], error: null }
    const r = await crearRecepcion(cab, lineas)
    const ins = llamadas.find((l) => l.tabla === 'recepcion_detalle' && l.op === 'insert')!.payload as Record<string, unknown>[]
    expect(ins).toHaveLength(2)
    expect(ins[0]).toMatchObject({ recepcion_id: 'R1', kg_real: 70, precio_kg: 6.6, kg_factura: null, calidad_ok: true })
    expect(ins[1]).toMatchObject({ kg_real: 46.5, kg_factura: 47, calidad_ok: false, observaciones: 'olor' })
    expect(r.lotes).toHaveLength(1) // dos jabas → un solo lote
    expect(r.lotes[0].codigo).toBe('7AR040526')
  })
  it('si fallan las jabas, borra la cabecera y propaga el error', async () => {
    respuestas.recepciones = { data: { id: 'R1' }, error: null }
    respuestas.recepcion_detalle = { data: null, error: { message: 'kg_real debe ser > 0' } }
    await expect(crearRecepcion(cab, lineas)).rejects.toThrow('kg_real debe ser > 0')
    expect(llamadas.some((l) => l.tabla === 'recepciones' && l.op === 'delete')).toBe(true)
  })
  it('campos vacíos de cabecera se guardan como null', async () => {
    respuestas.recepciones = { data: { id: 'R1' }, error: null }
    await crearRecepcion(cab, lineas)
    const ins = llamadas.find((l) => l.tabla === 'recepciones' && l.op === 'insert')!.payload as Record<string, unknown>
    expect(ins).toMatchObject({ numero_registro: '8264', numero_factura: null, observaciones: null })
  })
})
