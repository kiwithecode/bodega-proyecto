import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Input } from '../atoms'
import s from './Combo.module.css'

export interface ComboProps<T, K extends string | number> {
  opciones: T[]; value: K | null; onChange: (v: K | null) => void
  clave: (o: T) => K; mostrar: (o: T) => string; extra?: (o: T) => string
  placeholder?: string; chico?: boolean; autoFocus?: boolean; disabled?: boolean; 'aria-label'?: string
}
/** Cuadro de búsqueda con lista desplegable. Busca en el texto principal y en el secundario. */
export function Combo<T, K extends string | number>({ opciones, value, onChange, clave, mostrar, extra, placeholder = 'Escribe para buscar…', ...inputProps }: ComboProps<T, K>) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [sel, setSel] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const actual = opciones.find((o) => clave(o) === value)

  useEffect(() => { if (!abierto) setTexto(actual ? mostrar(actual) : '') }, [value, opciones, abierto]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar); return () => document.removeEventListener('mousedown', cerrar)
  }, [])

  const q = texto.trim().toLowerCase()
  const lista = (abierto ? opciones.filter((o) => !q || `${mostrar(o)} ${extra?.(o) ?? ''}`.toLowerCase().includes(q)) : []).slice(0, 40)
  const elegir = (o: T | null) => { onChange(o ? clave(o) : null); setAbierto(false); setTexto(o ? mostrar(o) : '') }
  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { setSel((i) => Math.min(i + 1, lista.length - 1)); setAbierto(true); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setSel((i) => Math.max(i - 1, 0)); e.preventDefault() }
    else if (e.key === 'Enter' && abierto && lista[sel]) { elegir(lista[sel]); e.preventDefault() }
    else if (e.key === 'Escape') setAbierto(false)
  }
  return (
    <div className={s.combo} ref={ref}>
      <Input value={texto} placeholder={placeholder} role="combobox" aria-expanded={abierto} {...inputProps}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); setSel(0); if (!e.target.value) onChange(null) }}
        onFocus={() => setAbierto(true)} onKeyDown={teclas} />
      {abierto && (
        <ul className={s.lista} role="listbox">
          {lista.length === 0 && <li className={s.vacio}>Sin coincidencias</li>}
          {lista.map((o, i) => (
            <li key={String(clave(o))} className={`${s.item} ${i === sel ? s.sel : ''}`} onMouseDown={() => elegir(o)} role="option" aria-selected={i === sel}>
              <span>{mostrar(o)}</span>{extra && <span className={s.extra}>{extra(o)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
