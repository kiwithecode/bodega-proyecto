import s from './CuadreBar.module.css'
import { fmt } from '../../lib/format'
export interface CuadreBarProps { consumo: number; principal: number; subproducto: number; merma: number }
/** Muestra cuánto del consumo ya está repartido entre producto, subproductos y merma. */
export function CuadreBar({ consumo, principal, subproducto, merma }: CuadreBarProps) {
  const faltan = consumo - (principal + subproducto + merma)
  const pct = (kg: number) => consumo > 0 ? Math.min(100, (kg / consumo) * 100) : 0
  const sobra = faltan < -0.0005
  const texto = consumo === 0 ? 'Sin entrada' : faltan > 0.0005 ? `Faltan ${fmt.kg(faltan)} kg por repartir` : sobra ? `Sobran ${fmt.kg(-faltan)} kg` : 'Cuadra'
  return (
    <div className={s.cuadre}>
      <div className={s.pista} role="img" aria-label={`Reparto de kilos: ${texto}`}>
        <div className={`${s.seg} ${s.principal}`} style={{ width: pct(principal) + '%' }} />
        <div className={`${s.seg} ${s.subproducto}`} style={{ width: pct(subproducto) + '%' }} />
        <div className={`${s.seg} ${s.merma}`} style={{ width: pct(merma) + '%' }} />
        {sobra && <div className={`${s.seg} ${s.exceso}`} style={{ width: pct(-faltan) + '%' }} />}
      </div>
      <div className={s.leyenda}>
        <span><i style={{ background: 'var(--verde)' }} />Producto {fmt.kg(principal)} kg</span>
        <span><i style={{ background: 'var(--azul)' }} />Subproductos {fmt.kg(subproducto)} kg</span>
        <span><i style={{ background: 'var(--ink-3)' }} />Merma {fmt.kg(merma)} kg</span>
        <span className={`${s.estado} ${sobra ? s.mal : ''}`} data-testid="cuadre-estado">{texto}</span>
      </div>
    </div>
  )
}
