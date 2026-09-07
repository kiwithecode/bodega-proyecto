import { describe, it, expect, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn(() => ({ then: (r: () => void) => { r(); return Promise.resolve() } })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }))
import { ok } from '../../lib/supabase'

describe('ok()', () => {
  it('devuelve data cuando no hay error', () => { expect(ok({ data: [1, 2], error: null })).toEqual([1, 2]) })
  it('lanza el mensaje del error y lo manda a fn_log', () => {
    expect(() => ok({ data: null, error: { message: 'permission denied for table lotes', code: '42501' } })).toThrow('permission denied for table lotes')
    expect(rpc).toHaveBeenCalledWith('fn_log', expect.objectContaining({ p_nivel: 'error', p_origen: 'supabase', p_mensaje: 'permission denied for table lotes' }))
  })
})
