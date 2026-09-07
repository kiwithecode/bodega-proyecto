import s from './Chips.module.css'
export interface ChipItem { valor: string; detalle?: string }
export function Chips({ items, valor, onChange }: { items: ChipItem[]; valor: string; onChange: (v: string) => void }) {
  return (
    <div className={s.chips}>
      {items.map((c) => <button key={c.valor} type="button" className={`${s.chip} ${valor === c.valor ? s.sel : ''}`} onClick={() => onChange(c.valor)} title={c.detalle}>{c.valor}{c.detalle && <small>{c.detalle}</small>}</button>)}
    </div>
  )
}
