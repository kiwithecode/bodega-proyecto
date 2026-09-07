import { num } from './format'
import type { EntradaForm, SalidaForm, Rol } from './types'

export interface LoteRef { id: string; costo_kg: number; kg_disponible: number; proveedor_codigo?: number | null }
export interface Balance {
  consumo: number; costoEntrada: number
  kgPrincipal: number; kgSubproducto: number; kgMerma: number; kgSalidas: number
  credito: number; costoNeto: number; costoPrincipal: number
  faltan: number; sobra: boolean; cuadra: boolean; proveedores: number
}

/** Misma matemática que fn_procesar en la base, para mostrarla en vivo antes de guardar. */
export function calcularBalance(entradas: EntradaForm[], salidas: SalidaForm[], lotes: LoteRef[]): Balance {
  const ent = entradas.filter((e) => e.lote_id && num(e.kg_tomados) > 0)
  const lote = (id: string | null) => lotes.find((l) => l.id === id)
  const consumo = ent.reduce((a, e) => a + num(e.kg_tomados) - num(e.kg_devueltos), 0)
  const costoEntrada = ent.reduce((a, e) => a + (num(e.kg_tomados) - num(e.kg_devueltos)) * (lote(e.lote_id)?.costo_kg ?? 0), 0)
  const sal = salidas.filter((s) => s.producto_id && num(s.kg) > 0)
  const kgRol = (r: Rol) => sal.filter((s) => s.rol === r).reduce((a, s) => a + num(s.kg), 0)
  const kgPrincipal = kgRol('principal'), kgSubproducto = kgRol('subproducto'), kgMerma = kgRol('merma')
  const kgSalidas = kgPrincipal + kgSubproducto + kgMerma
  const credito = sal.filter((s) => s.rol === 'subproducto').reduce((a, s) => a + num(s.kg) * num(s.precio_credito), 0)
  const costoNeto = costoEntrada - credito
  const costoPrincipal = kgPrincipal > 0 ? costoNeto / kgPrincipal : 0
  const faltan = consumo - kgSalidas
  const proveedores = new Set(ent.map((e) => lote(e.lote_id)?.proveedor_codigo).filter((p) => p != null)).size
  return { consumo, costoEntrada, kgPrincipal, kgSubproducto, kgMerma, kgSalidas, credito, costoNeto, costoPrincipal,
    faltan, sobra: faltan < -0.0005, cuadra: Math.abs(faltan) <= 0.0005 && consumo > 0, proveedores }
}

/** Validación previa al guardado. Devuelve el mensaje de error o null si todo está bien. */
export function validarProceso(b: Balance, entradas: EntradaForm[], salidas: SalidaForm[], lotes: LoteRef[], esNuevo: boolean): string | null {
  const ent = entradas.filter((e) => e.lote_id && num(e.kg_tomados) > 0)
  const sal = salidas.filter((s) => s.producto_id && num(s.kg) > 0)
  if (ent.length === 0) return 'Agrega al menos un lote de entrada con kilos.'
  if (sal.length === 0) return 'Agrega al menos una salida con kilos.'
  if (sal.some((s) => s.rol === 'subproducto' && String(s.precio_credito) === '')) return 'Los subproductos necesitan precio de crédito.'
  if (b.sobra) return `Las salidas suman ${b.kgSalidas.toFixed(3)} kg pero solo entraron ${b.consumo.toFixed(3)} kg.`
  if (esNuevo) for (const e of ent) {
    const l = lotes.find((x) => x.id === e.lote_id)
    if (l && num(e.kg_tomados) > l.kg_disponible + 0.0005) return `El lote solo tiene ${l.kg_disponible.toFixed(3)} kg disponibles.`
  }
  return null
}
