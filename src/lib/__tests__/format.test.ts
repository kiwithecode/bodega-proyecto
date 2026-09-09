import { describe, it, expect } from 'vitest'
import { duracion, hora, codigoLote, num, fmt, destinoSugerido, etiquetaDestino } from '../format'

describe('codigoLote', () => {
  it('arma <proveedor><producto><ddmmyy>', () => {
    expect(codigoLote(131, 'AR', '2026-05-04')).toBe('131AR040526')
  })
  it('sin proveedor (lote mezcla) omite el prefijo', () => {
    expect(codigoLote(null, 'EMC', '2026-02-03')).toBe('EMC030226')
  })
  it('devuelve vacío si falta producto o fecha', () => {
    expect(codigoLote(131, null, '2026-05-04')).toBe('')
    expect(codigoLote(131, 'AR', '')).toBe('')
    expect(codigoLote(131, 'AR', '2026-5-4')).toBe('')
  })
})

describe('num', () => {
  it('acepta coma decimal, como se digita en Ecuador', () => { expect(num('116,5')).toBe(116.5) })
  it('vacío o basura es 0, nunca NaN', () => { expect(num('')).toBe(0); expect(num('abc')).toBe(0); expect(num(null)).toBe(0) })
  it('respeta números ya numéricos', () => { expect(num(7.25)).toBe(7.25) })
})

describe('fmt', () => {
  it('kg con 2 a 3 decimales', () => { expect(fmt.kg(116.5)).toMatch(/116,50?0?/) })
  it('usd con símbolo', () => { expect(fmt.usd(768.9)).toMatch(/^\$768,90$/) })
  it('nulos no rompen', () => { expect(fmt.kg(null)).toBe(''); expect(fmt.pct(undefined)).toBe('') })
  it('fecha corta no se corre un día por zona horaria', () => { expect(fmt.fecha('2026-05-04')).toMatch(/4\/5\/2026|04\/05\/2026/) })
  it('hora y duración del proceso', () => {
    expect(hora('08:10:00')).toBe('08:10'); expect(hora(null)).toBe('')
    expect(duracion('08:10', '11:45')).toBe('3 h 35 min'); expect(duracion('08:00', '10:00')).toBe('2 h'); expect(duracion('08:00', '08:40')).toBe('40 min')
    expect(duracion('22:30', '01:15')).toBe('2 h 45 min') // pasó la medianoche
    expect(duracion('08:00', '')).toBe('')
  })
  it('destino sugerido por producto', () => {
    expect(destinoSugerido('Industrial res (corriente)', 'subproducto')).toBe('moler')
    expect(destinoSugerido('Goulash especial', 'subproducto')).toBe('cortar')
    expect(destinoSugerido('Pulpa res limpia', 'principal')).toBe('stock')
    expect(etiquetaDestino('moler')).toBe('Para moler'); expect(etiquetaDestino(null)).toBe('Stock')
  })
})
