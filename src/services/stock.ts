import { supabase, ok } from '../lib/supabase'
import type { StockLote, StockSemaforo } from '../lib/types'
export const getSemaforo = () => supabase.from('v_stock_semaforo').select('*').order('producto').then((r) => ok<StockSemaforo[]>(r))
export const getLotesStock = () => supabase.from('v_stock_lotes').select('*').order('fecha').then((r) => ok<StockLote[]>(r))
/** Guarda mínimo e ideal de un producto (ambos opcionales). Si los dos quedan vacíos, se borra la fila. */
export const guardarNiveles = (producto_id: number, niveles: { kg_minimo: number | null; kg_ideal: number | null }) => niveles.kg_minimo == null && niveles.kg_ideal == null
  ? supabase.from('stock_minimos').delete().eq('producto_id', producto_id).then(ok)
  : supabase.from('stock_minimos').upsert({ producto_id, kg_minimo: niveles.kg_minimo, kg_ideal: niveles.kg_ideal, updated_at: new Date().toISOString() }).then(ok)
