import { useState, type FormEvent } from 'react'
import { Button, Input, Notice, Sub } from '../components/atoms'
import { Field } from '../components/molecules'
import { Panel } from '../components/organisms'
import { AuthTemplate } from '../components/templates'
import { signIn } from '../services/auth'

export default function Login() {
  const [email, setEmail] = useState(''); const [clave, setClave] = useState('')
  const [error, setError] = useState(''); const [cargando, setCargando] = useState(false)
  const entrar = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setCargando(true)
    try { await signIn(email, clave) } catch (er) { const m = (er as Error).message; setError(m === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : m) }
    setCargando(false)
  }
  return (
    <AuthTemplate>
      <Panel>
        <form onSubmit={entrar}>
          <h1>Bodega de producción</h1>
          <Sub>Entra con tu usuario para registrar lotes.</Sub>
          <div style={{ height: 14 }} />
          <Field label="Correo"><Input tipo="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required aria-label="Correo" /></Field>
          <Field label="Contraseña"><Input tipo="password" value={clave} onChange={(e) => setClave(e.target.value)} required aria-label="Contraseña" /></Field>
          <Notice tipo="error">{error}</Notice>
          <Button type="submit" variante="primario" bloque disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</Button>
        </form>
      </Panel>
    </AuthTemplate>
  )
}
