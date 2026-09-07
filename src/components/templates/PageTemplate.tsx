import type { ReactNode } from 'react'
import { Sub } from '../atoms'
import s from './Templates.module.css'
export function PageTemplate({ titulo, subtitulo, acciones, children }: { titulo: string; subtitulo?: ReactNode; acciones?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <div className={s.cab}><div><h1>{titulo}</h1>{subtitulo && <Sub>{subtitulo}</Sub>}</div>{acciones && <div className={s.acciones}>{acciones}</div>}</div>
      {children}
    </>
  )
}
