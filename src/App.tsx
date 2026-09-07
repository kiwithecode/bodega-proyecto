import { useEffect, useState, type ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary, Sidebar } from './components/organisms'
import { AppTemplate } from './components/templates'
import { useAuth } from './hooks/useAuth'
import { signOut } from './services/auth'
import { getAlertasResumen } from './services/tablero'
import Login from './pages/Login'
import Tablero from './pages/Tablero'
import Recibir from './pages/Recibir'
import Procesar from './pages/Procesar'
import Stock from './pages/Stock'
import Lotes from './pages/Lotes'
import Costos from './pages/Costos'
import Catalogos from './pages/Catalogos'
import Actividad from './pages/Actividad'

export const RUTAS: { to: string; label: string; el: ReactElement }[] = [
  { to: '/', label: 'Tablero', el: <Tablero /> },
  { to: '/recibir', label: 'Recibir', el: <Recibir /> },
  { to: '/procesar', label: 'Procesar', el: <Procesar /> },
  { to: '/stock', label: 'Stock', el: <Stock /> },
  { to: '/lotes', label: 'Lotes', el: <Lotes /> },
  { to: '/costos', label: 'Costos', el: <Costos /> },
  { to: '/catalogos', label: 'Catálogos', el: <Catalogos /> },
  { to: '/actividad', label: 'Actividad', el: <Actividad /> },
]

export default function App() {
  const sesion = useAuth()
  const [alertas, setAlertas] = useState(0)
  useEffect(() => {
    if (!sesion) return
    const cargar = () => Promise.resolve(getAlertasResumen()).then((d) => setAlertas(d.filter((r) => r.nivel <= 2).reduce((a, r) => a + Number(r.cantidad), 0))).catch(() => undefined)
    void cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t)
  }, [sesion])

  if (sesion === undefined) return null
  if (!sesion) return <Login />
  return (
    <AppTemplate sidebar={<Sidebar titulo="Bodega de producción" subtitulo="Lotes, procesos y costos" usuario={sesion.user.email} onSalir={() => void signOut()}
      items={RUTAS.map((r) => ({ to: r.to, label: r.label, badge: r.to === '/' ? alertas : 0 }))} />}>
      <ErrorBoundary>
        <Routes>
          {RUTAS.map((r) => <Route key={r.to} path={r.to} element={r.el} />)}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </ErrorBoundary>
    </AppTemplate>
  )
}
