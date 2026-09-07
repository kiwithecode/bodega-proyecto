import { describe, it, expect } from 'vitest'
import { diasEntre, rellenarDias, pasoBonito, marcasEje, marcasEjeRango, topN, sumarPor, diaCorto } from '../series'

describe('diasEntre / rellenarDias', () => {
  it('incluye ambos extremos y cruza el mes', () => {
    expect(diasEntre('2026-04-29', '2026-05-02')).toEqual(['2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02'])
  })
  it('rango invertido o inválido → vacío', () => {
    expect(diasEntre('2026-05-02', '2026-05-01')).toEqual([])
    expect(diasEntre('x', '2026-05-01')).toEqual([])
  })
  it('rellena los días sin dato para que la línea no salte fechas', () => {
    const filas = [{ fecha: '2026-05-02', kg: 10 }]
    expect(rellenarDias('2026-05-01', '2026-05-03', filas, { kg: 0 })).toEqual([
      { fecha: '2026-05-01', kg: 0 }, { fecha: '2026-05-02', kg: 10 }, { fecha: '2026-05-03', kg: 0 },
    ])
  })
})

describe('eje Y con números redondos', () => {
  it('pasoBonito elige 1, 2, 5 × 10^n', () => {
    expect(pasoBonito(100)).toBe(50) // 100/4 = 25 → f=2.5 → 5×10
    expect(pasoBonito(7)).toBe(2)
    expect(pasoBonito(0.35)).toBe(0.1)
    expect(pasoBonito(0)).toBe(1)
  })
  it('marcasEje arranca en 0 y cubre el máximo', () => {
    expect(marcasEje(93)).toEqual([0, 50, 100])
    expect(marcasEje(7)).toEqual([0, 2, 4, 6, 8])
    expect(marcasEje(0)).toEqual([0, 1])
  })
  it('marcasEjeRango no arranca en 0: encierra el mínimo y el máximo con paso bonito', () => {
    expect(marcasEjeRango(6.6, 7.5)).toEqual([6.5, 7, 7.5]) // rango 0.9 → paso 0.5, piso y techo redondos
    expect(marcasEjeRango(5, 5)).toEqual([0, 2, 4, 6]) // sin rango → desde 0
  })
})

describe('topN / sumarPor', () => {
  const compras = [
    { prov: 'Maigua', usd: 500 }, { prov: 'Sánchez', usd: 300 }, { prov: 'Ruiz', usd: 100 }, { prov: 'Ruiz', usd: 50 }, { prov: 'López', usd: 20 },
  ]
  it('sumarPor agrupa', () => {
    expect(sumarPor(compras, (c) => c.prov, (c) => c.usd).find((x) => x.clave === 'Ruiz')?.valor).toBe(150)
  })
  it('topN ordena y junta el resto en Otros con el conteo', () => {
    const agr = sumarPor(compras, (c) => c.prov, (c) => c.usd)
    expect(topN(agr, 2, (a) => a.valor, (a) => a.clave)).toEqual([
      { etiqueta: 'Maigua', valor: 500 }, { etiqueta: 'Sánchez', valor: 300 }, { etiqueta: 'Otros (2)', valor: 170 },
    ])
  })
  it('topN sin resto no agrega Otros', () => {
    expect(topN([{ a: 1 }], 3, (x) => x.a, () => 'a')).toEqual([{ etiqueta: 'a', valor: 1 }])
  })
  it('diaCorto', () => { expect(diaCorto('2026-05-04')).toBe('04/05') })
})
