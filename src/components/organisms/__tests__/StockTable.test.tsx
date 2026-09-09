import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StockTable } from '../StockTable'
import type { StockSemaforo } from '../../../lib/types'

const base: StockSemaforo = { producto_id: 1, codigo: 'AR', producto: 'Pulpa res', especie: 'Res', rol_defecto: 'principal', kg_disponible: 34.9, lotes: 2, lote_mas_antiguo: null,
  dias_lote_mas_antiguo: 7, ultimo_ingreso: null, costo_kg_prom: 7, valor_stock: 244.3, kg_minimo: 50, kg_ideal: null, kg_por_dia: 4.98, dias_cobertura: 7, semaforo: 'BAJO' }
const filas: StockSemaforo[] = [
  { ...base, producto_id: 3, codigo: 'DR', producto: 'Lomo fino', semaforo: 'OK' },
  base,
  { ...base, producto_id: 2, codigo: 'CR', producto: 'Lomo falda', kg_disponible: 0, lotes: 0, semaforo: 'SIN STOCK' },
]
describe('StockTable', () => {
  it('ordena SIN STOCK → BAJO → ALTO → OK', () => {
    render(<StockTable filas={[...filas, { ...base, producto_id: 4, codigo: 'ER', producto: 'Industrial', kg_disponible: 900, kg_ideal: 500, semaforo: 'ALTO' }]} />)
    const celdas = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent)
    expect(celdas[0]).toContain('Lomo falda'); expect(celdas[1]).toContain('Pulpa res'); expect(celdas[2]).toContain('Industrial'); expect(celdas[3]).toContain('Lomo fino')
  })
  it('el medidor lleva el estado y llena hasta el ideal', () => {
    render(<StockTable filas={[{ ...base, kg_disponible: 25, kg_ideal: 100, semaforo: 'BAJO' }]} />)
    const m = screen.getByRole('img', { name: /25,00 kg, BAJO/ })
    expect(m.className).toMatch(/aviso/)
    expect((m.firstChild as HTMLElement).style.width).toBe('25%')
  })
  it('muestra el semáforo como badge', () => { render(<StockTable filas={filas} />); expect(screen.getByText('SIN STOCK')).toBeInTheDocument() })
  it('mínimo e ideal editables solo cuando se pasa onNivel', async () => {
    const u = userEvent.setup(); const cb = vi.fn()
    const { rerender } = render(<StockTable filas={[base]} />)
    expect(screen.queryByLabelText('Mínimo Pulpa res')).toBeNull()
    rerender(<StockTable filas={[base]} onNivel={cb} />)
    expect(screen.getByLabelText('Mínimo Pulpa res')).toHaveValue(50)
    await u.type(screen.getByLabelText('Ideal Pulpa res'), '120'); await u.tab()
    expect(cb).toHaveBeenCalledWith(base, 'kg_ideal', 120)
  })
  it('botón "Ver lotes" solo con onVerLotes, y avisa qué producto se eligió', async () => {
    const u = userEvent.setup(); const cb = vi.fn()
    const { rerender } = render(<StockTable filas={filas} />)
    expect(screen.queryByRole('button', { name: /Ver lotes de/ })).toBeNull()
    rerender(<StockTable filas={filas} onVerLotes={cb} />)
    await u.click(screen.getByRole('button', { name: 'Ver lotes de Pulpa res' }))
    expect(cb).toHaveBeenCalledWith(base)
    expect(screen.getByRole('button', { name: 'Ver lotes de Lomo falda' })).toBeDisabled() // sin stock → sin lotes que abrir
  })
})
