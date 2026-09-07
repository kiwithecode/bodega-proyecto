import type { InputHTMLAttributes } from 'react'
import s from './Control.module.css'
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { tipo?: string; chico?: boolean; mono?: boolean }
export function Input({ tipo = 'text', chico, mono, className = '', ...props }: InputProps) {
  const cls = [s.control, tipo === 'number' && s.numero, chico && s.chico, mono && s.mono, className].filter(Boolean).join(' ')
  return <input type={tipo} className={cls} {...props} />
}
