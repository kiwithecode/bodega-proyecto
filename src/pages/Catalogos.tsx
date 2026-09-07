import { useState } from 'react'
import { Ayuda, Badge, Button, Checkbox, Input, Mono, Notice } from '../components/atoms'
import { Tabs } from '../components/molecules'
import { DataTable, Grid, Panel, ProductoForm, ProveedorForm } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import type { Especie, Producto, Proveedor } from '../lib/types'
import * as cat from '../services/catalogos'

const ROL = { principal: 'Producto', subproducto: 'Subproducto', merma: 'Merma', devolucion: 'Devolución' }
type Tab = 'productos' | 'proveedores'

export default function Catalogos() {
  const [tab, setTab] = useState<Tab>('productos')
  return (
    <PageTemplate titulo="Catálogos" subtitulo="Productos y proveedores. Al agregar, el sistema avisa si ya existe algo parecido y propone el código.">
      <Tabs<Tab> activo={tab} onChange={setTab} items={[{ id: 'productos', label: 'Productos' }, { id: 'proveedores', label: 'Proveedores' }]} />
      {tab === 'productos' ? <Productos /> : <Proveedores />}
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
