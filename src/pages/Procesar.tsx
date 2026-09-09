import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Ayuda, Button, Checkbox, Input, Mono, Notice, Select } from '../components/atoms'
import { CuadreBar, Field } from '../components/molecules'
import { Grid, Panel, PanelPie, ProcesoEntradas, ProcesoSalidas, entradaVacia, salidaVacia } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import { calcularBalance, validarProceso } from '../lib/cuadre'
import { duracion, fmt, hora, hoy } from '../lib/format'
import { fechaValida } from '../lib/series'
import type { Cliente, EntradaForm, Obrero, Producto, SalidaForm, StockLote, TipoProceso } from '../lib/types'
import { crearObrero, listObreros, listProductos, listTiposProceso } from '../services/catalogos'
import * as srv from '../services/procesos'

const salidasIniciales = () => [salidaVacia('principal'), salidaVacia('subproducto'), salidaVacia('merma')]

export default function Procesar() {
  const [params] = useSearchParams()
  const procesoId = params.get('id')
  const tipos = useAsync<TipoProceso[]>(listTiposProceso, [], [])
  const productos = useAsync<Producto[]>(() => listProductos(), [], [])
  const lotesQ = useAsync<StockLote[]>(srv.listLotesDisponibles, [], [])
  const obreros = useAsync<Obrero[]>(() => listObreros(), [], [])
  const clientes = useAsync<Cliente[]>(srv.listClientes, [], [])
  const [extraLotes, setExtraLotes] = useState<StockLote[]>([])
  const [cab, setCab] = useState<srv.CabeceraProceso>({ tipo_proceso_id: null, fecha: hoy(), observaciones: '', obrero_id: null, hora_inicio: '', hora_fin: '' })
  const [entradas, setEntradas] = useState<EntradaForm[]>([entradaVacia()])
  const [salidas, setSalidas] = useState<SalidaForm[]>(salidasIniciales())
  const [error, setError] = useState(''); const [guardando, setGuardando] = useState(false)
  const [aceptaSobra, setAceptaSobra] = useState(false)   // cerrar aunque las salidas pesen más que la entrada
  const [nuevoObrero, setNuevoObrero] = useState<string | null>(null)   // null = cerrado; '' o texto = agregando
  const agregarObrero = async () => {
    const nombre = (nuevoObrero ?? '').trim(); if (!nombre) return
    const existente = obreros.data.find((o) => o.nombre.trim().toLowerCase() === nombre.toLowerCase())
    if (existente) { up('obrero_id', existente.id); setNuevoObrero(null); return }
    try { const o = await crearObrero(nombre); await obreros.recargar(); up('obrero_id', o.id); setNuevoObrero(null); setError('') }
    catch (e) { setError(/duplicate|unique|obreros_nombre_uk/i.test((e as Error).message) ? `Ya existe un obrero llamado "${nombre}" (quizá está desactivado: revisa Catálogos → Obreros).` : (e as Error).message) }
  }
  const [resultado, setResultado] = useState<srv.ResultadoProceso | null>(null)
  const up = <K extends keyof srv.CabeceraProceso>(k: K, v: srv.CabeceraProceso[K]) => setCab((c) => ({ ...c, [k]: v }))

  useEffect(() => { if (tipos.data.length && !cab.tipo_proceso_id) up('tipo_proceso_id', tipos.data[0].id) }, [tipos.data]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!procesoId) return
    srv.getProceso(procesoId).then(({ proceso, entradas: en, salidas: sa, lotes }) => {
      setCab({ tipo_proceso_id: proceso.tipo_proceso_id, fecha: proceso.fecha, observaciones: proceso.observaciones ?? '', obrero_id: proceso.obrero_id ?? null, hora_inicio: hora(proceso.hora_inicio), hora_fin: hora(proceso.hora_fin) })
      if (en.length) setEntradas(en.map((e) => ({ lote_id: e.lote_id, kg_tomados: e.kg_tomados, kg_devueltos: e.kg_devueltos })))
      if (sa.length) setSalidas(sa.map((s) => ({ producto_id: s.producto_id, rol: s.rol, kg: s.kg, precio_credito: s.precio_credito ?? '', conserva_proveedor: s.conserva_proveedor, destino: s.destino ?? 'stock', cliente: s.cliente ?? '' })))
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
    if (!fechaValida(cab.fecha)) return setError('La fecha no es válida: revisa el año (debe estar entre 2020 y hoy).')
    if (salidas.some((s) => s.producto_id && Number(s.kg) > 0 && s.rol !== 'merma' && s.destino === 'pedido' && !s.cliente.trim())) return setError('Las salidas para pedido necesitan el nombre del cliente (para quién se elaboró).')
    const err = validarProceso(b, entradas, salidas, lotes, !procesoId, aceptaSobra)
    if (err) return setError(err)
    setGuardando(true)
    try {
      const r = await srv.guardarProceso({
        id: procesoId, cabecera: { ...cab, observaciones: cab.observaciones || null, hora_inicio: cab.hora_inicio || null, hora_fin: cab.hora_fin || null },
        entradas: entradas.filter((e) => e.lote_id && Number(e.kg_tomados) > 0),
        salidas: salidas.filter((s) => s.producto_id && Number(s.kg) > 0),
      })
      setResultado(r); setEntradas([entradaVacia()]); setSalidas(salidasIniciales()); up('observaciones', ''); up('hora_inicio', ''); up('hora_fin', ''); setAceptaSobra(false); void lotesQ.recargar(); void clientes.recargar()
      if (procesoId) window.history.replaceState(null, '', '/procesar')
    } catch (e) { setError((e as Error).message) }
    setGuardando(false)
  }

  return (
    <PageTemplate titulo="Procesar" subtitulo="Toma lotes de la cámara, anota lo que salió y el sistema reparte el costo.">
      <Notice tipo="error">{tipos.error || productos.error || lotesQ.error}</Notice>
      {resultado && <Notice tipo="ok">Proceso cerrado{duracion(resultado.proceso.hora_inicio, resultado.proceso.hora_fin) && <> en <b>{duracion(resultado.proceso.hora_inicio, resultado.proceso.hora_fin)}</b></>}. Entrada {fmt.kg(resultado.proceso.kg_consumidos)} kg ({fmt.usd(resultado.proceso.costo_entrada)}), crédito subproductos {fmt.usd(resultado.proceso.credito_subproductos)}, costo neto {fmt.usd(resultado.proceso.costo_neto)}.
        {Number(resultado.proceso.kg_merma_no_reg) > 0 && <> Quedaron <b>{fmt.kg(resultado.proceso.kg_merma_no_reg)} kg sin justificar</b>.</>}
        {Number(resultado.proceso.kg_merma_no_reg) < -0.0005 && <> Las salidas pesaron <b>{fmt.kg(-Number(resultado.proceso.kg_merma_no_reg))} kg más que la entrada</b>: quedó registrado como sobrante y aparece en Alertas para revisar el pesaje.</>}
        <ul>{resultado.hijos.map((h, i) => <li key={i}><Mono><b>{h.lotes?.codigo}</b></Mono> {h.productos?.nombre} · {fmt.kg(h.kg)} kg · {fmt.usd4(h.costo_kg)}/kg{h.destino === 'pedido' && <> · <b>pedido para {h.cliente ?? 'cliente'}</b></>}</li>)}</ul></Notice>}
      {procesoId && <Notice tipo="warn">Estás cerrando un proceso que quedó pendiente. <Link to="/procesar">Empezar uno nuevo</Link></Notice>}
      <Panel>
        <Grid form>
          <Field label="Tipo de proceso"><Select value={cab.tipo_proceso_id ?? ''} onChange={(e) => up('tipo_proceso_id', Number(e.target.value))} opciones={tipos.data.map((t) => ({ value: t.id, label: t.nombre }))} aria-label="Tipo de proceso" /></Field>
          <Field label="Fecha"><Input tipo="date" value={cab.fecha} min="2020-01-01" max={hoy()} onChange={(e) => up('fecha', e.target.value)} /></Field>
          <Field label="Hora inicio"><Input tipo="time" value={cab.hora_inicio ?? ''} onChange={(e) => up('hora_inicio', e.target.value)} aria-label="Hora inicio" /></Field>
          <Field label="Hora fin" ayuda={duracion(cab.hora_inicio, cab.hora_fin) && `Duración: ${duracion(cab.hora_inicio, cab.hora_fin)}`}><Input tipo="time" value={cab.hora_fin ?? ''} onChange={(e) => up('hora_fin', e.target.value)} aria-label="Hora fin" /></Field>
          <Field label="Quién procesó" ayuda={nuevoObrero == null && obreros.data.length === 0 && !obreros.cargando && 'Aún no hay obreros: pulsa "Nuevo" para agregar el primero.'}>
            {nuevoObrero == null
              ? <span style={{ display: 'flex', gap: 6 }}>
                <Select value={cab.obrero_id ?? ''} onChange={(e) => up('obrero_id', e.target.value ? Number(e.target.value) : null)} aria-label="Quién procesó"
                  opciones={[{ value: '', label: 'Sin asignar' }, ...obreros.data.map((o) => ({ value: o.id, label: o.nombre }))]} />
                <Button variante="secundario" onClick={() => setNuevoObrero('')} title="Agregar un obrero que no está en la lista" aria-label="Nuevo obrero">Nuevo</Button>
              </span>
              : <span style={{ display: 'flex', gap: 6 }}>
                <Input value={nuevoObrero} onChange={(e) => setNuevoObrero(e.target.value)} placeholder="Nombre y apellido" autoFocus aria-label="Nombre del nuevo obrero"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregarObrero() } if (e.key === 'Escape') setNuevoObrero(null) }} />
                <Button variante="primario" onClick={() => void agregarObrero()} disabled={!nuevoObrero.trim()}>Agregar</Button>
                <Button onClick={() => setNuevoObrero(null)}>Cancelar</Button>
              </span>}
          </Field>
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
        <ProcesoSalidas salidas={salidas} onChange={setSalidas} productos={productos.data} kgSalidas={b.kgSalidas} costoNeto={b.costoNeto} costoPrincipal={b.costoPrincipal} clientes={clientes.data.map((c) => c.cliente)} />
        {b.sobra && <Notice tipo="warn">Las salidas pesan <b>{fmt.kg(-b.faltan)} kg más</b> que lo que entró ({fmt.kg(b.consumo)} kg). Eso no puede pasar físicamente: alguien pesó o digitó mal.
          Revisa primero los kg de las salidas. Si lo que pesó mal fue la jaba de entrada, corrígela en <Link to="/stock">Stock → Corregir lote</Link> y vuelve a tomar los kilos.
          Si igual necesitas cerrar ahora, marca la casilla: el sobrante queda registrado y sale en Alertas.
          <div style={{ marginTop: 8 }}><Checkbox checked={aceptaSobra} onChange={(e) => setAceptaSobra(e.target.checked)}>Cerrar con sobrante de {fmt.kg(-b.faltan)} kg (error de pesaje)</Checkbox></div></Notice>}
        <PanelPie izquierda={<Button onClick={() => setSalidas((ss) => [...ss, salidaVacia('principal')])}>Agregar salida</Button>}>
          <Notice tipo="error" style={{ margin: 0 }}>{error}</Notice>
          <Button variante="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Cerrando…' : 'Cerrar proceso'}</Button>
        </PanelPie>
      </Panel>
    </PageTemplate>
  )
}
