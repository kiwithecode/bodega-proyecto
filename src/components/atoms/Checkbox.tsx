import type { InputHTMLAttributes, ReactNode } from 'react'
import s from './Control.module.css'
export function Checkbox({ children, ...props }: InputHTMLAttributes<HTMLInputElement> & { children?: ReactNode }) {
  return <label className={s.check}><input type="checkbox" {...props} /> {children}</label>
}
