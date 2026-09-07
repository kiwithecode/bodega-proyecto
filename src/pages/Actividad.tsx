import { useState } from 'react'
import { Ayuda, Badge, Button, Input, Mono, Notice, Select, type Tono } from '../components/atoms'
import { Tabs } from '../components/molecules'
import { DataTable, KpiGrid, Panel } from '../components/organisms'
import { PageTemplate } from '../components/templates'
import { useAsync } from '../hooks/useAsync'
import { useDebounce } from '../hooks/useDebounce'
import { fmt } from '../lib/format'
import type { Auditoria, LogApp, LogResumen, NivelLog } from '../lib/types'
import * as srv from '../services/logs'

const tonoOp: Record<Auditoria['accion'], Tono> = { creó: 'ok', modificó: 'info', borró: 'critico' }
const tonoNivel: Record<NivelLog, Tono> = { error: 'critico', warn: 'aviso', info: 'neutro' }
type Tab = 'auditoria' | 'errores'

export default function Actividad() {
  const [tab, setTab] = useState<Tab>('auditoria')
  const resumen = useAsync<LogResumen[]>(srv.getLogsResumen, [], [])
  const r = (n: NivelLog) => resumen.data.find((x) => x.nivel === n)
  return (
    <PageTemplate titulo="Actividad" subtitulo="Qué se cambió en los datos y qué ha fallado en la aplicación.">
      <Notice tipo="error">{resumen.error}</Notice>
      <KpiGrid items={[
        { valor: r('error')?.ultimas_24h ?? 0, etiqueta: 'Errores últimas 24 h' },
        { valor: r('error')?.ultimos_7d ?? 0, etiqueta: 'Errores últimos 7 días' },
        { valor: r('warn')?.ultimos_7d ?? 0, etiqueta: 'Avisos últimos 7 días' },
        { valor: r('error')?.ultimo ? fmt.hora(r('error')!.ultimo) : 'ninguno', etiqueta: 'Último error' },
      ]} />
      <Panel style={{ marginTop: 18 }}>
        <Tabs<Tab> activo={tab} onChange={setTab} items={[{ id: 'auditoria', label: 'Cambios en los datos' }, { id: 'errores', label: 'Errores de la aplicación' }]} />
        {tab === 'auditoria' ? <AuditoriaTab /> : <ErroresTab />}
      </Panel>
    </PageTemplate>
  )
}

function AuditoriaTab() {
  const [texto, setTexto] = useState(''); const [tabla, setTabla] = useState('')
  const textoD = useDebounce(texto, 300)
  const q = useAsync<Auditoria[]>(() => srv.getAuditoria({ texto: textoD, tabla: tabla || undefined }), [textoD, tabla], [])
  const [abierto, setAbierto] = useState<Auditoria | null>(null)
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input placeholder="Buscar por lote, nombre, usuario…" value={texto} onChange={(e) => setTexto(e.target.value)} style={{ width: 320 }} />
        <Select value={tabla} onChange={(e) => setTabla(e.target.value)} style={{ width: 220 }} opciones={[
          { value: '', label: 'Todo' }, { value: 'recepcion_detalle', label: 'Jabas recibidas' }, { value: 'recepciones', label: 'Recepciones' },
          { value: 'procesos', label: 'Procesos' }, { value: 'proceso_salidas', label: 'Salidas de proceso' }, { value: 'productos', label: 'Productos' },
          { value: 'proveedores', label: 'Proveedores' }, { value: 'stock_minimos', label: 'Mínimos de stock' }, { value: 'parametros', label: 'Parámetros' }]} />
        <Button onClick={() => void q.recargar()}>Actualizar</Button>
      </div>
      <Notice tipo="error">{q.error}</Notice>
      <DataTable<Auditoria> filas={q.data} onFila={(a) => setAbierto(abierto?.id === a.id ? null : a)} seleccionada={(a) => a.id === abierto?.id} vacio="Sin movimientos." columnas={[
        { key: 'ts', titulo: 'Cuándo', render: (a) => fmt.hora(a.ts) },
        { key: 'usuario', titulo: 'Quién' },
        { key: 'accion', titulo: 'Acción', render: (a) => <Badge tono={tonoOp[a.accion]}>{a.accion}</Badge> },
        { key: 'entidad', titulo: 'Qué' },
        { key: 'referencia', titulo: 'Referencia', render: (a) => <Mono>{a.referencia}</Mono> },
        { key: 'resumen', titulo: 'Detalle', render: (a) => a.resumen ?? (a.accion === 'borró' ? 'fila eliminada' : 'fila nueva') },
      ]} />
      {abierto && <pre className="json">{JSON.stringify(abierto.cambios ?? abierto.despues ?? abierto.antes, null, 2)}</pre>}
      <Ayuda>Toca una fila para ver el cambio completo. Los recálculos automáticos de costo aparecen a nombre de quien hizo la edición que los disparó.</Ayuda>
    </>
  )
}

function ErroresTab() {
  const [nivel, setNivel] = useState<'' | NivelLog>('')
  const q = useAsync<LogApp[]>(() => srv.getLogs({ nivel: nivel || undefined }), [nivel], [])
  const [abierto, setAbierto] = useState<LogApp | null>(null)
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Select value={nivel} onChange={(e) => setNivel(e.target.value as '' | NivelLog)} style={{ width: 180 }} opciones={[{ value: '', label: 'Todos' }, { value: 'error', label: 'Errores' }, { value: 'warn', label: 'Avisos' }, { value: 'info', label: 'Info' }]} />
        <Button onClick={() => void q.recargar()}>Actualizar</Button>
        <Button onClick={() => srv.log('info', 'prueba', 'Log de prueba desde Actividad').then(() => q.recargar())}>Enviar log de prueba</Button>
      </div>
      <Notice tipo="error">{q.error}</Notice>
      <DataTable<LogApp> filas={q.data} onFila={(l) => setAbierto(abierto?.id === l.id ? null : l)} seleccionada={(l) => l.id === abierto?.id} vacio="Ningún error registrado. Buena señal." columnas={[
        { key: 'ts', titulo: 'Cuándo', render: (l) => fmt.hora(l.ts) },
        { key: 'nivel', titulo: 'Nivel', render: (l) => <Badge tono={tonoNivel[l.nivel]}>{l.nivel}</Badge> },
        { key: 'origen', titulo: 'Origen' },
        { key: 'mensaje', titulo: 'Mensaje' },
        { key: 'url', titulo: 'Pantalla', render: (l) => <Mono>{l.url}</Mono> },
        { key: 'usuario', titulo: 'Usuario' },
      ]} />
      {abierto && <pre className="json">{JSON.stringify({ detalle: abierto.detalle, agente: abierto.agente }, null, 2)}</pre>}
      <Ayuda>Se registran solos: errores de JavaScript, promesas rechazadas, fallos de render y toda respuesta de error de la base. Origen "supabase" suele ser permisos (RLS) o un nombre de columna; "navegador" o "render" es un bug de la interfaz.</Ayuda>
    </>
  )
}
