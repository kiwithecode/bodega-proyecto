import { useState } from 'react'
import { Ayuda, Badge, Button, Input, Mono, Notice } from '../components/atoms'
import { Chips, Tabs } from '../components/molecules'
import { DataTable, LeyendaSemaforo, LoteDetalle, Panel, StockTable, type NivelStock } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import { fmt } from '../lib/format'
import type { Lote, Semaforo, StockLote, StockSemaforo } from '../lib/types'
import * as srv from '../services/stock'
import { getLote } from '../services/lotes'
import { exportarExcel } from '../services/excel'

type Tab = 'productos' | 'lotes'
export default function Stock() {
  const [tab, setTab] = useState<Tab>('productos'); const [q, setQ] = useState('')
  const [msg, setMsg] = useState(''); const [aviso, setAviso] = useState('')
  const [prodSel, setProdSel] = useState<StockSemaforo | null>(null)   // "Ver lotes" de un producto
  const [estado, setEstado] = useState<'Todos' | Semaforo>('Todos')   // filtro por semáforo
  const [loteSel, setLoteSel] = useState<Lote | null>(null)             // lote abierto para corregir
  const prod = useAsync<StockSemaforo[]>(srv.getSemaforo, [], []); const lotes = useAsync<StockLote[]>(srv.getLotesStock, [], [])
  const f = q.trim().toLowerCase()
  const prodF = prod.data.filter((p) => (estado === 'Todos' || p.semaforo === estado) && (!f || `${p.producto} ${p.codigo} ${p.especie ?? ''}`.toLowerCase().includes(f)))
  const cuenta = (sem: Semaforo) => prod.data.filter((p) => p.semaforo === sem).length
  const loteF = lotes.data.filter((l) => (!prodSel || l.producto_codigo === prodSel.codigo) && (!f || `${l.codigo} ${l.producto} ${l.proveedor ?? ''} ${l.cliente ?? ''}`.toLowerCase().includes(f)))
  const totKg = prodF.reduce((a, p) => a + Number(p.kg_disponible), 0); const totVal = prodF.reduce((a, p) => a + Number(p.valor_stock), 0)

  const recargarTodo = () => Promise.all([prod.recargar(), lotes.recargar()])
  const nivel = (p: StockSemaforo, campo: NivelStock, kg: number | null) => Promise.resolve(srv.guardarNiveles(p.producto_id, { kg_minimo: p.kg_minimo, kg_ideal: p.kg_ideal, [campo]: kg })).then(() => prod.recargar()).catch((e: Error) => setMsg(e.message))
  const verLotes = (p: StockSemaforo) => { setProdSel(p); setLoteSel(null); setTab('lotes') }
  const abrirLote = (l: StockLote) => { setMsg(''); setAviso(''); Promise.resolve(getLote(l.id)).then(setLoteSel).catch((e: Error) => setMsg(e.message)) }
  const loteCambiado = () => { void recargarTodo(); if (loteSel) Promise.resolve(getLote(loteSel.id)).then(setLoteSel).catch(() => setLoteSel(null)) }
  const loteAnulado = () => { setAviso(`Lote ${loteSel?.codigo ?? ''} anulado: ya no cuenta en stock ni en compras.`); setLoteSel(null); void recargarTodo() }

  const exportar = () => exportarExcel([
    { nombre: 'Stock por producto', filas: prodF.map((p) => ({ Código: p.codigo, Producto: p.producto, Especie: p.especie, 'Kg disponibles': +p.kg_disponible, Lotes: p.lotes, 'Costo prom $/kg': p.costo_kg_prom, 'Valor $': +p.valor_stock, 'Mínimo kg': p.kg_minimo, 'Consumo kg/día': p.kg_por_dia, 'Días cobertura': p.dias_cobertura, 'Días en cámara': p.dias_lote_mas_antiguo, Estado: p.semaforo })) },
    { nombre: 'Stock por lote', filas: loteF.map((l) => ({ Lote: l.codigo, Fecha: l.fecha, Producto: l.producto, Proveedor: l.proveedor, Origen: l.origen, Destino: l.destino ?? 'stock', Cliente: l.cliente ?? '', 'Kg inicial': +l.kg_inicial, 'Kg disponibles': +l.kg_disponible, 'Costo $/kg': +l.costo_kg, 'Valor $': +l.valor_stock, 'Días en cámara': l.dias_en_camara })) },
  ], 'stock')

  return (
    <PageTemplate titulo="Stock" subtitulo={`${fmt.kg(totKg)} kg en cámara, valorados en ${fmt.usd(totVal)}.`} acciones={<>
      <Input placeholder="Buscar producto, lote, proveedor o cliente…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} aria-label="Buscar" />
      <Button onClick={exportar}>Exportar a Excel</Button></>}>
      <Notice tipo="error">{msg || prod.error || lotes.error}</Notice>
      <Notice tipo="ok">{aviso}</Notice>
      <Panel>
        <Tabs<Tab> activo={tab} onChange={setTab} items={[{ id: 'productos', label: `Por producto (${prodF.length})` }, { id: 'lotes', label: `Por lote (${loteF.length})` }]} />
        {tab === 'productos' && <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 10px' }}>
            <Chips valor={estado} onChange={(v) => setEstado(v as 'Todos' | Semaforo)} items={[
              { valor: 'Todos', detalle: String(prod.data.length) }, { valor: 'SIN STOCK', detalle: String(cuenta('SIN STOCK')) },
              { valor: 'BAJO', detalle: String(cuenta('BAJO')) }, { valor: 'OK', detalle: String(cuenta('OK')) }, { valor: 'ALTO', detalle: String(cuenta('ALTO')) },
            ]} />
          </div>
          <StockTable filas={prodF} onNivel={nivel} onVerLotes={verLotes} />
          <LeyendaSemaforo />
        </>}
        {tab === 'lotes' && <>
          {prodSel && <Notice tipo="info">Solo lotes de <b>{prodSel.producto}</b> <Mono>{prodSel.codigo}</Mono>. <Button variante="texto" tamano="chico" onClick={() => setProdSel(null)}>Ver todos los lotes</Button></Notice>}
          <DataTable<StockLote> filas={loteF} onFila={abrirLote} seleccionada={(l) => l.id === loteSel?.id} vacio="Ningún lote coincide." columnas={[
            { key: 'codigo', titulo: 'Lote', render: (l) => <Mono>{l.codigo}</Mono> },
            { key: 'producto', titulo: 'Producto', render: (l) => <>{l.producto}{l.destino === 'pedido' && <> <Badge tono="info">Pedido · {l.cliente ?? 'cliente'}</Badge></>}</> },
            { key: 'proveedor', titulo: 'Proveedor', render: (l) => l.proveedor ?? <i>mezcla</i> },
            { key: 'fecha', titulo: 'Ingreso', render: (l) => fmt.fecha(l.fecha) },
            { key: 'dias', titulo: 'Días', n: true, render: (l) => l.dias_en_camara },
            { key: 'ki', titulo: 'kg inicial', n: true, render: (l) => fmt.kg(l.kg_inicial) },
            { key: 'kd', titulo: 'kg disp.', n: true, render: (l) => <b>{fmt.kg(l.kg_disponible)}</b> },
            { key: 'c', titulo: 'Costo $/kg', n: true, render: (l) => fmt.usd4(l.costo_kg) },
            { key: 'v', titulo: 'Valor', n: true, render: (l) => fmt.usd(l.valor_stock) },
            { key: 'x', titulo: '', render: (l) => <Button tamano="chico" variante="secundario" onClick={() => abrirLote(l)} aria-label={`Corregir ${l.codigo}`}>{l.origen === 'proceso' ? 'Ver' : 'Corregir'}</Button> },
          ]} />
        </>}
      </Panel>
      {tab === 'lotes' && loteSel && (
        <Panel titulo="Corregir lote" acciones={<Button tamano="chico" onClick={() => setLoteSel(null)}>Cerrar</Button>}>
          <LoteDetalle lote={loteSel} onCambio={loteCambiado} onAnulado={loteAnulado} />
        </Panel>
      )}
      <Ayuda style={{ marginTop: 10 }}>
        Cada fila suma todos los lotes del producto, sin importar el proveedor. Mínimo e ideal son opcionales: bajo el mínimo el producto se marca BAJO y el tablero avisa; por encima del ideal se marca ALTO. La cobertura usa el consumo real de los últimos 30 días.
        {' '}Para corregir un error de digitación, abre el lote desde <b>Por lote</b> (o con <b>Ver lotes</b> en un producto): ahí se cambia fecha, kilos y precio, o se anula la recepción.
      </Ayuda>
    </PageTemplate>
  )
}
