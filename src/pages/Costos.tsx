import { useState } from 'react'
import { Button, Mono, Notice } from '../components/atoms'
import { Tabs } from '../components/molecules'
import { DataTable, Panel } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import { fmt } from '../lib/format'
import type { CostoActual, PrecioCompra, RendimientoProveedor } from '../lib/types'
import * as srv from '../services/costos'
import { exportarExcel } from '../services/excel'

type Tab = 'actual' | 'prov' | 'precios'
export default function Costos() {
  const [tab, setTab] = useState<Tab>('actual')
  const actual = useAsync<CostoActual[]>(srv.getCostoActual, [], []); const prov = useAsync<RendimientoProveedor[]>(srv.getRendimientoProveedor, [], []); const precios = useAsync<PrecioCompra[]>(srv.getPreciosCompra, [], [])
  const exportar = () => exportarExcel([{ nombre: 'Costo actual', filas: actual.data as unknown as Record<string, unknown>[] }, { nombre: 'Rendimiento proveedor', filas: prov.data as unknown as Record<string, unknown>[] }, { nombre: 'Precios compra', filas: precios.data as unknown as Record<string, unknown>[] }], 'costos')
  return (
    <PageTemplate titulo="Costos" subtitulo="Último costo real por producto, quién rinde más y a cuánto se ha comprado." acciones={<Button onClick={exportar}>Exportar a Excel</Button>}>
      <Notice tipo="error">{actual.error || prov.error || precios.error}</Notice>
      <Panel>
        <Tabs<Tab> activo={tab} onChange={setTab} items={[{ id: 'actual', label: 'Costo actual' }, { id: 'prov', label: 'Rendimiento por proveedor' }, { id: 'precios', label: 'Precios de compra' }]} />
        {tab === 'actual' && <DataTable<CostoActual> filas={actual.data} filaKey={(r) => r.producto_codigo} columnas={[
          { key: 'p', titulo: 'Producto', render: (r) => <>{r.producto} <Mono style={{ color: 'var(--ink-3)' }}>{r.producto_codigo}</Mono></> },
          { key: 'c', titulo: 'Último costo $/kg', n: true, render: (r) => <b>{fmt.usd4(r.ultimo_costo_kg)}</b> },
          { key: 'f', titulo: 'Fecha', render: (r) => fmt.fecha(r.fecha_ultimo) },
          { key: 'l', titulo: 'Lote', render: (r) => <Mono>{r.lote}</Mono> },
          { key: 'pr', titulo: 'Proveedor', render: (r) => r.proveedor ?? 'mezcla' },
        ]} />}
        {tab === 'prov' && <DataTable<RendimientoProveedor> filas={prov.data} filaKey={(_, i) => i} vacio="Aparece cuando haya procesos cerrados." columnas={[
          { key: 'producto', titulo: 'Producto' }, { key: 'proveedor', titulo: 'Proveedor' },
          { key: 'procesos', titulo: 'Procesos', n: true },
          { key: 'kg', titulo: 'kg entrada', n: true, render: (r) => fmt.kg(r.kg_entrada) },
          { key: 'rend', titulo: 'Rendimiento', n: true, render: (r) => fmt.pct(r.rendimiento_pct) },
          { key: 'merma', titulo: 'Merma', n: true, render: (r) => fmt.pct(r.merma_pct) },
          { key: 'cc', titulo: 'Compra $/kg', n: true, render: (r) => fmt.usd4(r.costo_compra_kg) },
          { key: 'cr', titulo: 'Real $/kg', n: true, render: (r) => <b>{fmt.usd4(r.costo_real_kg)}</b> },
        ]} />}
        {tab === 'precios' && <DataTable<PrecioCompra> filas={precios.data} filaKey={(_, i) => i} columnas={[
          { key: 'fecha', titulo: 'Fecha', render: (r) => fmt.fecha(r.fecha) }, { key: 'proveedor', titulo: 'Proveedor' }, { key: 'producto', titulo: 'Producto' },
          { key: 'kg', titulo: 'kg', n: true, render: (r) => fmt.kg(r.kg) },
          { key: 'p', titulo: '$/kg', n: true, render: (r) => fmt.usd4(r.precio_kg) },
          { key: 't', titulo: 'Total', n: true, render: (r) => fmt.usd(r.total) },
          { key: 'l', titulo: 'Lote', render: (r) => <Mono>{r.lote}</Mono> },
        ]} />}
      </Panel>
    </PageTemplate>
  )
}
