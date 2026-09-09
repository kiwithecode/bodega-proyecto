import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Input, Notice, Select } from '../components/atoms'
import { Chips, Field } from '../components/molecules'
import { AlertList, Figura, GraficaBarras, GraficaLineas, Grid, KpiGrid, Panel, StockTable, TablaSeries, type Serie } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import { fmt, hoy, diasAtras } from '../lib/format'
import { diaCorto, rellenarDias, sumarPor, topN } from '../lib/series'
import type { Alerta, CostoSemanal, Kpis, MetricaDiaria, PrecioCompra, RendimientoProveedor, StockSemaforo } from '../lib/types'
import * as tab from '../services/tablero'
import { getSemaforo } from '../services/stock'

const AZUL = 'var(--serie-1)', NARANJA = 'var(--serie-2)'
const vacioDia: Omit<MetricaDiaria, 'fecha'> = { kg_recibidos: 0, compras_usd: 0, kg_procesados: 0, kg_principal: 0, kg_subproductos: 0, kg_merma: 0, credito_subproductos: 0, costo_neto: 0, rendimiento_pct: null }
const semanaISO = (f: string) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10) }
const restarDias = (f: string, n: number) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }

type Rango = 'Todo' | '7 días' | '30 días' | '90 días' | 'Personalizado'
const RANGOS: Rango[] = ['Todo', '7 días', '30 días', '90 días']

export default function Tablero() {
  // Por defecto se muestra TODO lo registrado (desde el primer movimiento); los atajos acotan.
  const [rango, setRango] = useState<Rango>('Todo')
  const [desde, setDesde] = useState(diasAtras(30))
  const [hasta, setHasta] = useState(hoy())
  const primera = useAsync<string | null>(tab.getPrimeraFecha, [], null)
  useEffect(() => { if (rango === 'Todo' && primera.data) setDesde(primera.data < hoy() ? primera.data : hoy()) }, [primera.data, rango])
  const elegirRango = (r: Rango) => {
    setRango(r); setHasta(hoy())
    if (r === 'Todo') setDesde(primera.data ?? diasAtras(365))
    else if (r !== 'Personalizado') setDesde(diasAtras(Number.parseInt(r, 10)))
  }
  const [producto, setProducto] = useState('')
  const kpi = useAsync<Kpis | null>(() => tab.getKpis(desde, hasta), [desde, hasta], null)
  const alertas = useAsync<Alerta[]>(tab.getAlertas, [], [])
  const stock = useAsync<StockSemaforo[]>(getSemaforo, [], [])
  const diario = useAsync<MetricaDiaria[]>(() => tab.getMetricasDiarias(desde, hasta), [desde, hasta], [])
  const compras = useAsync<PrecioCompra[]>(() => tab.getComprasPeriodo(desde, hasta), [desde, hasta], [])
  // Tendencia de costo: el período elegido o las últimas 12 semanas, lo que sea más largo.
  const desdeSemana = semanaISO(desde < restarDias(hasta, 84) ? desde : restarDias(hasta, 84))
  const costoSem = useAsync<CostoSemanal[]>(() => tab.getCostoSemanal(desdeSemana), [desdeSemana], [])
  const rend = useAsync<RendimientoProveedor[]>(() => producto ? tab.getRendimientoProducto(producto) : Promise.resolve([]), [producto], [])
  const k = kpi.data

  // Productos con costo en la ventana, ordenados por kg; el mayor es el producto por defecto.
  const productos = useMemo(() => sumarPor(costoSem.data, (c) => `${c.producto_codigo}|${c.producto}`, (c) => Number(c.kg)).sort((a, b) => b.valor - a.valor)
    .map((p) => ({ codigo: p.clave.split('|')[0], nombre: p.clave.split('|')[1] })), [costoSem.data])
  useEffect(() => { if (!producto && productos.length) setProducto(productos[0].codigo) }, [productos, producto])
  const nombreProducto = productos.find((p) => p.codigo === producto)?.nombre ?? producto

  // Series diarias (todos los días del período, aunque no haya movimiento).
  const dias = useMemo(() => rellenarDias(desde, hasta, diario.data, vacioDia), [desde, hasta, diario.data])
  const etiquetasDia = dias.map((d) => diaCorto(d.fecha))
  const kgSeries: Serie[] = [
    { nombre: 'Recibido', color: AZUL, valores: dias.map((d) => Number(d.kg_recibidos)) },
    { nombre: 'Procesado', color: NARANJA, valores: dias.map((d) => Number(d.kg_procesados)) },
  ]
  const pctSeries: Serie[] = [
    { nombre: 'Rendimiento', color: AZUL, valores: dias.map((d) => d.rendimiento_pct == null ? null : Number(d.rendimiento_pct)) },
    { nombre: 'Merma', color: NARANJA, valores: dias.map((d) => Number(d.kg_procesados) > 0 ? +(100 * Number(d.kg_merma) / Number(d.kg_procesados)).toFixed(1) : null) },
  ]
  // Compras por proveedor: top 6 + Otros.
  const porProveedor = topN(sumarPor(compras.data, (c) => c.proveedor, (c) => Number(c.total)), 6, (x) => x.valor, (x) => x.clave)
  const kgProveedor = new Map(sumarPor(compras.data, (c) => c.proveedor, (c) => Number(c.kg)).map((x) => [x.clave, x.valor]))
  const barrasCompras = porProveedor.map((p) => ({ ...p, detalle: kgProveedor.has(p.etiqueta) ? `${fmt.kg(kgProveedor.get(p.etiqueta))} kg` : undefined }))
  // Costo semanal del producto elegido.
  const semanas = costoSem.data.filter((c) => c.producto_codigo === producto)
  const costoSerie: Serie[] = [{ nombre: `Costo $/kg · ${nombreProducto}`, color: AZUL, valores: semanas.map((c) => Number(c.costo_kg)) }]
  const etiquetasSem = semanas.map((c) => diaCorto(c.semana))
  // Rendimiento por proveedor del producto elegido.
  const barrasRend = rend.data.filter((r) => Number(r.kg_entrada) > 0).map((r) => ({ etiqueta: r.proveedor, valor: Number(r.rendimiento_pct), detalle: `${r.procesos} proc. · ${fmt.usd4(r.costo_real_kg)}/kg real` }))

  return (
    <PageTemplate titulo="Tablero" subtitulo="Qué hay, qué falta y qué revisar hoy." acciones={<>
      <Field label="Período" style={{ margin: 0 }}><Chips valor={rango} onChange={(v) => elegirRango(v as Rango)} items={RANGOS.map((r) => ({ valor: r }))} /></Field>
      <Field label="Desde" style={{ margin: 0 }}><Input tipo="date" value={desde} onChange={(e) => { setRango('Personalizado'); setDesde(e.target.value) }} aria-label="Desde" /></Field>
      <Field label="Hasta" style={{ margin: 0 }}><Input tipo="date" value={hasta} onChange={(e) => { setRango('Personalizado'); setHasta(e.target.value) }} aria-label="Hasta" /></Field>
      <Field label="Producto (costo y rendimiento)" style={{ margin: 0 }}>
        <Select value={producto} onChange={(e) => setProducto(e.target.value)} aria-label="Producto" opciones={productos.length ? productos.map((p) => ({ value: p.codigo, label: `${p.nombre} (${p.codigo})` })) : [{ value: '', label: 'Sin datos' }]} /></Field></>}>
      <Notice tipo="error">{kpi.error || alertas.error || stock.error || diario.error || compras.error || costoSem.error || rend.error}</Notice>
      <KpiGrid items={[
        { valor: k && fmt.kg(k.kg_stock_actual) + ' kg', etiqueta: 'Stock actual' },
        { valor: k && fmt.usd(k.valor_stock_actual), etiqueta: 'Valor del stock' },
        { valor: k && fmt.kg(k.kg_recibidos) + ' kg', etiqueta: 'Recibido en el período' },
        { valor: k && fmt.usd(k.compras_usd), etiqueta: 'Compras del período' },
        { valor: k && fmt.kg(k.kg_procesados) + ' kg', etiqueta: 'Procesado' },
        { valor: k?.rendimiento_pct != null ? fmt.pct(k.rendimiento_pct) : null, etiqueta: 'Rendimiento' },
        { valor: k?.merma_pct != null ? fmt.pct(k.merma_pct) : null, etiqueta: 'Merma' },
        { valor: k && fmt.usd(k.credito_subproductos), etiqueta: 'Crédito subproductos' },
      ]} />

      <Grid dos style={{ marginTop: 18 }}>
        <Panel titulo={`Alertas (${alertas.data.length})`}><AlertList alertas={alertas.data} /></Panel>
        <Panel titulo="Stock por producto">
          {stock.data.length === 0 && !stock.cargando ? <p style={{ color: 'var(--ink-3)' }}>Aún no hay lotes. Empieza en <Link to="/recibir">Recibir</Link>.</p>
            : <StockTable filas={stock.data} compacta maxAltura={520} />}
        </Panel>
      </Grid>

      <Grid dos style={{ marginTop: 18, opacity: diario.cargando ? .6 : 1 }}>
        <Figura titulo="Kilos por día" sub="recibido de proveedores vs. entrado a proceso" tabla={<TablaSeries etiquetas={etiquetasDia} series={kgSeries} formato={fmt.kg} />}>
          <GraficaLineas etiquetas={etiquetasDia} series={kgSeries} formato={(v) => fmt.kg(v)} />
        </Figura>
        <Figura titulo="Rendimiento y merma por día" sub="% sobre los kg procesados; sin línea los días sin proceso" tabla={<TablaSeries etiquetas={etiquetasDia} series={pctSeries} formato={fmt.pct} />}>
          <GraficaLineas etiquetas={etiquetasDia} series={pctSeries} formato={(v) => fmt.pct(v)} />
        </Figura>
      </Grid>
      <Grid dos style={{ marginTop: 18, opacity: compras.cargando || costoSem.cargando ? .6 : 1 }}>
        <Figura titulo="Compras por proveedor" sub={`$ del período · ${compras.data.length ? kgProveedor.size : 0} proveedores`}>
          <GraficaBarras filas={barrasCompras} formato={fmt.usd} detalle />
        </Figura>
        <Figura titulo="Costo real semanal" sub={`$/kg de los lotes de ${nombreProducto || '…'} por semana de ingreso · últimas 12 semanas o el período, lo más largo`}
          tabla={<TablaSeries etiquetas={etiquetasSem} series={costoSerie} formato={fmt.usd4} tituloX="Semana" />}>
          <GraficaLineas etiquetas={etiquetasSem} series={costoSerie} formato={(v) => fmt.usd4(v)} marcadores eje="auto" />
        </Figura>
      </Grid>
      <Grid dos style={{ marginTop: 18, opacity: rend.cargando ? .6 : 1 }}>
        <Figura titulo="Rendimiento por proveedor" sub={`% de ${nombreProducto || '…'} que sale como producto principal · histórico, procesos de un solo lote`}>
          <GraficaBarras filas={barrasRend} formato={fmt.pct} detalle />
        </Figura>
        <Panel titulo="Cómo leer estas gráficas">
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.6 }}>
            <li><b>Kilos por día</b>: si lo procesado supera lo recibido varios días, la cámara se está vaciando (mira Cobertura en Stock).</li>
            <li><b>Rendimiento</b>: kg de producto principal ÷ kg que entraron. <b>Merma</b>: venas, sangre, desperdicio y lo que no cuadró. Un día de merma alta suele ser un proceso mal digitado o carne de mala calidad.</li>
            <li><b>Compras por proveedor</b>: a quién le compras más en el período. Pasa el mouse para ver los kg.</li>
            <li><b>Costo real semanal</b>: lo que de verdad cuesta el kg del producto elegido, con la cascada de procesos ya aplicada.</li>
            <li><b>Rendimiento por proveedor</b>: quién trae mejor carne para ese producto, con el costo real por kg limpio.</li>
          </ul>
        </Panel>
      </Grid>
    </PageTemplate>
  )
}
