import type { Session } from '@supabase/supabase-js'
import { supabase, ok } from '../lib/supabase'
export const getSession = () => supabase.auth.getSession().then(({ data }) => data.session)
export const onAuthChange = (cb: (s: Session | null) => void) => supabase.auth.onAuthStateChange((_e, s) => cb(s)).data.subscription
export const signIn = (email: string, password: string) => supabase.auth.signInWithPassword({ email, password }).then((r) => ok(r))
export const signOut = () => supabase.auth.signOut()
