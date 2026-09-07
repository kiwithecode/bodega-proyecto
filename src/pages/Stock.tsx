import { useState } from 'react'
import { Ayuda, Button, Input, Mono, Notice } from '../components/atoms'
import { Tabs } from '../components/molecules'
import { DataTable, Panel, StockTable } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import { fmt } from '../lib/format'
import type { StockLote, StockSemaforo } from '../lib/types'
import * as srv from '../services/stock'
import { exportarExcel } from '../services/excel'

type Tab = 'productos' | 'lotes'
export default function Stock() {
  const [tab, setTab] = useState<Tab>('productos'); const [q, setQ] = useState(''); const [msg, setMsg] = useState('')
  const prod = useAsync<StockSemaforo[]>(srv.getSemaforo, [], []); const lotes = useAsync<StockLote[]>(srv.getLotesStock, [], [])
  const f = q.trim().toLowerCase()
  const prodF = prod.data.filter((p) => !f || `${p.producto} ${p.codigo} ${p.especie ?? ''}`.toLowerCase().includes(f))
  const loteF = lotes.data.filter((l) => !f || `${l.codigo} ${l.producto} ${l.proveedor ?? ''}`.toLowerCase().includes(f))
  const totKg = prodF.reduce((a, p) => a + Number(p.kg_disponible), 0); const totVal = prodF.reduce((a, p) => a + Number(p.valor_stock), 0)

  const minimo = (p: StockSemaforo, kg: number | null) => Promise.resolve(srv.guardarMinimo(p.producto_id, kg)).then(() => prod.recargar()).catch((e: Error) => setMsg(e.message))
  const exportar = () => exportarExcel([
    { nombre: 'Stock por producto', filas: prodF.map((p) => ({ Código: p.codigo, Producto: p.producto, Especie: p.especie, 'Kg disponibles': +p.kg_disponible, Lotes: p.lotes, 'Costo prom $/kg': p.costo_kg_prom, 'Valor $': +p.valor_stock, 'Mínimo kg': p.kg_minimo, 'Consumo kg/día': p.kg_por_dia, 'Días cobertura': p.dias_cobertura, 'Días en cámara': p.dias_lote_mas_antiguo, Estado: p.semaforo })) },
    { nombre: 'Stock por lote', filas: loteF.map((l) => ({ Lote: l.codigo, Fecha: l.fecha, Producto: l.producto, Proveedor: l.proveedor, Origen: l.origen, 'Kg inicial': +l.kg_inicial, 'Kg disponibles': +l.kg_disponible, 'Costo $/kg': +l.costo_kg, 'Valor $': +l.valor_stock, 'Días en cámara': l.dias_en_camara })) },
  ], 'stock')

  return (
    <PageTemplate titulo="Stock" subtitulo={`${fmt.kg(totKg)} kg en cámara, valorados en ${fmt.usd(totVal)}.`} acciones={<>
      <Input placeholder="Buscar producto, lote o proveedor…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />
      <Button onClick={exportar}>Exportar a Excel</Button></>}>
      <Notice tipo="error">{msg || prod.error || lotes.error}</Notice>
      <Panel>
        <Tabs<Tab> activo={tab} onChange={setTab} items={[{ id: 'productos', label: `Por producto (${prodF.length})` }, { id: 'lotes', label: `Por lote (${loteF.length})` }]} />
        {tab === 'productos' && <StockTable filas={prodF} onMinimo={minimo} />}
        {tab === 'lotes' && <DataTable<StockLote> filas={loteF} columnas={[
          { key: 'codigo', titulo: 'Lote', render: (l) => <Mono>{l.codigo}</Mono> },
          { key: 'producto', titulo: 'Producto' },
          { key: 'proveedor', titulo: 'Proveedor', render: (l) => l.proveedor ?? <i>mezcla</i> },
          { key: 'fecha', titulo: 'Ingreso', render: (l) => fmt.fecha(l.fecha) },
          { key: 'dias', titulo: 'Días', n: true, render: (l) => l.dias_en_camara },
          { key: 'ki', titulo: 'kg inicial', n: true, render: (l) => fmt.kg(l.kg_inicial) },
          { key: 'kd', titulo: 'kg disp.', n: true, render: (l) => <b>{fmt.kg(l.kg_disponible)}</b> },
          { key: 'c', titulo: 'Costo $/kg', n: true, render: (l) => fmt.usd4(l.costo_kg) },
          { key: 'v', titulo: 'Valor', n: true, render: (l) => fmt.usd(l.valor_stock) },
        ]} />}
      </Panel>
      <Ayuda style={{ marginTop: 10 }}>El mínimo en kg es opcional: si lo pones, el tablero avisa cuando el producto baja de esa cantidad. La cobertura usa el consumo real de los últimos 30 días.</Ayuda>
    </PageTemplate>
  )
}
