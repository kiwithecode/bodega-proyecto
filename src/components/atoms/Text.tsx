import type { CSSProperties, ReactNode } from 'react'
import s from './Text.module.css'
type P = { children?: ReactNode; style?: CSSProperties; className?: string }
export const Mono = ({ children, style, className = '' }: P) => <span className={`${s.mono} ${className}`} style={style}>{children}</span>
export const Ayuda = ({ children, style, className = '' }: P) => <div className={`${s.ayuda} ${className}`} style={style}>{children}</div>
export const Sub = ({ children }: P) => <p className={s.sub}>{children}</p>
