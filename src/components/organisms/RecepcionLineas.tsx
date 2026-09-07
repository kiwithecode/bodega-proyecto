import { Button, Input, Mono, Select } from '../atoms'
import { Combo } from '../molecules'
import { DataTable, type Columna } from './DataTable'
import { fmt, num, codigoLote } from '../../lib/format'
import type { LineaRecepcion, Producto } from '../../lib/types'

export const lineaVacia = (): LineaRecepcion => ({ producto_id: null, kg_real: '', precio_kg: '', kg_factura: '', calidad_ok: true, observaciones: '' })

export function RecepcionLineas({ lineas, onChange, productos, provCodigo, fecha }: { lineas: LineaRecepcion[]; onChange: (l: LineaRecepcion[]) => void; productos: Producto[]; provCodigo?: number | null; fecha: string }) {
  const set = <K extends keyof LineaRecepcion>(i: number, campo: K, v: LineaRecepcion[K]) => onChange(lineas.map((l, j) => j === i ? { ...l, [campo]: v } : l))
  const quitar = (i: number) => onChange(lineas.filter((_, j) => j !== i))
  const validas = lineas.filter((l) => l.producto_id && num(l.kg_real) > 0)
  const kg = validas.reduce((a, l) => a + num(l.kg_real), 0)
  const total = validas.reduce((a, l) => a + num(l.kg_real) * num(l.precio_kg), 0)
  const prod = (l: LineaRecepcion) => productos.find((p) => p.id === l.producto_id)

  const columnas: Columna<LineaRecepcion>[] = [
    { key: 'producto', titulo: 'Producto', ancho: '30%', render: (l, i) => <Combo opciones={productos} value={l.producto_id} onChange={(v) => set(i, 'producto_id', v)} clave={(p) => p.id} mostrar={(p) => p.nombre} extra={(p) => `${p.codigo} · ${p.especies?.nombre ?? ''}`} chico aria-label={`Producto fila ${i + 1}`} /> },
    { key: 'kg', titulo: 'Peso real (kg)', n: true, render: (l, i) => <Input tipo="number" chico step="0.001" min="0" value={l.kg_real} onChange={(e) => set(i, 'kg_real', e.target.value)} aria-label={`Peso fila ${i + 1}`} /> },
    { key: 'precio', titulo: 'Precio $/kg', n: true, render: (l, i) => <Input tipo="number" chico step="0.0001" min="0" value={l.precio_kg} onChange={(e) => set(i, 'precio_kg', e.target.value)} aria-label={`Precio fila ${i + 1}`} /> },
    { key: 'kgf', titulo: 'Peso factura', n: true, render: (l, i) => <Input tipo="number" chico step="0.001" min="0" value={l.kg_factura} onChange={(e) => set(i, 'kg_factura', e.target.value)} placeholder="opcional" /> },
    { key: 'total', titulo: 'Total', n: true, render: (l) => fmt.usd(num(l.kg_real) * num(l.precio_kg)) },
    { key: 'lote', titulo: 'Lote', render: (l) => <Mono>{codigoLote(provCodigo, prod(l)?.codigo, fecha)}</Mono> },
    { key: 'cal', titulo: 'Calidad', render: (l, i) => <Select chico value={l.calidad_ok ? '1' : '0'} onChange={(e) => set(i, 'calidad_ok', e.target.value === '1')} opciones={[{ value: '1', label: 'Buena' }, { value: '0', label: 'Con observación' }]} /> },
    { key: 'x', titulo: '', render: (_, i) => <Button tamano="chico" onClick={() => quitar(i)} title="Quitar fila">×</Button> },
  ]
  return <DataTable columnas={columnas} filas={lineas} filaKey={(_, i) => i} vacio="Agrega una fila." total={[`${validas.length} fila(s)`, fmt.kg(kg), '', '', fmt.usd(total), '', '', '']} />
}
