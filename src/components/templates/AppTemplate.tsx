import type { ReactNode } from 'react'
import s from './Templates.module.css'
export function AppTemplate({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return <div className={s.app}>{sidebar}<main className={s.main}>{children}</main></div>
}
