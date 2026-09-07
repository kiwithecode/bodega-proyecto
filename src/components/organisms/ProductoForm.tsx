import { useEffect, useState } from 'react'
import { Button, Checkbox, Input, Notice, Select, type Opcion } from '../atoms'
import { Chips, Field, SimilarList } from '../molecules'
import { Grid, PanelPie } from './Panel'
import { useDebounce } from '../../hooks/useDebounce'
import * as cat from '../../services/catalogos'
import type { CodigoSugerido, Especie, Producto, Rol, Similar } from '../../lib/types'

const ROLES: Opcion[] = [{ value: 'principal', label: 'Producto (lleva costo)' }, { value: 'subproducto', label: 'Subproducto (se acredita)' }, { value: 'merma', label: 'Merma (costo 0)' }]
type Form = cat.NuevoProducto
const vacio = (especie = 'R'): Form => ({ nombre: '', especie, rol: 'principal', interno: false, codigo: '', forzar: false })

export function ProductoForm({ especies, onCreado }: { especies: Especie[]; onCreado?: (p: Producto) => void }) {
  const [f, setF] = useState<Form>(vacio())
  const [similares, setSimilares] = useState<Similar[]>([])
  const [sugeridos, setSugeridos] = useState<CodigoSugerido[]>([])
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null)
  const up = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const nombreD = useDebounce(f.nombre, 350)

  useEffect(() => {
    if (nombreD.trim().length < 3) { setSimilares([]); setSugeridos([]); return }
    Promise.all([cat.productosSimilares(nombreD, f.especie), cat.sugerirCodigos(nombreD, f.especie)])
      .then(([s, c]) => { setSimilares(s); setSugeridos(c); setF((x) => ({ ...x, forzar: false, codigo: x.codigo || c[0]?.codigo || '' })) })
      .catch((e: Error) => setMsg({ t: 'error', m: e.message }))
  }, [nombreD, f.especie])

  const repetido = similares.find((s) => s.veredicto === 'REPETIDO')
  const parecido = similares.find((s) => s.veredicto === 'MUY PARECIDO')

  const crear = async () => {
    setMsg(null)
    try {
      const p = await cat.crearProducto(f)
      setMsg({ t: 'ok', m: `Creado ${p.codigo} · ${p.nombre}.` })
      setF(vacio(f.especie)); setSimilares([]); setSugeridos([]); onCreado?.(p)
    } catch (e) { setMsg({ t: 'error', m: (e as Error).message }) }
  }

  return (
    <>
      <Field label="Nombre"><Input value={f.nombre} onChange={(e) => up('nombre', e.target.value)} placeholder="Por ejemplo: Lomo falda especial" autoFocus /></Field>
      <Grid form>
        <Field label="Especie"><Select value={f.especie} onChange={(e) => up('especie', e.target.value)} opciones={especies.map((e) => ({ value: e.codigo, label: e.nombre }))} /></Field>
        <Field label="Tipo"><Select value={f.rol} onChange={(e) => up('rol', e.target.value as Rol)} opciones={ROLES} /></Field>
      </Grid>
      <Field><Checkbox checked={f.interno} onChange={(e) => up('interno', e.target.checked)}>Solo nace de un proceso (no se compra)</Checkbox></Field>
      <SimilarList items={similares} detalle={(x) => x.especie} />
      {repetido && <Notice tipo="error">Este producto ya existe como <b>{repetido.codigo}</b>. No se puede crear dos veces.</Notice>}
      {!repetido && parecido && <Notice tipo="warn">Se parece mucho a <b>{parecido.nombre} ({parecido.codigo})</b>. <Checkbox checked={f.forzar} onChange={(e) => up('forzar', e.target.checked)}>Es un producto distinto, crearlo igual</Checkbox></Notice>}
      <Field label="Código" ayuda="Las letras del final indican la especie: R res, C cerdo, P pollo, V vísceras. Este código forma parte del número de lote.">
        {sugeridos.length > 0 && <div style={{ marginBottom: 8 }}><Chips items={sugeridos.map((s) => ({ valor: s.codigo, detalle: s.regla }))} valor={f.codigo} onChange={(v) => up('codigo', v)} /></div>}
        <Input mono value={f.codigo} onChange={(e) => up('codigo', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="2 a 6 letras" maxLength={6} style={{ width: 160 }} aria-label="Código" />
      </Field>
      {msg && <Notice tipo={msg.t}>{msg.m}</Notice>}
      <PanelPie><Button variante="primario" onClick={crear} disabled={!f.nombre.trim() || f.codigo.length < 2 || !!repetido || (!!parecido && !f.forzar)}>Crear producto</Button></PanelPie>
    </>
  )
}
