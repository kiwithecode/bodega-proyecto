import type { SelectHTMLAttributes } from 'react'
import s from './Control.module.css'
export interface Opcion { value: string | number; label: string }
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { opciones: Opcion[]; chico?: boolean }
export function Select({ opciones, chico, className = '', ...props }: SelectProps) {
  return (
    <select className={[s.control, chico && s.chico, className].filter(Boolean).join(' ')} {...props}>
      {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
