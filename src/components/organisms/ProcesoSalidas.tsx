import { Ayuda, Button, Input, Select, type Opcion } from '../atoms'
import { Combo } from '../molecules'
import { DataTable, type Columna } from './DataTable'
import { fmt } from '../../lib/format'
import type { Destino, Producto, Rol, SalidaForm } from '../../lib/types'

export const ROLES: Opcion[] = [
  { value: 'principal', label: 'Producto (lleva el costo)' },
  { value: 'subproducto', label: 'Subproducto (se acredita)' },
  { value: 'merma', label: 'Merma (costo 0)' },
]
export const salidaVacia = (rol: Rol = 'principal'): SalidaForm => ({ producto_id: null, rol, kg: '', precio_credito: '', conserva_proveedor: true, destino: 'stock', cliente: '' })

export function ProcesoSalidas({ salidas, onChange, productos, kgSalidas, costoNeto, costoPrincipal, clientes = [] }: { salidas: SalidaForm[]; onChange: (s: SalidaForm[]) => void; productos: Producto[]; kgSalidas: number; costoNeto: number; costoPrincipal: number; clientes?: string[] }) {
  const set = <K extends keyof SalidaForm>(i: number, campo: K, v: SalidaForm[K]) => onChange(salidas.map((s, j) => {
    if (j !== i) return s
    const n = { ...s, [campo]: v }
    if (campo === 'producto_id') { const p = productos.find((x) => x.id === v); if (p) n.rol = p.rol_defecto }
    return n
  }))
  const columnas: Columna<SalidaForm>[] = [
    { key: 'prod', titulo: 'Producto que sale', ancho: '30%', render: (s, i) => <Combo opciones={productos} value={s.producto_id} onChange={(v) => set(i, 'producto_id', v)} clave={(p) => p.id} mostrar={(p) => p.nombre} extra={(p) => `${p.codigo}${p.interno ? ' · interno' : ''}`} chico aria-label={`Salida fila ${i + 1}`} /> },
    { key: 'rol', titulo: 'Tipo', render: (s, i) => <Select chico value={s.rol} onChange={(e) => set(i, 'rol', e.target.value as Rol)} opciones={ROLES} /> },
    { key: 'kg', titulo: 'kg', n: true, render: (s, i) => <Input tipo="number" chico step="0.001" min="0" value={s.kg} onChange={(e) => set(i, 'kg', e.target.value)} aria-label={`kg salida fila ${i + 1}`} /> },
    { key: 'precio', titulo: 'Precio crédito $/kg', n: true, render: (s, i) => s.rol === 'subproducto'
        ? <Input tipo="number" chico step="0.0001" min="0" value={s.precio_credito} onChange={(e) => set(i, 'precio_credito', e.target.value)} aria-label={`precio crédito fila ${i + 1}`} />
        : <Ayuda>{s.rol === 'principal' ? 'se calcula' : '0'}</Ayuda> },
    { key: 'prov', titulo: 'Lote hijo', render: (s, i) => <Select chico value={s.conserva_proveedor ? '1' : '0'} onChange={(e) => set(i, 'conserva_proveedor', e.target.value === '1')} opciones={[{ value: '1', label: 'Con proveedor' }, { value: '0', label: 'Mezcla (sin proveedor)' }]} /> },
    { key: 'dest', titulo: 'Destino', ancho: '22%', render: (s, i) => s.rol === 'merma' ? <Ayuda>—</Ayuda> : (
      <span style={{ display: 'flex', gap: 6 }}>
        <Select chico value={s.destino} onChange={(e) => set(i, 'destino', e.target.value as Destino)} opciones={[{ value: 'stock', label: 'Stock' }, { value: 'pedido', label: 'Pedido' }]} aria-label={`Destino fila ${i + 1}`} style={{ width: 96 }} />
        {s.destino === 'pedido' && <><Input chico value={s.cliente} onChange={(e) => set(i, 'cliente', e.target.value)} placeholder="Para quién" list="clientes-pedido" autoComplete="off" aria-label={`Cliente fila ${i + 1}`} />
          <datalist id="clientes-pedido">{clientes.map((c) => <option key={c} value={c} />)}</datalist></>}
      </span>) },
    { key: 'x', titulo: '', render: (_, i) => <Button tamano="chico" variante="peligro" onClick={() => onChange(salidas.filter((_, j) => j !== i))}>×</Button> },
  ]
  const total = [`Costo neto ${fmt.usd(costoNeto)}`, '', fmt.kg(kgSalidas), costoPrincipal > 0 ? <>Costo real del producto: <b>{fmt.usd4(costoPrincipal)}/kg</b></> : '', '', '', '']
  return <DataTable columnas={columnas} filas={salidas} filaKey={(_, i) => i} total={total} />
}
