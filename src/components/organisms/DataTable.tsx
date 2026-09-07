import type { ReactNode } from 'react'
import s from './DataTable.module.css'

export interface Columna<T> { key: string; titulo: ReactNode; n?: boolean; ancho?: string | number; render?: (fila: T, i: number) => ReactNode }
export interface DataTableProps<T> {
  columnas: Columna<T>[]; filas: T[]
  filaKey?: (fila: T, i: number) => string | number
  onFila?: (fila: T) => void; seleccionada?: (fila: T) => boolean; apagada?: (fila: T) => boolean
  total?: ReactNode[]; vacio?: string; maxAltura?: number
}
/** Tabla declarativa: las páginas nunca escriben <table> a mano. */
export function DataTable<T>({ columnas, filas, filaKey, onFila, seleccionada, apagada, total, vacio = 'Nada que mostrar.', maxAltura }: DataTableProps<T>) {
  const key = (f: T, i: number) => filaKey ? filaKey(f, i) : ((f as { id?: string | number }).id ?? i)
  const celda = (c: Columna<T>, f: T, i: number): ReactNode => c.render ? c.render(f, i) : String((f as Record<string, unknown>)[c.key] ?? '')
  return (
    <div className={s.scroll} style={maxAltura ? { maxHeight: maxAltura } : undefined}>
      <table className={s.tabla}>
        <thead><tr>{columnas.map((c) => <th key={c.key} className={c.n ? s.n : ''} style={c.ancho ? { width: c.ancho } : undefined}>{c.titulo}</th>)}</tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={key(f, i)} onClick={onFila ? () => onFila(f) : undefined}
              className={[onFila && s.click, seleccionada?.(f) && s.sel, apagada?.(f) && s.apagado].filter(Boolean).join(' ')}>
              {columnas.map((c) => <td key={c.key} className={c.n ? s.n : ''}>{celda(c, f, i)}</td>)}
            </tr>
          ))}
          {filas.length === 0 && <tr><td colSpan={columnas.length} className={s.vacio}>{vacio}</td></tr>}
          {total && <tr className={s.total}>{total.map((v, i) => <td key={i} className={columnas[i]?.n ? s.n : ''}>{v}</td>)}</tr>}
        </tbody>
      </table>
    </div>
  )
}
