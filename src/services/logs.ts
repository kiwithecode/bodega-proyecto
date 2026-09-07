import { supabase, ok } from '../lib/supabase'
import type { Auditoria, LogApp, LogResumen, NivelLog } from '../lib/types'

/** Manda un log a la base. Nunca lanza: un log que falla no debe romper nada. */
export function log(nivel: NivelLog, origen: string, mensaje: unknown, detalle?: unknown): Promise<void> {
  try {
    return Promise.resolve(supabase.rpc('fn_log', {
      p_nivel: nivel, p_origen: origen, p_mensaje: String(mensaje).slice(0, 2000),
      p_detalle: detalle ?? null, p_url: window.location.pathname + window.location.search, p_agente: navigator.userAgent,
    })).then(() => undefined, () => undefined)
  } catch { return Promise.resolve() }
}
export const logError = (origen: string, err: unknown, extra?: Record<string, unknown>) => {
  const e = err as { message?: string; stack?: string } | null
  return log('error', origen, e?.message ?? err, { stack: e?.stack?.slice(0, 3000), ...extra })
}
/** Errores de JS no atrapados y promesas rechazadas. Llamar una vez al arrancar. */
export function instalarCapturaGlobal() {
  window.addEventListener('error', (e) => { void logError('navegador', e.error ?? e.message, { archivo: e.filename, linea: e.lineno }) })
  window.addEventListener('unhandledrejection', (e) => { void logError('navegador', e.reason ?? 'Promesa rechazada') })
}

export const getAuditoria = ({ limite = 200, tabla, texto }: { limite?: number; tabla?: string; texto?: string } = {}) => {
  let q = supabase.from('v_auditoria').select('*').limit(limite)
  if (tabla) q = q.eq('tabla', tabla)
  if (texto?.trim()) { const t = texto.trim(); q = q.or(`referencia.ilike.%${t}%,usuario.ilike.%${t}%,resumen.ilike.%${t}%`) }
  return q.then((r) => ok<Auditoria[]>(r))
}
export const getLogs = ({ limite = 200, nivel }: { limite?: number; nivel?: NivelLog } = {}) => {
  let q = supabase.from('logs_app').select('*').order('ts', { ascending: false }).limit(limite)
  if (nivel) q = q.eq('nivel', nivel)
  return q.then((r) => ok<LogApp[]>(r))
}
export const getLogsResumen = () => supabase.from('v_logs_resumen').select('*').then((r) => ok<LogResumen[]>(r))
