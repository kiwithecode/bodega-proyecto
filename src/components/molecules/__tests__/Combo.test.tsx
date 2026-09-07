import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Combo } from '../Combo'

const ops = [{ id: 1, nombre: 'Pulpa res', codigo: 'AR' }, { id: 2, nombre: 'Lomo falda', codigo: 'CR' }, { id: 3, nombre: 'Lomo fino', codigo: 'DR' }]
function Harness({ onChange }: { onChange?: (v: number | null) => void }) {
  const [v, setV] = useState<number | null>(null)
  return <><Combo opciones={ops} value={v} onChange={(x) => { setV(x); onChange?.(x) }} clave={(o) => o.id} mostrar={(o) => o.nombre} extra={(o) => o.codigo} aria-label="Producto" /><output>{v ?? 'ninguno'}</output></>
}

describe('Combo', () => {
  it('filtra por nombre y por código', async () => {
    const u = userEvent.setup(); render(<Harness />)
    await u.type(screen.getByLabelText('Producto'), 'lomo')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    await u.clear(screen.getByLabelText('Producto')); await u.type(screen.getByLabelText('Producto'), 'AR')
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })
  it('elige con teclado (flecha abajo + Enter) y muestra el nombre', async () => {
    const u = userEvent.setup(); const cb = vi.fn(); render(<Harness onChange={cb} />)
    await u.type(screen.getByLabelText('Producto'), 'lomo{ArrowDown}{Enter}')
    expect(cb).toHaveBeenLastCalledWith(3)
    expect(screen.getByLabelText('Producto')).toHaveValue('Lomo fino')
    expect(screen.getByRole('status', { hidden: true }) ?? screen.getByText('3')).toBeTruthy()
  })
  it('sin coincidencias', async () => {
    const u = userEvent.setup(); render(<Harness />)
    await u.type(screen.getByLabelText('Producto'), 'zzz')
    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument()
  })
  it('borrar el texto limpia la selección', async () => {
    const u = userEvent.setup(); const cb = vi.fn(); render(<Harness onChange={cb} />)
    await u.type(screen.getByLabelText('Producto'), 'pulpa{ArrowDown}{Enter}')
    await u.clear(screen.getByLabelText('Producto'))
    expect(cb).toHaveBeenLastCalledWith(null)
  })
})
