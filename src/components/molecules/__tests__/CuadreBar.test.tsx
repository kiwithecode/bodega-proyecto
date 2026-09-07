import { render, screen } from '@testing-library/react'
import { CuadreBar } from '../CuadreBar'

describe('CuadreBar', () => {
  it('sin entrada', () => { render(<CuadreBar consumo={0} principal={0} subproducto={0} merma={0} />); expect(screen.getByTestId('cuadre-estado')).toHaveTextContent('Sin entrada') })
  it('faltan kilos por repartir', () => { render(<CuadreBar consumo={100} principal={80} subproducto={10} merma={5} />); expect(screen.getByTestId('cuadre-estado')).toHaveTextContent(/Faltan 5,00/) })
  it('cuadra', () => { render(<CuadreBar consumo={100} principal={80} subproducto={15} merma={5} />); expect(screen.getByTestId('cuadre-estado')).toHaveTextContent('Cuadra') })
  it('sobran kilos: aviso en rojo', () => {
    render(<CuadreBar consumo={100} principal={90} subproducto={15} merma={0} />)
    const e = screen.getByTestId('cuadre-estado'); expect(e).toHaveTextContent(/Sobran 5,00/); expect(e.className).toMatch(/mal/)
  })
})
