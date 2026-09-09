import { Badge, Button, Input, Mono, tonoSemaforo } from '../atoms'
import { DataTable, type Columna } from './DataTable'
import { fmt } from '../../lib/format'
import { maximo } from '../../lib/series'
import type { Semaforo, StockSemaforo } from '../../lib/types'
import s from './StockTable.module.css'

const orden: Record<Semaforo, number> = { 'SIN STOCK': 0, BAJO: 1, ALTO: 2, OK: 3 }
export type NivelStock = 'kg_minimo' | 'kg_ideal'
export interface StockTableProps {
  filas: StockSemaforo[]
  /** Si se pasa, las columnas "Mínimo kg" e "Ideal kg" son editables. */
  onNivel?: (p: StockSemaforo, campo: NivelStock, kg: number | null) => void
  /** Si se pasa, cada producto tiene un botón para ir a sus lotes (editar / anular). */
  onVerLotes?: (p: StockSemaforo) => void
  compacta?: boolean; maxAltura?: number
}

/** Barra de color bajo los kg: llena hasta el ideal (o hasta el mayor de la tabla si no hay ideal); la marca es el mínimo. */
function Medidor({ p, referencia }: { p: StockSemaforo; referencia: number }) {
  const kg = Number(p.kg_disponible)
  const base = p.kg_ideal != null && Number(p.kg_ideal) > 0 ? Number(p.kg_ideal) : referencia
  const pct = base > 0 ? Math.min(100, (kg / base) * 100) : 0
  const min = p.kg_minimo != null && base > 0 ? Math.min(100, (Number(p.kg_minimo) / base) * 100) : null
  return (
    <div className={`${s.medidor} ${s[tonoSemaforo(p.semaforo)]}`} role="img" aria-label={`${fmt.kg(kg)} kg, ${p.semaforo}`} title={`${fmt.kg(kg)} kg${p.kg_minimo != null ? ` · mínimo ${fmt.kg(p.kg_minimo)}` : ''}${p.kg_ideal != null ? ` · ideal ${fmt.kg(p.kg_ideal)}` : ''}`}>
      <div className={s.relleno} style={{ width: `${pct}%` }} />
      {min != null && <span className={s.marca} style={{ left: `calc(${min}% - 1px)` }} />}
    </div>
  )
}

const nivelInput = (p: StockSemaforo, campo: NivelStock, etiqueta: string, onNivel: NonNullable<StockTableProps['onNivel']>) => (
  <Input tipo="number" chico step="0.1" min="0" defaultValue={p[campo] ?? ''} placeholder="—" aria-label={`${etiqueta} ${p.producto}`}
    onBlur={(e) => { if (String(p[campo] ?? '') !== e.target.value) onNivel(p, campo, e.target.value === '' ? null : Number(e.target.value)) }} />
)

export function StockTable({ filas, onNivel, onVerLotes, compacta, maxAltura }: StockTableProps) {
  const datos = [...filas].sort((a, b) => orden[a.semaforo] - orden[b.semaforo] || a.producto.localeCompare(b.producto))
  const referencia = maximo(filas.map((p) => Number(p.kg_disponible)))
  const columnas = ([
    { key: 'producto', titulo: 'Producto', render: (p) => <>{p.producto} <Mono style={{ color: 'var(--ink-3)' }}>{p.codigo}</Mono></> },
    !compacta && { key: 'especie', titulo: 'Especie' },
    { key: 'kg', titulo: 'kg', n: true, render: (p) => <div className={s.kg}><b>{fmt.kg(p.kg_disponible)}</b><Medidor p={p} referencia={referencia} /></div> },
    !compacta && { key: 'lotes', titulo: 'Lotes', n: true },
    !compacta && { key: 'costo', titulo: 'Costo prom.', n: true, render: (p) => fmt.usd4(p.costo_kg_prom) },
    !compacta && { key: 'valor', titulo: 'Valor', n: true, render: (p) => fmt.usd(p.valor_stock) },
    onNivel && { key: 'min', titulo: 'Mínimo kg', n: true, ancho: 100, render: (p) => nivelInput(p, 'kg_minimo', 'Mínimo', onNivel) },
    onNivel && { key: 'ideal', titulo: 'Ideal kg', n: true, ancho: 100, render: (p) => nivelInput(p, 'kg_ideal', 'Ideal', onNivel) },
    { key: 'cob', titulo: 'Cobertura', n: true, render: (p) => p.dias_cobertura != null ? `${p.dias_cobertura} d` : '—' },
    compacta && { key: 'dias', titulo: 'Días en cámara', n: true, render: (p) => p.dias_lote_mas_antiguo ?? '—' },
    { key: 'sem', titulo: '', render: (p) => <Badge tono={tonoSemaforo(p.semaforo)}>{p.semaforo}</Badge> },
    onVerLotes && { key: 'ver', titulo: '', render: (p) => <Button tamano="chico" variante="secundario" onClick={() => onVerLotes(p)} disabled={p.lotes === 0} aria-label={`Ver lotes de ${p.producto}`}>Ver lotes</Button> },
  ] as (Columna<StockSemaforo> | false | undefined)[]).filter((c): c is Columna<StockSemaforo> => Boolean(c))
  return <DataTable columnas={columnas} filas={datos} filaKey={(p) => p.producto_id} maxAltura={maxAltura} vacio="Aún no hay lotes." />
}

/** Leyenda de los cuatro estados, para ponerla sobre la tabla. */
export function LeyendaSemaforo() {
  const items: { s: Semaforo; texto: string }[] = [
    { s: 'SIN STOCK', texto: 'Sin stock' }, { s: 'BAJO', texto: 'Bajo: menos del mínimo o de 2 días de consumo' },
    { s: 'OK', texto: 'Normal' }, { s: 'ALTO', texto: 'Alto: por encima del ideal (o del máximo general de Parámetros)' },
  ]
  const color: Record<Semaforo, string> = { 'SIN STOCK': 'var(--rojo)', BAJO: 'var(--ambar)', OK: 'var(--verde)', ALTO: 'var(--azul)' }
  return <div className={s.leyenda}>{items.map((i) => <span key={i.s}><i style={{ background: color[i.s] }} />{i.texto}</span>)}</div>
}
