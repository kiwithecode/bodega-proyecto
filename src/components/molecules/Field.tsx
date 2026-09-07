import type { CSSProperties, ReactNode } from 'react'
import s from './Field.module.css'
import { Ayuda } from '../atoms'
export function Field({ label, ayuda, children, style }: { label?: ReactNode; ayuda?: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div className={s.campo} style={style}>
      {label && <label className={s.label}>{label}</label>}
      {children}
      {ayuda && <Ayuda>{ayuda}</Ayuda>}
    </div>
  )
}
