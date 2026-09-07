import { describe, it, expect, vi, beforeEach } from 'vitest'

// Supabase simulado: registra las llamadas RPC y responde lo que le indiquemos por función.
const rpcs: { fn: string; args: unknown }[] = []
const respuestas: Record<string, { data: unknown; error: unknown }> = {}
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => { throw new Error('estas correcciones van por RPC, no por tabla') },
    rpc: (fn: string, args: unknown) => { rpcs.push({ fn, args }); return { then: (r: (v: unknown) => unknown) => Promise.resolve(respuestas[fn] ?? { data: null, error: null }).then(r) } },
  },
  ok: ({ data, error }: { data: unknown; error: { message?: string } | null }) => { if (error) throw new Error(error.message); return data },
}))

import { anularLote, editarLote } from '../lotes'

beforeEach(() => { rpcs.length = 0; for (const k of Object.keys(respuestas)) delete respuestas[k] })

describe('editarLote', () => {
  it('llama a fn_editar_lote con fecha y observaciones, y devuelve el lote actualizado', async () => {
    respuestas.fn_editar_lote = { data: { id: 'L1', codigo: '131AR030526', fecha: '2026-05-03' }, error: null }
    const l = await editarLote('L1', { fecha: '2026-05-03', observaciones: '  fecha mal digitada ' })
    expect(rpcs).toEqual([{ fn: 'fn_editar_lote', args: { p_lote_id: 'L1', p_fecha: '2026-05-03', p_observaciones: 'fecha mal digitada' } }])
    expect(l.codigo).toBe('131AR030526')
  })
  it('observaciones vacías viajan como null', async () => {
    await editarLote('L1', { fecha: '2026-05-03', observaciones: '   ' })
    expect((rpcs[0].args as { p_observaciones: unknown }).p_observaciones).toBeNull()
  })
  it('propaga el mensaje de la base (lote repetido, fecha futura…)', async () => {
    respuestas.fn_editar_lote = { data: null, error: { message: 'Ya existe el lote 131AR020526 con esa fecha.' } }
    await expect(editarLote('L1', { fecha: '2026-05-02' })).rejects.toThrow('Ya existe el lote 131AR020526')
  })
})

describe('anularLote', () => {
  it('llama a fn_anular_lote con el motivo', async () => {
    await anularLote('L1', 'era otro producto')
    expect(rpcs).toEqual([{ fn: 'fn_anular_lote', args: { p_lote_id: 'L1', p_motivo: 'era otro producto' } }])
  })
  it('sin motivo manda null', async () => {
    await anularLote('L1', '')
    expect((rpcs[0].args as { p_motivo: unknown }).p_motivo).toBeNull()
  })
  it('si el lote ya se procesó, la base lo impide y el error llega a la pantalla', async () => {
    respuestas.fn_anular_lote = { data: null, error: { message: 'El lote 131AR040526 ya se usó en 1 proceso(s).' } }
    await expect(anularLote('L1')).rejects.toThrow('ya se usó en 1 proceso')
  })
})
