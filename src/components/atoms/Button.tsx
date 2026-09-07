import type { ButtonHTMLAttributes } from 'react'
import s from './Button.module.css'
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'normal' | 'primario' | 'texto'; tamano?: 'normal' | 'chico'; bloque?: boolean
}
export function Button({ variante = 'normal', tamano = 'normal', bloque, className = '', type = 'button', ...props }: ButtonProps) {
  const cls = [s.btn, variante !== 'normal' && s[variante], tamano === 'chico' && s.chico, bloque && s.bloque, className].filter(Boolean).join(' ')
  return <button type={type} className={cls} {...props} />
}
