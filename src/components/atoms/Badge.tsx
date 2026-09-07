import type { ReactNode } from 'react'
import s from './Badge.module.css'
import type { Semaforo, Veredicto } from '../../lib/types'
export type Tono = 'ok' | 'aviso' | 'critico' | 'info' | 'neutro'
export function Badge({ tono = 'neutro', children, style }: { tono?: Tono; children: ReactNode; style?: React.CSSProperties }) {
  return <span className={`${s.pill} ${s[tono]}`} style={style}>{children}</span>
}
export const tonoSemaforo = (v: Semaforo): Tono => v === 'OK' ? 'ok' : v === 'BAJO' ? 'aviso' : 'critico'
export const tonoNivel = (n: number): Tono => n === 1 ? 'critico' : n === 2 ? 'aviso' : n === 3 ? 'info' : 'neutro'
export const tonoVeredicto = (v: Veredicto): Tono => v === 'REPETIDO' ? 'critico' : v === 'PARECIDO' ? 'neutro' : 'aviso'
