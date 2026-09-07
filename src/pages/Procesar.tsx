import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Ayuda, Button, Input, Mono, Notice, Select } from '../components/atoms'
import { CuadreBar, Field } from '../components/molecules'
import { Grid, Panel, PanelPie, ProcesoEntradas, ProcesoSalidas, entradaVacia, salidaVacia } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import { calcularBalance, validarProceso } from '../lib/cuadre'
import { fmt, hoy } from '../lib/format'
import type { EntradaForm, Producto, SalidaForm, StockLote, TipoProceso } from '../lib/types'
import { listProductos, listTiposProceso } from '../services/catalogos'
import * as srv from '../services/procesos'

const salidasIniciales = () => [salidaVacia('principal'), salidaVacia('subproducto'), salidaVacia('merma')]

export default function Procesar() {
  const [params] = useSearchParams()
  const procesoId = params.get('id')
  const tipos = useAsync<TipoProceso[]>(listTiposProceso, [], [])
  const productos = useAsync<Producto[]>(() => listProductos(), [], [])
  const lotesQ = useAsync<StockLote[]>(srv.listLotesDisponibles, [], [])
  const [extraLotes, setExtraLotes] = useState<StockLote[]>([])
  const [cab, setCab] = useState<srv.CabeceraProceso>({ tipo_proceso_id: null, fecha: hoy(), observaciones: '' })
  const [entradas, setEntradas] = useState<EntradaForm[]>([entradaVacia()])
  const [salidas, setSalidas] = useState<SalidaForm[]>(salidasIniciales())
  const [error, setError] = useState(''); const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<srv.ResultadoProceso | null>(null)
  const up = <K extends keyof srv.CabeceraProceso>(k: K, v: srv.CabeceraProceso[K]) => setCab((c) => ({ ...c, [k]: v }))

  useEffect(() => { if (tipos.data.length && !cab.tipo_proceso_id) up('tipo_proceso_id', tipos.data[0].id) }, [tipos.data]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!procesoId) return
    srv.getProceso(procesoId).then(({ proceso, entradas: en, salidas: sa, lotes }) => {
      setCab({ tipo_proceso_id: proceso.tipo_proceso_id, fecha: proceso.fecha, observaciones: proceso.observaciones ?? '' })
      if (en.length) setEntradas(en.map((e) => ({ lote_id: e.lote_id, kg_tomados: e.kg_tomados, kg_devueltos: e.kg_devueltos })))
      if (sa.length) setSalidas(sa.map((s) => ({ producto_id: s.producto_id, rol: s.rol, kg: s.kg, precio_credito: s.precio_credito ?? '', conserva_proveedor: s.conserva_proveedor })))
      setExtraLotes(lotes.map((l) => ({
        id: l.id, codigo: l.codigo, fecha: l.fecha, dias_en_camara: 0, especie: null, producto_codigo: l.productos?.codigo ?? '', producto: l.productos?.nombre ?? '',
        rol_defecto: 'principal', proveedor_codigo: l.proveedores?.codigo ?? null, proveedor: l.proveedores?.nombre ?? null, origen: l.origen,
        kg_inicial: l.kg_inicial, kg_disponible: l.kg_disponible, costo_kg: l.costo_kg, valor_stock: 0, estado: l.estado,
      })))
    }).catch((e: Error) => setError(e.message))
  }, [procesoId])

  const lotes = useMemo(() => { const ids = new Set(lotesQ.data.map((l) => l.id)); return [...lotesQ.data, ...extraLotes.filter((l) => !ids.has(l.id))] }, [lotesQ.data, extraLotes])
  const b = useMemo(() => calcularBalance(entradas, salidas, lotes), [entradas, salidas, lotes])

  const guardar = async () => {
    setError(''); setResultado(null)
    if (!cab.tipo_proceso_id) return setError('Elige el tipo de proceso.')
    const err = validarProceso(b, entradas, salidas, lotes, !procesoId)
    if (err) return setError(err)
    setGuardando(true)
    try {
      const r = await srv.guardarProceso({
        id: procesoId, cabecera: { ...cab, observaciones: cab.observaciones || null },
        entradas: entradas.filter((e) => e.lote_id && Number(e.kg_tomados) > 0),
        salidas: salidas.filter((s) => s.producto_id && Number(s.kg) > 0),
      })
      setResultado(r); setEntradas([entradaVacia()]); setSalidas(salidasIniciales()); up('observaciones', ''); void lotesQ.recargar()
      if (procesoId) window.history.replaceState(null, '', '/procesar')
    } catch (e) { setError((e as Error).message) }
    setGuardando(false)
  }

  return (
    <PageTemplate titulo="Procesar" subtitulo="Toma lotes de la cámara, anota lo que salió y el sistema reparte el costo.">
      <Notice tipo="error">{tipos.error || productos.error || lotesQ.error}</Notice>
      {resultado && <Notice tipo="ok">Proceso cerrado. Entrada {fmt.kg(resultado.proceso.kg_consumidos)} kg ({fmt.usd(resultado.proceso.costo_entrada)}), crédito subproductos {fmt.usd(resultado.proceso.credito_subproductos)}, costo neto {fmt.usd(resultado.proceso.costo_neto)}.
        {Number(resultado.proceso.kg_merma_no_reg) > 0 && <> Quedaron <b>{fmt.kg(resultado.proceso.kg_merma_no_reg)} kg sin justificar</b>.</>}
        <ul>{resultado.hijos.map((h, i) => <li key={i}><Mono><b>{h.lotes?.codigo}</b></Mono> {h.productos?.nombre} · {fmt.kg(h.kg)} kg · {fmt.usd4(h.costo_kg)}/kg</li>)}</ul></Notice>}
      {procesoId && <Notice tipo="warn">Estás cerrando un proceso que quedó pendiente. <Link to="/procesar">Empezar uno nuevo</Link></Notice>}
      <Panel>
        <Grid form>
          <Field label="Tipo de proceso"><Select value={cab.tipo_proceso_id ?? ''} onChange={(e) => up('tipo_proceso_id', Number(e.target.value))} opciones={tipos.data.map((t) => ({ value: t.id, label: t.nombre }))} aria-label="Tipo de proceso" /></Field>
          <Field label="Fecha"><Input tipo="date" value={cab.fecha} onChange={(e) => up('fecha', e.target.value)} /></Field>
          <Field label="Observaciones" style={{ gridColumn: 'span 2' }}><Input value={cab.observaciones ?? ''} onChange={(e) => up('observaciones', e.target.value)} /></Field>
        </Grid>
      </Panel>
      <Panel titulo="Entra (de la cámara)">
        <ProcesoEntradas entradas={entradas} onChange={setEntradas} lotes={lotes} consumo={b.consumo} costoEntrada={b.costoEntrada} />
        <PanelPie izquierda={<Button onClick={() => setEntradas((es) => [...es, entradaVacia()])}>Agregar lote</Button>}>
          {b.proveedores > 1 && <Ayuda>Varios proveedores: los lotes que salgan serán mezcla (sin proveedor), como la molida EMC.</Ayuda>}
        </PanelPie>
      </Panel>
      <Panel titulo="Sale">
        <CuadreBar consumo={b.consumo} principal={b.kgPrincipal} subproducto={b.kgSubproducto} merma={b.kgMerma} />
        <ProcesoSalidas salidas={salidas} onChange={setSalidas} productos={productos.data} kgSalidas={b.kgSalidas} costoNeto={b.costoNeto} costoPrincipal={b.costoPrincipal} />
        <PanelPie izquierda={<Button onClick={() => setSalidas((ss) => [...ss, salidaVacia('principal')])}>Agregar salida</Button>}>
          <Notice tipo="error" style={{ margin: 0 }}>{error}</Notice>
          <Button variante="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Cerrando…' : 'Cerrar proceso'}</Button>
        </PanelPie>
      </Panel>
    </PageTemplate>
  )
}
