import type { CSSProperties, ReactNode } from 'react'
import s from './Panel.module.css'
export function Panel({ titulo, acciones, children, style }: { titulo?: ReactNode; acciones?: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  return (
    <section className={s.panel} style={style}>
      {(titulo || acciones) && <div className={s.cab}>{titulo && <h2>{titulo}</h2>}{acciones && <div className={s.acciones}>{acciones}</div>}</div>}
      {children}
    </section>
  )
}
export function PanelPie({ izquierda, children }: { izquierda?: ReactNode; children?: ReactNode }) {
  return <div className={s.pie}>{izquierda}<span className={s.sep} />{children}</div>
}
export const Grid = ({ dos, kpis, form, children, style }: { dos?: boolean; kpis?: boolean; form?: boolean; children?: ReactNode; style?: CSSProperties }) => (
  <div className={[s.grid, dos && s.dos, kpis && s.kpis, form && s.form].filter(Boolean).join(' ')} style={style}>{children}</div>
)
