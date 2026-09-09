import { useState } from 'react'
import { Button, Input, Mono, Notice } from '../components/atoms'
import { Combo, Field } from '../components/molecules'
import { Grid, Panel, PanelPie, RecepcionLineas, lineaVacia } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import { fmt, hoy, num } from '../lib/format'
import { fechaValida } from '../lib/series'
import type { LineaRecepcion, Producto, Proveedor } from '../lib/types'
import { listProductos, listProveedores } from '../services/catalogos'
import { crearRecepcion, type CabeceraRecepcion, type LoteCreado } from '../services/recepciones'

export default function Recibir() {
  const proveedores = useAsync<Proveedor[]>(() => listProveedores(), [], [])
  const productos = useAsync<Producto[]>(() => listProductos({ soloComprables: true }), [], [])
  const [cab, setCab] = useState<CabeceraRecepcion>({ fecha: hoy(), proveedor_id: null, registro: '', factura: '', obs: '' })
  const [lineas, setLineas] = useState<LineaRecepcion[]>([lineaVacia(), lineaVacia(), lineaVacia()])
  const [error, setError] = useState(''); const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState<{ lotes: LoteCreado[]; kg: number; total: number } | null>(null)
  const up = <K extends keyof CabeceraRecepcion>(k: K, v: CabeceraRecepcion[K]) => setCab((c) => ({ ...c, [k]: v }))
  const prov = proveedores.data.find((p) => p.id === cab.proveedor_id)
  const validas = lineas.filter((l) => l.producto_id && num(l.kg_real) > 0)

  const guardar = async () => {
    setError(''); setOk(null)
    if (!fechaValida(cab.fecha)) return setError('La fecha no es válida: revisa el año (debe estar entre 2020 y hoy).')
    if (!cab.proveedor_id) return setError('Elige el proveedor.')
    if (validas.length === 0) return setError('Agrega al menos un producto con peso.')
    if (validas.some((l) => l.precio_kg === '')) return setError('Falta el precio en alguna fila.')
    setGuardando(true)
    try {
      const r = await crearRecepcion(cab, validas)
      setOk({ lotes: r.lotes, kg: validas.reduce((a, l) => a + num(l.kg_real), 0), total: validas.reduce((a, l) => a + num(l.kg_real) * num(l.precio_kg), 0) })
      setLineas([lineaVacia(), lineaVacia(), lineaVacia()]); setCab((c) => ({ ...c, registro: '', factura: '', obs: '' }))
    } catch (e) { setError((e as Error).message) }
    setGuardando(false)
  }

  return (
    <PageTemplate titulo="Recibir producto" subtitulo="Una fila por cada jaba pesada. Mismo producto en varias jabas = un solo lote.">
      <Notice tipo="error">{proveedores.error || productos.error}</Notice>
      {ok && <Notice tipo="ok">Recepción guardada: {fmt.kg(ok.kg)} kg, {fmt.usd(ok.total)}. Lotes creados o actualizados:
        <ul>{ok.lotes.map((l) => <li key={l.codigo}><Mono><b>{l.codigo}</b></Mono> {l.productos?.nombre} · {fmt.kg(l.kg_inicial)} kg · {fmt.usd4(l.costo_kg)}/kg</li>)}</ul></Notice>}
      <Panel>
        <Grid form>
          <Field label="Fecha"><Input tipo="date" value={cab.fecha} min="2020-01-01" max={hoy()} onChange={(e) => up('fecha', e.target.value)} aria-label="Fecha" /></Field>
          <Field label="Proveedor" style={{ gridColumn: 'span 2' }} ayuda={prov?.acuerdo_limpieza && `Acuerdo: ${prov.acuerdo_limpieza}`}>
            <Combo opciones={proveedores.data} value={cab.proveedor_id} onChange={(v) => up('proveedor_id', v)} clave={(p) => p.id} mostrar={(p) => p.nombre} extra={(p) => String(p.codigo)} autoFocus aria-label="Proveedor" /></Field>
          <Field label="N° registro compra"><Input value={cab.registro} onChange={(e) => up('registro', e.target.value)} /></Field>
          <Field label="N° factura"><Input value={cab.factura} onChange={(e) => up('factura', e.target.value)} /></Field>
        </Grid>
        <Field label="Observaciones (calidad, textura, color, olor)"><Input value={cab.obs} onChange={(e) => up('obs', e.target.value)} /></Field>
      </Panel>
      <Panel>
        <RecepcionLineas lineas={lineas} onChange={setLineas} productos={productos.data} provCodigo={prov?.codigo} fecha={cab.fecha} />
        <PanelPie izquierda={<Button onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>Agregar fila</Button>}>
          <Notice tipo="error" style={{ margin: 0 }}>{error}</Notice>
          <Button variante="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar recepción'}</Button>
        </PanelPie>
      </Panel>
    </PageTemplate>
  )
}
