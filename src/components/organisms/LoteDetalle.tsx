import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ayuda, Button, Input, Mono, Notice, Sub } from '../atoms'
import { Field } from '../molecules'
import { DataTable } from './DataTable'
import { Grid } from './Panel'
import { codigoLote, duracion, etiquetaDestino, fmt, hora } from '../../lib/format'
import * as srv from '../../services/lotes'
import type { Lote, RecepcionDetalle, Trazabilidad } from '../../lib/types'

type Edit = Record<string, { kg_real: string | number; precio_kg: string | number }>
/**
 * Todo lo que se puede ver y corregir de un lote:
 *  · fecha y observaciones (el código se rearma en la base),
 *  · kg y precio de cada jaba comprada (la base recalcula costos en cascada),
 *  · anular la recepción si fue un error (solo si nada salió de este lote).
 * Los lotes que salieron de un proceso se corrigen en el proceso.
 */
export function LoteDetalle({ lote, onCambio, onAnulado }: { lote: Lote; onCambio?: () => void; onAnulado?: () => void }) {
  const [det, setDet] = useState<{ compras: RecepcionDetalle[]; padres: Trazabilidad[]; hijos: Trazabilidad[] } | null>(null)
  const [edit, setEdit] = useState<Edit>({})
  const [cab, setCab] = useState({ fecha: lote.fecha, observaciones: lote.observaciones ?? '' })
  const [anular, setAnular] = useState<{ abierto: boolean; motivo: string }>({ abierto: false, motivo: '' })
  const [quitar, setQuitar] = useState<{ jaba: RecepcionDetalle; motivo: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null)

  useEffect(() => {
    setMsg(null); setDet(null); setAnular({ abierto: false, motivo: '' }); setQuitar(null)
    setCab({ fecha: lote.fecha, observaciones: lote.observaciones ?? '' })
    void srv.getDetalleLote(lote).then((d) => { setDet(d); const e: Edit = {}; d.compras.forEach((c) => { e[c.id] = { kg_real: c.kg_real, precio_kg: c.precio_kg } }); setEdit(e) })
  }, [lote])

  const accion = async (fn: () => PromiseLike<unknown>, okMsg: string, despues?: () => void) => {
    setOcupado(true); setMsg(null)
    try { await fn(); setMsg({ t: 'ok', m: okMsg }); despues?.() }
    catch (e) { setMsg({ t: 'error', m: (e as Error).message }) }
    setOcupado(false)
  }
  const sinCambios = (c: RecepcionDetalle) => String(edit[c.id]?.kg_real) === String(c.kg_real) && String(edit[c.id]?.precio_kg) === String(c.precio_kg)
  const nuevoCodigo = codigoLote(lote.proveedores?.codigo, lote.productos?.codigo, cab.fecha) || lote.codigo
  const cabSinCambios = cab.fecha === lote.fecha && (cab.observaciones || '') === (lote.observaciones ?? '')
  const guardarCompra = (c: RecepcionDetalle) => accion(() => srv.actualizarCompra(c.id, edit[c.id]), 'Guardado. El costo de este lote y de todo lo que salió de él ya se recalculó.', onCambio)
  const guardarLote = () => accion(() => srv.editarLote(lote.id, cab), nuevoCodigo !== lote.codigo ? `Guardado. El lote ahora se llama ${nuevoCodigo}.` : 'Guardado.', onCambio)
  const confirmarAnular = () => accion(() => srv.anularLote(lote.id, anular.motivo), `Lote ${lote.codigo} anulado.`, onAnulado ?? onCambio)
  const confirmarQuitar = async () => {
    if (!quitar) return
    setOcupado(true); setMsg(null)
    try {
      const loteBorrado = await srv.quitarJaba(quitar.jaba.id, quitar.motivo); setQuitar(null)
      if (loteBorrado) { setMsg({ t: 'ok', m: `Era la única jaba: el lote ${lote.codigo} se eliminó.` }); (onAnulado ?? onCambio)?.() }
      else { setMsg({ t: 'ok', m: 'Jaba quitada. El lote y sus costos ya se recalcularon.' }); onCambio?.() }
    } catch (e) { setMsg({ t: 'error', m: (e as Error).message }) }
    setOcupado(false)
  }

  if (!det) return null
  const hijos = [...new Map(det.hijos.map((h) => [h.lote_hijo, h])).values()]
  const deProceso = lote.origen === 'proceso'
  const consumido = det.hijos.length > 0
  const editable = !deProceso && lote.estado !== 'anulado'

  let zonaAnular = <Button tamano="chico" variante="peligro" onClick={() => setAnular({ abierto: true, motivo: '' })}>Anular lote…</Button>
  if (consumido) zonaAnular = <Ayuda>Ya se tomaron kilos de este lote en un proceso, así que no se puede anular. Si la recepción fue un error, corrige o borra primero ese proceso.</Ayuda>
  else if (anular.abierto) zonaAnular = (
    <Notice tipo="warn">
      <b>¿Anular {lote.codigo}?</b> Se borran sus {det.compras.length} jaba(s) de la recepción y el lote desaparece del stock y de las compras. Queda registro en Actividad.
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <Input chico placeholder="Motivo (opcional)" value={anular.motivo} onChange={(e) => setAnular({ ...anular, motivo: e.target.value })} style={{ flex: 1, minWidth: 200 }} aria-label="Motivo de anulación" />
        <Button tamano="chico" variante="primario" onClick={confirmarAnular} disabled={ocupado}>Sí, anular</Button>
        <Button tamano="chico" onClick={() => setAnular({ abierto: false, motivo: '' })} disabled={ocupado}>Cancelar</Button>
      </div>
    </Notice>)

  return (
    <>
      <h2><Mono style={{ fontSize: 18 }}>{lote.codigo}</Mono></h2>
      <Sub>{lote.productos?.nombre} · {lote.proveedores?.nombre ?? 'mezcla de proveedores'} · {fmt.fecha(lote.fecha)}{lote.destino === 'pedido' && <> · <b>elaborado para {lote.cliente ?? 'un pedido'}</b></>}{(lote.destino === 'moler' || lote.destino === 'cortar') && <> · <b>{etiquetaDestino(lote.destino).toLowerCase()}</b></>}<br />
        {fmt.kg(lote.kg_inicial)} kg iniciales, {fmt.kg(lote.kg_disponible)} disponibles · costo {fmt.usd4(lote.costo_kg)}/kg</Sub>
      {msg && <Notice tipo={msg.t}>{msg.m}</Notice>}

      {deProceso && <Notice tipo="info">Este lote salió de un proceso. Fecha, kilos y costo se corrigen en ese proceso y la base reparte de nuevo.
        {det.padres[0]?.proceso_id && <> <Link to={`/procesar?id=${det.padres[0].proceso_id}`}>Abrir el proceso</Link></>}</Notice>}

      {editable && <>
        <h3 style={{ margin: '14px 0 6px' }}>Lote (editable)</h3>
        <Grid form>
          <Field label="Fecha de ingreso" ayuda={nuevoCodigo !== lote.codigo && <>El código pasará a <Mono><b>{nuevoCodigo}</b></Mono>.</>}>
            <Input tipo="date" chico value={cab.fecha} min="2020-01-01" max={new Date().toISOString().slice(0, 10)} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} aria-label="Fecha del lote" /></Field>
          <Field label="Observaciones" style={{ gridColumn: 'span 2' }}>
            <Input chico value={cab.observaciones} onChange={(e) => setCab({ ...cab, observaciones: e.target.value })} aria-label="Observaciones del lote" /></Field>
          <Field style={{ alignSelf: 'end' }}><Button tamano="chico" variante="primario" onClick={guardarLote} disabled={cabSinCambios || ocupado || cab.fecha.length !== 10}>Guardar lote</Button></Field>
        </Grid>
      </>}

      {det.compras.length > 0 && <>
        <h3 style={{ margin: '14px 0 6px' }}>Compra (editable)</h3>
        <DataTable<RecepcionDetalle> filas={det.compras} columnas={[
          { key: 'reg', titulo: 'Registro', render: (c) => <>{c.recepciones?.numero_registro ?? '—'}<Ayuda>{fmt.fecha(c.recepciones?.fecha)}{c.recepciones?.numero_factura && ` · fact. ${c.recepciones.numero_factura}`}</Ayuda></> },
          { key: 'kg', titulo: 'kg real', n: true, render: (c) => <Input tipo="number" chico step="0.001" value={edit[c.id]?.kg_real ?? ''} onChange={(e) => setEdit({ ...edit, [c.id]: { ...edit[c.id], kg_real: e.target.value } })} aria-label={`kg jaba ${c.id}`} /> },
          { key: 'precio', titulo: 'Precio $/kg', n: true, render: (c) => <Input tipo="number" chico step="0.0001" value={edit[c.id]?.precio_kg ?? ''} onChange={(e) => setEdit({ ...edit, [c.id]: { ...edit[c.id], precio_kg: e.target.value } })} aria-label={`precio jaba ${c.id}`} /> },
          { key: 'total', titulo: 'Total', n: true, render: (c) => fmt.usd(Number(edit[c.id]?.kg_real) * Number(edit[c.id]?.precio_kg)) },
          { key: 'x', titulo: '', render: (c) => <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <Button tamano="chico" variante="primario" onClick={() => guardarCompra(c)} disabled={sinCambios(c) || ocupado}>Guardar</Button>
            {editable && <Button tamano="chico" variante="peligro" onClick={() => setQuitar({ jaba: c, motivo: '' })} disabled={ocupado} title="Quitar esta jaba del lote" aria-label={`Quitar jaba ${c.recepciones?.numero_registro ?? c.id}`}>Quitar</Button>}
          </span> },
        ]} />
        {quitar && <Notice tipo="warn">
          <b>¿Quitar la jaba del registro {quitar.jaba.recepciones?.numero_registro ?? '—'}</b> ({fmt.kg(quitar.jaba.kg_real)} kg a {fmt.usd4(quitar.jaba.precio_kg)}/kg)?
          {det.compras.length === 1 ? ' Es la única jaba: el lote se eliminará.' : ' El lote se recalcula con las jabas que quedan.'} Queda registro en Actividad.
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <Input chico placeholder="Motivo (opcional)" value={quitar.motivo} onChange={(e) => setQuitar({ ...quitar, motivo: e.target.value })} style={{ flex: 1, minWidth: 200 }} aria-label="Motivo para quitar la jaba" />
            <Button tamano="chico" variante="primario" onClick={confirmarQuitar} disabled={ocupado}>Sí, quitar</Button>
            <Button tamano="chico" onClick={() => setQuitar(null)} disabled={ocupado}>Cancelar</Button>
          </div>
        </Notice>}</>}

      {det.padres.length > 0 && <>
        <h3 style={{ margin: '14px 0 6px' }}>Viene de</h3>
        <DataTable<Trazabilidad> filas={det.padres} filaKey={(_, i) => i} columnas={[
          { key: 'p', titulo: 'Lote padre', render: (p) => <Mono>{p.lote_padre}</Mono> },
          { key: 'proc', titulo: 'Proceso', render: (p) => <><Link to={`/procesar?id=${p.proceso_id}`}>{p.proceso} · {fmt.fecha(p.fecha_proceso)}</Link>{(p.obrero || p.hora_inicio) && <Ayuda>{[p.obrero, p.hora_inicio && `${hora(p.hora_inicio)}–${hora(p.hora_fin)}`, duracion(p.hora_inicio, p.hora_fin)].filter(Boolean).join(' · ')}</Ayuda>}</> },
          { key: 'kg', titulo: 'kg tomados', n: true, render: (p) => fmt.kg(p.kg_tomados) },
          { key: 'c', titulo: '$/kg aplicado', n: true, render: (p) => fmt.usd4(p.costo_kg_aplicado) },
        ]} /></>}
      {hijos.length > 0 && <>
        <h3 style={{ margin: '14px 0 6px' }}>Salió de aquí</h3>
        <DataTable<Trazabilidad> filas={hijos} filaKey={(h) => h.lote_hijo} columnas={[
          { key: 'h', titulo: 'Lote hijo', render: (h) => <Mono>{h.lote_hijo}</Mono> },
          { key: 'rol', titulo: 'Tipo', render: (h) => <>{h.rol}{h.destino === 'pedido' && <Ayuda>pedido · {h.cliente}</Ayuda>}</> },
          { key: 'proc', titulo: 'Proceso', render: (h) => <><Link to={`/procesar?id=${h.proceso_id}`}>{h.proceso} · {fmt.fecha(h.fecha_proceso)}</Link>{(h.obrero || h.hora_inicio) && <Ayuda>{[h.obrero, h.hora_inicio && `${hora(h.hora_inicio)}–${hora(h.hora_fin)}`, duracion(h.hora_inicio, h.hora_fin)].filter(Boolean).join(' · ')}</Ayuda>}</> },
          { key: 'kg', titulo: 'kg', n: true, render: (h) => fmt.kg(h.kg_salida) },
          { key: 'c', titulo: '$/kg', n: true, render: (h) => fmt.usd4(h.costo_kg) },
        ]} /></>}

      {editable && <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--line)' }}>{zonaAnular}</div>}
    </>
  )
}
