import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ayuda, Badge, Input, Mono, Notice } from '../components/atoms'
import { DataTable, Grid, LoteDetalle, Panel } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import { useDebounce } from '../hooks/useDebounce'
import { fmt } from '../lib/format'
import type { Lote } from '../lib/types'
import * as srv from '../services/lotes'

export default function Lotes() {
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const qD = useDebounce(q, 250)
  const lotes = useAsync<Lote[]>(() => srv.buscarLotes(qD), [qD], [])
  const [sel, setSel] = useState<Lote | null>(null)
  const refrescar = () => { if (!sel) return; void lotes.recargar(); Promise.resolve(srv.getLote(sel.id)).then(setSel).catch(() => setSel(null)) }
  const anulado = () => { setSel(null); void lotes.recargar() }

  return (
    <PageTemplate titulo="Lotes" subtitulo="Busca un lote, mira de dónde viene y a dónde fue, y corrige fecha, peso o precio de compra si hace falta (o anula la recepción)."
      acciones={<Input placeholder="Código de lote (131AR040526)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 320 }} autoFocus aria-label="Buscar lote" />}>
      <Notice tipo="error">{lotes.error}</Notice>
      <Grid dos>
        <Panel>
          <DataTable<Lote> filas={lotes.data} onFila={setSel} seleccionada={(l) => l.id === sel?.id} vacio="Ningún lote coincide." columnas={[
            { key: 'codigo', titulo: 'Lote', render: (l) => <Mono>{l.codigo}</Mono> },
            { key: 'prod', titulo: 'Producto', render: (l) => <>{l.productos?.nombre}<Ayuda>{l.proveedores?.nombre ?? 'mezcla'} · {fmt.fecha(l.fecha)}</Ayuda></> },
            { key: 'kg', titulo: 'Disp. kg', n: true, render: (l) => fmt.kg(l.kg_disponible) },
            { key: 'c', titulo: '$/kg', n: true, render: (l) => fmt.usd4(l.costo_kg) },
            { key: 'e', titulo: 'Estado', render: (l) => <Badge tono={l.estado === 'disponible' ? 'ok' : 'neutro'}>{l.estado}</Badge> },
          ]} />
        </Panel>
        <Panel>{sel ? <LoteDetalle lote={sel} onCambio={refrescar} onAnulado={anulado} /> : <p style={{ color: 'var(--ink-3)', textAlign: 'center', padding: 20 }}>Elige un lote de la lista.</p>}</Panel>
      </Grid>
    </PageTemplate>
  )
}
