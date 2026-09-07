import type { ReactNode } from 'react'
import { Kpi } from '../molecules'
import { Grid } from './Panel'
export function KpiGrid({ items }: { items: { valor: ReactNode; etiqueta: string }[] }) {
  return <Grid kpis>{items.map((k) => <Kpi key={k.etiqueta} {...k} />)}</Grid>
}
