import s from './Tabs.module.css'
export interface TabItem<K extends string> { id: K; label: string }
export function Tabs<K extends string>({ items, activo, onChange }: { items: TabItem<K>[]; activo: K; onChange: (k: K) => void }) {
  return (
    <div className={s.tabs} role="tablist">
      {items.map((t) => <button key={t.id} type="button" role="tab" aria-selected={activo === t.id} className={`${s.tab} ${activo === t.id ? s.activo : ''}`} onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  )
}
