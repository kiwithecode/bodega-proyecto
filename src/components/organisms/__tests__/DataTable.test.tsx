import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable } from '../DataTable'

const filas = [{ id: 1, nombre: 'A', kg: 10 }, { id: 2, nombre: 'B', kg: 20 }]
describe('DataTable', () => {
  it('renderiza encabezados, filas y total', () => {
    render(<DataTable filas={filas} columnas={[{ key: 'nombre', titulo: 'Nombre' }, { key: 'kg', titulo: 'kg', n: true }]} total={['Total', '30']} />)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Nombre', 'kg'])
    expect(screen.getAllByRole('row')).toHaveLength(4) // cabecera + 2 + total
    expect(screen.getByText('30')).toBeInTheDocument()
  })
  it('render personalizado y clic en fila', async () => {
    const u = userEvent.setup(); const cb = vi.fn()
    render(<DataTable filas={filas} onFila={cb} columnas={[{ key: 'x', titulo: 'X', render: (f) => <b>{f.nombre}!</b> }]} />)
    await u.click(screen.getByText('B!')); expect(cb).toHaveBeenCalledWith(filas[1])
  })
  it('mensaje de vacío', () => {
    render(<DataTable filas={[]} columnas={[{ key: 'a', titulo: 'A' }]} vacio="Nada aquí" />)
    expect(within(screen.getByRole('table')).getByText('Nada aquí')).toBeInTheDocument()
  })
})
