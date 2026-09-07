import { Link } from 'react-router-dom'
import { AlertItem } from '../molecules'
import { Button } from '../atoms'
import type { Alerta } from '../../lib/types'
import s from './DataTable.module.css'
export function AlertList({ alertas }: { alertas: Alerta[] }) {
  if (!alertas.length) return <div className={s.vacio}>Todo en orden. No hay nada que revisar.</div>
  return <>{alertas.map((a, i) => (
    <AlertItem key={i} nivel={a.nivel} mensaje={a.mensaje} tipo={a.tipo} referencia={a.referencia && a.referencia.length < 20 ? a.referencia : null}
      accion={a.tipo === 'PROCESO SIN CERRAR' ? <Link to={`/procesar?id=${a.proceso_id}`}><Button tamano="chico" variante="secundario">Abrir</Button></Link>
             : a.lote_id ? <Link to={`/lotes?q=${a.referencia}`}><Button tamano="chico" variante="secundario">Ver lote</Button></Link> : null} />
  ))}</>
}
