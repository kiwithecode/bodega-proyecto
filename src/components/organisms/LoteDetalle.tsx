import { useEffect, useState } from 'react'
import { Button, Input, Mono, Notice, Sub } from '../atoms'
import { DataTable } from './DataTable'
import { fmt } from '../../lib/format'
import * as srv from '../../services/lotes'
import type { Lote, RecepcionDetalle, Trazabilidad } from '../../lib/types'

type Edit = Record<string, { kg_real: string | number; precio_kg: string | number }>
export function LoteDetalle({ lote, onCambio }: { lote: Lote; onCambio?: () => void }) {
  const [det, setDet] = useState<{ compras: RecepcionDetalle[]; padres: Trazabilidad[]; hijos: Trazabilidad[] } | null>(null)
  const [edit, setEdit] = useState<Edit>({})
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null)

  useEffect(() => {
    setMsg(null); setDet(null)
    void srv.getDetalleLote(lote).then((d) => { setDet(d); const e: Edit = {}; d.compras.forEach((c) => { e[c.id] = { kg_real: c.kg_real, precio_kg: c.precio_kg } }); setEdit(e) })
  }, [lote])

  const guardar = async (c: RecepcionDetalle) => {
    try { await srv.actualizarCompra(c.id, edit[c.id]); setMsg({ t: 'ok', m: 'Guardado. El costo de este lote y de todo lo que salió de él ya se recalculó.' }); onCambio?.() }
    catch (e) { setMsg({ t: 'error', m: (e as Error).message }) }
  }
  const sinCambios = (c: RecepcionDetalle) => String(edit[c.id]?.kg_real) === String(c.kg_real) && String(edit[c.id]?.precio_kg) === String(c.precio_kg)
  if (!det) return null
  const hijos = [...new Map(det.hijos.map((h) => [h.lote_hijo, h])).values()]

  return (
    <>
      <h2><Mono style={{ fontSize: 18 }}>{lote.codigo}</Mono></h2>
      <Sub>{lote.productos?.nombre} · {lote.proveedores?.nombre ?? 'mezcla de proveedores'} · {fmt.fecha(lote.fecha)}<br />
        {fmt.kg(lote.kg_inicial)} kg iniciales, {fmt.kg(lote.kg_disponible)} disponibles · costo {fmt.usd4(lote.costo_kg)}/kg</Sub>
      {msg && <Notice tipo={msg.t}>{msg.m}</Notice>}
      {det.compras.length > 0 && <>
        <h3 style={{ margin: '14px 0 6px' }}>Compra (editable)</h3>
        <DataTable<RecepcionDetalle> filas={det.compras} columnas={[
          { key: 'reg', titulo: 'Registro', render: (c) => c.recepciones?.numero_registro ?? '—' },
          { key: 'kg', titulo: 'kg real', n: true, render: (c) => <Input tipo="number" chico step="0.001" value={edit[c.id]?.kg_real ?? ''} onChange={(e) => setEdit({ ...edit, [c.id]: { ...edit[c.id], kg_real: e.target.value } })} /> },
          { key: 'precio', titulo: 'Precio $/kg', n: true, render: (c) => <Input tipo="number" chico step="0.0001" value={edit[c.id]?.precio_kg ?? ''} onChange={(e) => setEdit({ ...edit, [c.id]: { ...edit[c.id], precio_kg: e.target.value } })} /> },
          { key: 'total', titulo: 'Total', n: true, render: (c) => fmt.usd(Number(edit[c.id]?.kg_real) * Number(edit[c.id]?.precio_kg)) },
          { key: 'x', titulo: '', render: (c) => <Button tamano="chico" onClick={() => guardar(c)} disabled={sinCambios(c)}>Guardar</Button> },
        ]} /></>}
      {det.padres.length > 0 && <>
        <h3 style={{ margin: '14px 0 6px' }}>Viene de</h3>
        <DataTable<Trazabilidad> filas={det.padres} filaKey={(_, i) => i} columnas={[
          { key: 'p', titulo: 'Lote padre', render: (p) => <Mono>{p.lote_padre}</Mono> },
          { key: 'proc', titulo: 'Proceso', render: (p) => `${p.proceso} · ${fmt.fecha(p.fecha_proceso)}` },
          { key: 'kg', titulo: 'kg tomados', n: true, render: (p) => fmt.kg(p.kg_tomados) },
          { key: 'c', titulo: '$/kg aplicado', n: true, render: (p) => fmt.usd4(p.costo_kg_aplicado) },
        ]} /></>}
      {hijos.length > 0 && <>
        <h3 style={{ margin: '14px 0 6px' }}>Salió de aquí</h3>
        <DataTable<Trazabilidad> filas={hijos} filaKey={(h) => h.lote_hijo} columnas={[
          { key: 'h', titulo: 'Lote hijo', render: (h) => <Mono>{h.lote_hijo}</Mono> },
          { key: 'rol', titulo: 'Tipo' },
          { key: 'kg', titulo: 'kg', n: true, render: (h) => fmt.kg(h.kg_salida) },
          { key: 'c', titulo: '$/kg', n: true, render: (h) => fmt.usd4(h.costo_kg) },
        ]} /></>}
    </>
  )
}
