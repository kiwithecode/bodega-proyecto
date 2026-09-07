/** Utilidades puras para armar series de gráficas (con test en __tests__/series.test.ts). */

const aISO = (d: Date) => d.toISOString().slice(0, 10)
const deISO = (s: string) => new Date(s + 'T00:00:00Z')

/** Todos los días entre dos fechas ISO, ambas incluidas. Si están invertidas, devuelve []. */
export function diasEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  const d = deISO(desde), h = deISO(hasta)
  if (isNaN(d.getTime()) || isNaN(h.getTime())) return out
  for (let t = d; t <= h; t.setUTCDate(t.getUTCDate() + 1)) out.push(aISO(t))
  return out
}

/** Completa los días sin fila con `vacio`, para que la línea no salte fechas. */
export function rellenarDias<T extends { fecha: string }>(desde: string, hasta: string, filas: T[], vacio: Omit<T, 'fecha'>): T[] {
  const por = new Map(filas.map((f) => [f.fecha.slice(0, 10), f]))
  return diasEntre(desde, hasta).map((fecha) => por.get(fecha) ?? ({ ...vacio, fecha } as T))
}

/** Paso "bonito" (1, 2, 5 × 10^n) para que el eje tenga números redondos. */
export function pasoBonito(rango: number, divisiones = 4): number {
  if (!(rango > 0)) return 1
  const crudo = rango / divisiones
  const pot = 10 ** Math.floor(Math.log10(crudo))
  const f = crudo / pot
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pot
}

/** Marcas del eje Y desde 0 hasta cubrir `max`. Para max 0 devuelve [0, 1]. */
export function marcasEje(max: number, divisiones = 4): number[] {
  const paso = pasoBonito(max, divisiones)
  const tope = Math.max(paso, Math.ceil(max / paso) * paso)
  const out: number[] = []
  for (let v = 0; v <= tope + paso / 2; v += paso) out.push(+v.toFixed(6))
  return out
}

/** Marcas entre un mínimo y un máximo (para tendencias donde arrancar en 0 aplana la línea, p. ej. costo $/kg). */
export function marcasEjeRango(min: number, max: number, divisiones = 4): number[] {
  if (!(max > min)) return marcasEje(max, divisiones)
  const paso = pasoBonito(max - min, divisiones)
  const piso = Math.floor(min / paso) * paso, techo = Math.ceil(max / paso) * paso
  const out: number[] = []
  for (let v = piso; v <= techo + paso / 2; v += paso) out.push(+v.toFixed(6))
  return out
}

/** Los n mayores y el resto sumado en "Otros" (solo si hay resto). Ordenado de mayor a menor. */
export function topN<T>(items: T[], n: number, valor: (t: T) => number, etiqueta: (t: T) => string, otros = 'Otros'): { etiqueta: string; valor: number }[] {
  const orden = [...items].map((t) => ({ etiqueta: etiqueta(t), valor: valor(t) })).sort((a, b) => b.valor - a.valor)
  if (orden.length <= n) return orden
  const resto = orden.slice(n).reduce((a, x) => a + x.valor, 0)
  return [...orden.slice(0, n), { etiqueta: `${otros} (${orden.length - n})`, valor: resto }]
}

/** Agrupa y suma por clave. */
export function sumarPor<T>(items: T[], clave: (t: T) => string, valor: (t: T) => number): { clave: string; valor: number }[] {
  const m = new Map<string, number>()
  items.forEach((t) => m.set(clave(t), (m.get(clave(t)) ?? 0) + valor(t)))
  return [...m].map(([clave, valor]) => ({ clave, valor }))
}

/** "2026-05-04" → "04/05" para etiquetas de eje cortas. */
export const diaCorto = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
