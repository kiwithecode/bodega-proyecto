import { supabase, ok } from '../lib/supabase'
import type { Alerta, Kpis } from '../lib/types'
export const getKpis = (desde: string, hasta: string) => supabase.rpc('fn_kpis', { p_desde: desde, p_hasta: hasta }).then((r) => ok<Kpis[]>(r)).then((d) => d?.[0] ?? null)
export const getAlertas = () => supabase.from('v_alertas').select('*').order('nivel').then((r) => ok<Alerta[]>(r))
export const getAlertasResumen = () => supabase.rpc('fn_alertas_resumen').then((r) => ok<{ nivel: number; cantidad: number }[]>(r))
