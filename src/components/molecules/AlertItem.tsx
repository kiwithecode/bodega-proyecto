import type { ReactNode } from 'react'
import s from './AlertItem.module.css'
export function AlertItem({ nivel, mensaje, tipo, referencia, accion }: { nivel: number; mensaje: string; tipo: string; referencia?: string | null; accion?: ReactNode }) {
  return (
    <div className={s.alerta}>
      <div className={`${s.barra} ${s['n' + nivel]}`} />
      <div><div>{mensaje}</div><div className={s.tipo}>{tipo}{referencia ? ` · ${referencia}` : ''}</div></div>
      {accion ?? <span />}
    </div>
  )
}
