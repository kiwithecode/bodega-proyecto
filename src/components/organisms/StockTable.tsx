import { Badge, Button, Input, Mono, tonoSemaforo } from '../atoms'
import { DataTable, type Columna } from './DataTable'
import { fmt } from '../../lib/format'
import type { StockSemaforo } from '../../lib/types'
const orden = { 'SIN STOCK': 0, BAJO: 1, OK: 2 }
export interface StockTableProps {
  filas: StockSemaforo[]
  /** Si se pasa, la columna "Mínimo kg" es editable. */
  onMinimo?: (p: StockSemaforo, kg: number | null) => void
  /** Si se pasa, cada producto tiene un botón para ir a sus lotes (editar / anular). */
  onVerLotes?: (p: StockSemaforo) => void
  compacta?: boolean; maxAltura?: number
}
export function StockTable({ filas, onMinimo, onVerLotes, compacta, maxAltura }: StockTableProps) {
  const datos = [...filas].sort((a, b) => orden[a.semaforo] - orden[b.semaforo] || a.producto.localeCompare(b.producto))
  const columnas = ([
    { key: 'producto', titulo: 'Producto', render: (p) => <>{p.producto} <Mono style={{ color: 'var(--ink-3)' }}>{p.codigo}</Mono></> },
    !compacta && { key: 'especie', titulo: 'Especie' },
    { key: 'kg', titulo: 'kg', n: true, render: (p) => <b>{fmt.kg(p.kg_disponible)}</b> },
    !compacta && { key: 'lotes', titulo: 'Lotes', n: true },
    !compacta && { key: 'costo', titulo: 'Costo prom.', n: true, render: (p) => fmt.usd4(p.costo_kg_prom) },
    !compacta && { key: 'valor', titulo: 'Valor', n: true, render: (p) => fmt.usd(p.valor_stock) },
    onMinimo && { key: 'min', titulo: 'Mínimo kg', n: true, ancho: 110, render: (p) => (
      <Input tipo="number" chico step="0.1" min="0" defaultValue={p.kg_minimo ?? ''} placeholder="—" aria-label={`Mínimo ${p.producto}`}
        onBlur={(e) => { if (String(p.kg_minimo ?? '') !== e.target.value) onMinimo(p, e.target.value === '' ? null : Number(e.target.value)) }} />) },
    { key: 'cob', titulo: 'Cobertura', n: true, render: (p) => p.dias_cobertura != null ? `${p.dias_cobertura} d` : '—' },
    compacta && { key: 'dias', titulo: 'Días en cámara', n: true, render: (p) => p.dias_lote_mas_antiguo ?? '—' },
    { key: 'sem', titulo: '', render: (p) => <Badge tono={tonoSemaforo(p.semaforo)}>{p.semaforo}</Badge> },
    onVerLotes && { key: 'ver', titulo: '', render: (p) => <Button tamano="chico" variante="secundario" onClick={() => onVerLotes(p)} disabled={p.lotes === 0} aria-label={`Ver lotes de ${p.producto}`}>Ver lotes</Button> },
  ] as (Columna<StockSemaforo> | false | undefined)[]).filter((c): c is Columna<StockSemaforo> => Boolean(c))
  return <DataTable columnas={columnas} filas={datos} filaKey={(p) => p.producto_id} maxAltura={maxAltura} vacio="Aún no hay lotes." />
}
