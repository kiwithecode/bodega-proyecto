import { useEffect, useState } from 'react'
import { Ayuda, Button, Checkbox, Input, Notice } from '../atoms'
import { Field, SimilarList } from '../molecules'
import { PanelPie } from './Panel'
import { useDebounce } from '../../hooks/useDebounce'
import * as cat from '../../services/catalogos'
import type { Proveedor, Similar } from '../../lib/types'

type Form = cat.NuevoProveedor
export function ProveedorForm({ siguienteCodigo, onCreado }: { siguienteCodigo: number | null; onCreado?: (p: Proveedor) => void }) {
  const [f, setF] = useState<Form>({ nombre: '', acuerdo: '', forzar: false })
  const [similares, setSimilares] = useState<Similar[]>([])
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null)
  const up = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const nombreD = useDebounce(f.nombre, 350)

  useEffect(() => {
    if (nombreD.trim().length < 3) { setSimilares([]); return }
    Promise.resolve(cat.proveedoresSimilares(nombreD)).then((s) => { setSimilares(s); up('forzar', false) }).catch((e: Error) => setMsg({ t: 'error', m: e.message }))
  }, [nombreD])

  const repetido = similares.find((s) => s.veredicto === 'REPETIDO')
  const parecido = similares.find((s) => s.veredicto === 'MUY PARECIDO')
  const crear = async () => {
    setMsg(null)
    try {
      const p = await cat.crearProveedor(f)
      setMsg({ t: 'ok', m: `Creado: ${p.nombre} con el código ${p.codigo}.` })
      setF({ nombre: '', acuerdo: '', forzar: false }); setSimilares([]); onCreado?.(p)
    } catch (e) { setMsg({ t: 'error', m: (e as Error).message }) }
  }
  return (
    <>
      <Field label="Nombre"><Input value={f.nombre} onChange={(e) => up('nombre', e.target.value)} autoFocus /></Field>
      <Field label="Acuerdo de limpieza (opcional)"><Input value={f.acuerdo} onChange={(e) => up('acuerdo', e.target.value)} placeholder="Qué se limpia al recibir según lo pactado" /></Field>
      <SimilarList items={similares} />
      {repetido && <Notice tipo="error">Ese proveedor ya existe con el código <b>{repetido.codigo}</b>.</Notice>}
      {!repetido && parecido && <Notice tipo="warn">Se parece mucho a <b>{parecido.nombre} ({parecido.codigo})</b>. <Checkbox checked={f.forzar} onChange={(e) => up('forzar', e.target.checked)}>Es otra persona, crearlo igual</Checkbox></Notice>}
      <Ayuda>El código lo asigna el sistema: será el <b>{siguienteCodigo ?? '…'}</b>.</Ayuda>
      {msg && <Notice tipo={msg.t}>{msg.m}</Notice>}
      <PanelPie><Button variante="primario" onClick={crear} disabled={!f.nombre.trim() || !!repetido || (!!parecido && !f.forzar)}>Crear proveedor</Button></PanelPie>
    </>
  )
}
