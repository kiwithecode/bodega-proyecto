import s from './SimilarList.module.css'
import { Badge, Mono, tonoVeredicto } from '../atoms'
import { Field } from './Field'
import type { Similar } from '../../lib/types'
export function SimilarList({ items, detalle }: { items: Similar[]; detalle?: (x: Similar) => string | undefined }) {
  if (!items?.length) return null
  return (
    <Field label="Ya existe algo parecido">
      {items.map((x) => (
        <div key={x.id} className={s.fila}>
          <Mono>{x.codigo}</Mono><span className={s.nombre}>{x.nombre} {detalle && <small style={{ color: 'var(--ink-3)' }}>{detalle(x)}</small>}</span>
          <Badge tono={tonoVeredicto(x.veredicto)}>{x.veredicto}</Badge>
        </div>
      ))}
    </Field>
  )
}
