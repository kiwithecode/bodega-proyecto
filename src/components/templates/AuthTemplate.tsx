import type { ReactNode } from 'react'
import s from './Templates.module.css'
export function AuthTemplate({ children }: { children: ReactNode }) { return <div className={s.auth}>{children}</div> }
