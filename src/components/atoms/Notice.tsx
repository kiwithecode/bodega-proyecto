import type { CSSProperties, ReactNode } from 'react'
import s from './Notice.module.css'
export type TipoNotice = 'info' | 'ok' | 'warn' | 'error'
/** No renderiza nada si no hay contenido. */
export function Notice({ tipo = 'info', children, style }: { tipo?: TipoNotice; children?: ReactNode; style?: CSSProperties }) {
  if (!children) return null
  return <div className={`${s.aviso} ${s[tipo]}`} style={style} role={tipo === 'error' ? 'alert' : 'status'}>{children}</div>
}
