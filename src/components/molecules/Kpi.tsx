import type { ReactNode } from 'react'
import s from './Kpi.module.css'
export function Kpi({ valor, etiqueta }: { valor: ReactNode; etiqueta: string }) {
  return <div className={s.kpi}><div className={s.v}>{valor ?? '—'}</div><div className={s.l}>{etiqueta}</div></div>
}
