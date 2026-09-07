import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Input, Notice } from '../components/atoms'
import { Field } from '../components/molecules'
import { AlertList, Grid, KpiGrid, Panel, StockTable } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import { fmt, hoy, diasAtras } from '../lib/format'
import type { Alerta, Kpis, StockSemaforo } from '../lib/types'
import * as tab from '../services/tablero'
import { getSemaforo } from '../services/stock'

export default function Tablero() {
  const [desde, setDesde] = useState(diasAtras(30))
  const [hasta, setHasta] = useState(hoy())
  const kpi = useAsync<Kpis | null>(() => tab.getKpis(desde, hasta), [desde, hasta], null)
  const alertas = useAsync<Alerta[]>(tab.getAlertas, [], [])
  const stock = useAsync<StockSemaforo[]>(getSemaforo, [], [])
  const k = kpi.data

  return (
    <PageTemplate titulo="Tablero" subtitulo="Qué hay, qué falta y qué revisar hoy." acciones={<>
      <Field label="Desde" style={{ margin: 0 }}><Input tipo="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
      <Field label="Hasta" style={{ margin: 0 }}><Input tipo="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Field></>}>
      <Notice tipo="error">{kpi.error || alertas.error || stock.error}</Notice>
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
    </PageTemplate>
  )
}
