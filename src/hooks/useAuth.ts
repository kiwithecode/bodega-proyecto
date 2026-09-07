import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSession, onAuthChange } from '../services/auth'
/** undefined = cargando, null = sin sesión */
export function useAuth() {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined)
  useEffect(() => { void getSession().then(setSesion); const sub = onAuthChange(setSesion); return () => sub.unsubscribe() }, [])
  return sesion
}
