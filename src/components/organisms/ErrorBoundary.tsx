import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Notice } from '../atoms'
import { logError } from '../../services/logs'
/** Atrapa errores de render, los registra y ofrece recargar en vez de dejar la pantalla en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { void logError('render', error, { componente: info.componentStack?.slice(0, 1500) }) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 24 }}>
        <Notice tipo="error">Algo falló al mostrar esta pantalla y quedó registrado en Actividad. Detalle: {this.state.error.message}</Notice>
        <Button onClick={() => window.location.reload()}>Recargar</Button>
      </div>
    )
  }
}
