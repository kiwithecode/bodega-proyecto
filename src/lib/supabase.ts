import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
if (!url || !key) console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env')

export const supabase = createClient(url ?? 'http://localhost', key ?? 'x')

interface Resp<T> { data: T | null | unknown; error: { message?: string; code?: string; details?: string; hint?: string } | null }

/**
 * Desenvuelve { data, error } de Supabase: lanza si hay error, devuelve data si no.
 * Cada error de la base queda registrado en logs_app (origen 'supabase') antes de lanzarse.
 */
export function ok<T>({ data, error }: Resp<T>): T {
  if (error) {
    const msg = error.message || String(error)
    registrar(msg, error)
    throw new Error(msg)
  }
  return data as T
}

function registrar(msg: string, error: { code?: string; details?: string; hint?: string }) {
  try {
    void supabase.rpc('fn_log', {
      p_nivel: 'error', p_origen: 'supabase', p_mensaje: msg,
      p_detalle: { code: error.code, details: error.details, hint: error.hint },
      p_url: typeof window !== 'undefined' ? window.location.pathname : null,
      p_agente: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }).then(() => undefined, () => undefined)
  } catch { /* nunca romper por un log */ }
}
