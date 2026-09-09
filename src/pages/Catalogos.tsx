import { useState } from 'react'
import { Ayuda, Badge, Button, Checkbox, Input, Mono, Notice } from '../components/atoms'
import { Tabs } from '../components/molecules'
import { DataTable, Grid, Panel, ProductoForm, ProveedorForm } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import type { Especie, Obrero, Parametro, Producto, Proveedor } from '../lib/types'
import * as cat from '../services/catalogos'

const ROL = { principal: 'Producto', subproducto: 'Subproducto', merma: 'Merma', devolucion: 'Devolución' }
type Tab = 'productos' | 'proveedores' | 'obreros' | 'parametros'

export default function Catalogos() {
  const [tab, setTab] = useState<Tab>('productos')
  return (
    <PageTemplate titulo="Catálogos" subtitulo="Productos, proveedores y obreros. Al agregar, el sistema avisa si ya existe algo parecido y propone el código.">
      <Tabs<Tab> activo={tab} onChange={setTab} items={[{ id: 'productos', label: 'Productos' }, { id: 'proveedores', label: 'Proveedores' }, { id: 'obreros', label: 'Obreros' }, { id: 'parametros', label: 'Parámetros' }]} />
      {tab === 'productos' && <Productos />}
      {tab === 'proveedores' && <Proveedores />}
      {tab === 'obreros' && <Obreros />}
      {tab === 'parametros' && <Parametros />}
    </PageTemplate>
  )
}

function Filtro({ titulo, n, q, setQ }: { titulo: string; n: number; q: string; setQ: (v: string) => void }) {
  return <><h2 style={{ margin: 0 }}>{titulo} ({n})</h2><Input placeholder="Filtrar…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: 'auto', width: 220 }} /></>
}

function Productos() {
  const lista = useAsync<Producto[]>(() => cat.listProductos({ soloActivos: false }), [], [])
  const especies = useAsync<Especie[]>(cat.listEspecies, [], [])
  const [q, setQ] = useState('')
  const f = q.trim().toLowerCase()
  const filtrada = lista.data.filter((p) => !f || `${p.codigo} ${p.nombre} ${p.especies?.nombre ?? ''}`.toLowerCase().includes(f))
  return (
    <>
      <Notice tipo="error">{lista.error || especies.error}</Notice>
      <Grid dos>
        <Panel titulo="Agregar producto"><ProductoForm especies={especies.data} onCreado={() => void lista.recargar()} /></Panel>
        <Panel acciones={<Filtro titulo="Productos" n={filtrada.length} q={q} setQ={setQ} />}>
          <DataTable<Producto> filas={filtrada} apagada={(p) => !p.activo} columnas={[
            { key: 'codigo', titulo: 'Código', render: (p) => <Mono>{p.codigo}</Mono> },
            { key: 'nombre', titulo: 'Nombre', render: (p) => <>{p.nombre}{p.por_confirmar && <> <Badge tono="aviso">por confirmar</Badge></>}{p.interno && <Ayuda>interno</Ayuda>}</> },
            { key: 'esp', titulo: 'Especie', render: (p) => p.especies?.nombre },
            { key: 'rol', titulo: 'Tipo', render: (p) => ROL[p.rol_defecto] },
            { key: 'x', titulo: '', render: (p) => <Button tamano="chico" onClick={() => cat.setProductoActivo(p.id, !p.activo).then(() => lista.recargar())}>{p.activo ? 'Desactivar' : 'Activar'}</Button> },
          ]} />
        </Panel>
      </Grid>
    </>
  )
}

function Proveedores() {
  const lista = useAsync<Proveedor[]>(() => cat.listProveedores({ soloActivos: false }), [], [])
  const siguiente = useAsync<number | null>(cat.siguienteCodigoProveedor, [], null)
  const [q, setQ] = useState(''); const [edit, setEdit] = useState<Proveedor | null>(null)
  const f = q.trim().toLowerCase()
  const filtrada = lista.data.filter((p) => !f || `${p.codigo} ${p.nombre}`.toLowerCase().includes(f))
  const guardar = () => edit && cat.actualizarProveedor(edit.id, { nombre: edit.nombre, acuerdo_limpieza: edit.acuerdo_limpieza || null, activo: edit.activo }).then(() => { setEdit(null); void lista.recargar() })
  const creado = () => { void lista.recargar(); void siguiente.recargar() }
  return (
    <>
      <Notice tipo="error">{lista.error}</Notice>
      <Grid dos>
        <Panel titulo="Agregar proveedor"><ProveedorForm siguienteCodigo={siguiente.data} onCreado={creado} /></Panel>
        <Panel acciones={<Filtro titulo="Proveedores" n={filtrada.length} q={q} setQ={setQ} />}>
          <DataTable<Proveedor> filas={filtrada} apagada={(p) => !p.activo && edit?.id !== p.id} columnas={[
            { key: 'codigo', titulo: 'Código', n: true },
            { key: 'nombre', titulo: 'Nombre', render: (p) => edit?.id === p.id ? <Input chico value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /> : p.nombre },
            { key: 'ac', titulo: 'Acuerdo', render: (p) => edit?.id === p.id ? <Input chico value={edit.acuerdo_limpieza ?? ''} onChange={(e) => setEdit({ ...edit, acuerdo_limpieza: e.target.value })} /> : <Ayuda>{p.acuerdo_limpieza}</Ayuda> },
            { key: 'x', titulo: '', render: (p) => edit?.id === p.id
              ? <span style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}><Checkbox checked={edit.activo} onChange={(e) => setEdit({ ...edit, activo: e.target.checked })}>activo</Checkbox><Button tamano="chico" variante="primario" onClick={guardar}>Guardar</Button><Button tamano="chico" onClick={() => setEdit(null)}>Cancelar</Button></span>
              : <Button tamano="chico" variante="secundario" onClick={() => setEdit({ ...p })}>Editar</Button> },
          ]} />
        </Panel>
      </Grid>
    </>
  )
}

/** Personal que procesa. Con catálogo el nombre no se digita en cada proceso y el rendimiento por obrero es confiable. */
function Obreros() {
  const lista = useAsync<Obrero[]>(() => cat.listObreros({ soloActivos: false }), [], [])
  const [q, setQ] = useState(''); const [nuevo, setNuevo] = useState(''); const [edit, setEdit] = useState<Obrero | null>(null); const [msg, setMsg] = useState('')
  const f = q.trim().toLowerCase()
  const filtrada = lista.data.filter((o) => !f || o.nombre.toLowerCase().includes(f))
  const error = (e: Error) => setMsg(/duplicate|unique|obreros_nombre_uk/i.test(e.message) ? 'Ya existe un obrero con ese nombre.' : e.message)
  const crear = () => { setMsg(''); if (!nuevo.trim()) return setMsg('Escribe el nombre.'); Promise.resolve(cat.crearObrero(nuevo)).then(() => { setNuevo(''); void lista.recargar() }).catch(error) }
  const guardar = () => edit && Promise.resolve(cat.actualizarObrero(edit.id, { nombre: edit.nombre, activo: edit.activo })).then(() => { setEdit(null); void lista.recargar() }).catch(error)
  return (
    <>
      <Notice tipo="error">{lista.error || msg}</Notice>
      <Grid dos>
        <Panel titulo="Agregar obrero">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre y apellido" aria-label="Nombre del obrero" onKeyDown={(e) => { if (e.key === 'Enter') crear() }} />
            <Button variante="primario" onClick={crear}>Agregar</Button>
          </div>
          <Ayuda style={{ marginTop: 8 }}>Escríbelo una sola vez y bien: en Procesar se elige de esta lista, así el rendimiento por obrero del Tablero no se reparte entre "José", "Jose" y "jose p". Si alguien deja de trabajar, desactívalo; sus procesos se conservan.</Ayuda>
        </Panel>
        <Panel acciones={<Filtro titulo="Obreros" n={filtrada.length} q={q} setQ={setQ} />}>
          <DataTable<Obrero> filas={filtrada} apagada={(o) => !o.activo && edit?.id !== o.id} vacio="Aún no hay obreros." columnas={[
            { key: 'nombre', titulo: 'Nombre', render: (o) => edit?.id === o.id ? <Input chico value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} aria-label={`Nombre ${o.nombre}`} /> : <>{o.nombre}{!o.activo && <> <Badge tono="neutro">inactivo</Badge></>}</> },
            { key: 'x', titulo: '', render: (o) => edit?.id === o.id
              ? <span style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap', justifyContent: 'flex-end' }}><Checkbox checked={edit.activo} onChange={(e) => setEdit({ ...edit, activo: e.target.checked })}>activo</Checkbox><Button tamano="chico" variante="primario" onClick={guardar}>Guardar</Button><Button tamano="chico" onClick={() => setEdit(null)}>Cancelar</Button></span>
              : <span style={{ display: 'flex', justifyContent: 'flex-end' }}><Button tamano="chico" variante="secundario" onClick={() => setEdit({ ...o })}>Editar</Button></span> },
          ]} />
        </Panel>
      </Grid>
    </>
  )
}

const NOMBRE_PARAM: Record<string, string> = {
  compras_max_semana_kg: 'Compras máximas por producto a la semana (kg)', stock_max_kg: 'Stock máximo por producto en bodega (kg)',
  dias_max_camara_mp: 'Días máximos en cámara: materia prima', dias_max_camara_proc: 'Días máximos en cámara: procesado',
  merma_max_pct: 'Merma no registrada que alerta (%)', precio_desvio_pct: 'Desvío de precio de compra que alerta (%)',
  dias_consumo_promedio: 'Días para calcular consumo y cobertura', horas_proceso_abierto: 'Horas que un proceso puede quedar sin cerrar',
}
/** Umbrales de las alertas del Tablero. Se guardan al salir del campo. */
function Parametros() {
  const lista = useAsync<Parametro[]>(cat.listParametros, [], [])
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null)
  const guardar = (p: Parametro, v: string) => {
    const n = Number(v); if (v === '' || isNaN(n) || n < 0 || n === Number(p.valor)) return
    Promise.resolve(cat.guardarParametro(p.clave, n)).then(() => { setMsg({ t: 'ok', m: `Guardado: ${NOMBRE_PARAM[p.clave] ?? p.clave} = ${n}. Las alertas se recalculan al abrir el Tablero.` }); void lista.recargar() }).catch((e: Error) => setMsg({ t: 'error', m: e.message }))
  }
  return (
    <Panel titulo="Parámetros de alertas">
      <Notice tipo="error">{lista.error}</Notice>
      {msg && <Notice tipo={msg.t}>{msg.m}</Notice>}
      <DataTable<Parametro> filas={lista.data} filaKey={(p) => p.clave} columnas={[
        { key: 'nombre', titulo: 'Qué controla', render: (p) => <>{NOMBRE_PARAM[p.clave] ?? p.clave}<Ayuda>{p.descripcion}</Ayuda></> },
        { key: 'valor', titulo: 'Valor', n: true, ancho: 140, render: (p) => <Input tipo="number" chico step="any" min="0" defaultValue={p.valor} aria-label={NOMBRE_PARAM[p.clave] ?? p.clave} onBlur={(e) => guardar(p, e.target.value)} /> },
      ]} />
      <Ayuda style={{ marginTop: 8 }}>El stock máximo general aplica a los productos que no tienen su propio "Ideal kg" en Stock → Por producto; si lo tienen, manda el ideal.</Ayuda>
    </Panel>
  )
}
