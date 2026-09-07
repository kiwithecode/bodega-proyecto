import { Ayuda, Button, Input } from '../atoms'
import { Combo } from '../molecules'
import { DataTable, type Columna } from './DataTable'
import { fmt } from '../../lib/format'
import type { EntradaForm, StockLote } from '../../lib/types'

export const entradaVacia = (): EntradaForm => ({ lote_id: null, kg_tomados: '', kg_devueltos: '' })

export function ProcesoEntradas({ entradas, onChange, lotes, consumo, costoEntrada }: { entradas: EntradaForm[]; onChange: (e: EntradaForm[]) => void; lotes: StockLote[]; consumo: number; costoEntrada: number }) {
  const set = <K extends keyof EntradaForm>(i: number, campo: K, v: EntradaForm[K]) => onChange(entradas.map((e, j) => j === i ? { ...e, [campo]: v } : e))
  const lote = (e: EntradaForm) => lotes.find((x) => x.id === e.lote_id)
  const columnas: Columna<EntradaForm>[] = [
    { key: 'lote', titulo: 'Lote', ancho: '45%', render: (e, i) => { const l = lote(e); return (<>
        <Combo opciones={lotes} value={e.lote_id} onChange={(v) => set(i, 'lote_id', v)} clave={(l) => l.id} chico placeholder="Código, producto o proveedor…" aria-label={`Lote fila ${i + 1}`}
          mostrar={(l) => `${l.codigo}  ${l.producto}${l.proveedor ? ' · ' + l.proveedor : ''}`} extra={(l) => `${fmt.kg(l.kg_disponible)} kg · ${fmt.usd4(l.costo_kg)}`} />
        {l && <Ayuda>Disponible {fmt.kg(l.kg_disponible)} kg · ingresó {fmt.fecha(l.fecha)}</Ayuda>}</>) } },
    { key: 'tom', titulo: 'kg tomados', n: true, render: (e, i) => <Input tipo="number" chico step="0.001" min="0" value={e.kg_tomados} onChange={(ev) => set(i, 'kg_tomados', ev.target.value)} aria-label={`kg tomados fila ${i + 1}`} /> },
    { key: 'dev', titulo: 'kg devueltos a cámara', n: true, render: (e, i) => <Input tipo="number" chico step="0.001" min="0" value={e.kg_devueltos} onChange={(ev) => set(i, 'kg_devueltos', ev.target.value)} placeholder="0" /> },
    { key: 'costo', titulo: 'Costo $/kg', n: true, render: (e) => { const l = lote(e); return l ? fmt.usd4(l.costo_kg) : '' } },
    { key: 'x', titulo: '', render: (_, i) => <Button tamano="chico" onClick={() => onChange(entradas.filter((_, j) => j !== i))}>×</Button> },
  ]
  return <DataTable columnas={columnas} filas={entradas} filaKey={(_, i) => i} total={['Consumo real', fmt.kg(consumo), '', fmt.usd(costoEntrada), '']} />
}
