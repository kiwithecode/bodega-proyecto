import { describe, it, expect } from 'vitest'
import { calcularBalance, validarProceso, type LoteRef } from '../cuadre'
import type { EntradaForm, SalidaForm } from '../types'

// Mismo caso que el Excel original y que la prueba de fn_procesar en la base
const lotes: LoteRef[] = [{ id: 'L1', costo_kg: 6.6, kg_disponible: 116.5, proveedor_codigo: 131 }]
const entradas: EntradaForm[] = [{ lote_id: 'L1', kg_tomados: '116.5', kg_devueltos: '' }]
const salidas: SalidaForm[] = [
  { producto_id: 1, rol: 'subproducto', kg: '8.9', precio_credito: '3.3', conserva_proveedor: true },
  { producto_id: 2, rol: 'subproducto', kg: '3.85', precio_credito: '4.5', conserva_proveedor: true },
  { producto_id: 3, rol: 'merma', kg: '5.15', precio_credito: '', conserva_proveedor: true },
  { producto_id: 4, rol: 'merma', kg: '0.2', precio_credito: '', conserva_proveedor: true },
  { producto_id: 5, rol: 'principal', kg: '89.2', precio_credito: '', conserva_proveedor: true },
  { producto_id: 6, rol: 'principal', kg: '9.2', precio_credito: '', conserva_proveedor: true },
]

describe('calcularBalance', () => {
  const b = calcularBalance(entradas, salidas, lotes)
  it('costo de entrada = kg × costo del lote', () => { expect(b.costoEntrada).toBeCloseTo(768.9, 4) })
  it('crédito de subproductos', () => { expect(b.credito).toBeCloseTo(46.695, 4) })
  it('costo neto y costo real del principal coinciden con la base', () => {
    expect(b.costoNeto).toBeCloseTo(722.205, 4)
    expect(b.costoPrincipal).toBeCloseTo(7.3395, 4)
  })
  it('cuadra cuando las salidas suman la entrada', () => { expect(b.faltan).toBeCloseTo(0, 4); expect(b.cuadra).toBe(true); expect(b.sobra).toBe(false) })
  it('devoluciones reducen el consumo', () => {
    const b2 = calcularBalance([{ lote_id: 'L1', kg_tomados: '30', kg_devueltos: '2' }], [], lotes)
    expect(b2.consumo).toBe(28); expect(b2.costoEntrada).toBeCloseTo(184.8, 4)
  })
  it('detecta exceso', () => {
    const b3 = calcularBalance(entradas, [{ producto_id: 5, rol: 'principal', kg: '120', precio_credito: '', conserva_proveedor: true }], lotes)
    expect(b3.sobra).toBe(true); expect(b3.faltan).toBeCloseTo(-3.5, 4)
  })
  it('cuenta proveedores distintos para avisar mezcla', () => {
    const ls: LoteRef[] = [...lotes, { id: 'L2', costo_kg: 4, kg_disponible: 4, proveedor_codigo: 16 }]
    const b4 = calcularBalance([{ lote_id: 'L1', kg_tomados: '8.9', kg_devueltos: '' }, { lote_id: 'L2', kg_tomados: '4', kg_devueltos: '' }], [], ls)
    expect(b4.proveedores).toBe(2)
  })
  it('ignora filas sin lote o sin kilos', () => {
    const b5 = calcularBalance([{ lote_id: null, kg_tomados: '10', kg_devueltos: '' }, { lote_id: 'L1', kg_tomados: '', kg_devueltos: '' }], [], lotes)
    expect(b5.consumo).toBe(0)
  })
})

describe('validarProceso', () => {
  it('pasa el caso completo', () => { expect(validarProceso(calcularBalance(entradas, salidas, lotes), entradas, salidas, lotes, true)).toBeNull() })
  it('exige entradas y salidas', () => {
    expect(validarProceso(calcularBalance([], [], lotes), [], [], lotes, true)).toMatch(/lote de entrada/)
    expect(validarProceso(calcularBalance(entradas, [], lotes), entradas, [], lotes, true)).toMatch(/una salida/)
  })
  it('subproducto sin precio de crédito', () => {
    const s: SalidaForm[] = [{ producto_id: 1, rol: 'subproducto', kg: '5', precio_credito: '', conserva_proveedor: true }]
    expect(validarProceso(calcularBalance(entradas, s, lotes), entradas, s, lotes, true)).toMatch(/precio de crédito/)
  })
  it('con sobrante bloquea, salvo que la persona lo acepte explícitamente', () => {
    const s: SalidaForm[] = [{ producto_id: 5, rol: 'principal', kg: '120', precio_credito: '', conserva_proveedor: true }]
    const b = calcularBalance(entradas, s, lotes)
    expect(validarProceso(b, entradas, s, lotes, true)).toMatch(/sobran 3,50 kg/)
    expect(validarProceso(b, entradas, s, lotes, true, true)).toBeNull()
  })
  it('rechaza más kilos de los disponibles solo en proceso nuevo', () => {
    const e: EntradaForm[] = [{ lote_id: 'L1', kg_tomados: '200', kg_devueltos: '' }]
    const s: SalidaForm[] = [{ producto_id: 5, rol: 'principal', kg: '10', precio_credito: '', conserva_proveedor: true }]
    expect(validarProceso(calcularBalance(e, s, lotes), e, s, lotes, true)).toMatch(/disponibles/)
    expect(validarProceso(calcularBalance(e, s, lotes), e, s, lotes, false)).toBeNull()
  })
})
