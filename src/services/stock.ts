import { supabase, ok } from '../lib/supabase'
import type { StockLote, StockSemaforo } from '../lib/types'
export const getSemaforo = () => supabase.from('v_stock_semaforo').select('*').order('producto').then((r) => ok<StockSemaforo[]>(r))
export const getLotesStock = () => supabase.from('v_stock_lotes').select('*').order('fecha').then((r) => ok<StockLote[]>(r))
export const guardarMinimo = (producto_id: number, kg: number | null) => kg == null
  ? supabase.from('stock_minimos').delete().eq('producto_id', producto_id).then(ok)
  : supabase.from('stock_minimos').upsert({ producto_id, kg_minimo: kg, updated_at: new Date().toISOString() }).then(ok)
