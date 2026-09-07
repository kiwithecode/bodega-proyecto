import { NavLink } from 'react-router-dom'
import s from './Sidebar.module.css'
export interface NavItem { to: string; label: string; badge?: number }
export function Sidebar({ titulo, subtitulo, items, usuario, onSalir }: { titulo: string; subtitulo: string; items: NavItem[]; usuario?: string; onSalir: () => void }) {
  return (
    <nav className={s.nav}>
      <div className={s.marca}><b>{titulo}</b><span>{subtitulo}</span></div>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => `${s.link} ${isActive ? s.activo : ''}`}>
          {it.label}{(it.badge ?? 0) > 0 && <span className={s.badge}>{it.badge}</span>}
        </NavLink>
      ))}
      <div className={s.pie}>{usuario}<br /><button type="button" onClick={onSalir}>Cerrar sesión</button></div>
    </nav>
  )
}
