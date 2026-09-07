import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '../atoms'
import { DataTable, type Columna } from './DataTable'
import { marcasEje, marcasEjeRango } from '../../lib/series'
import s from './Grafica.module.css'

/** Una serie de una gráfica de líneas. `null` = sin dato ese día (la línea se corta). */
export interface Serie { nombre: string; valores: (number | null)[]; color: string }
type Fmt = (v: number) => string

/** Marco de toda gráfica: título, subtítulo, botón "Tabla" (la versión accesible de la misma información). */
export function Figura({ titulo, sub, tabla, acciones, children }: { titulo: string; sub?: ReactNode; tabla?: ReactNode; acciones?: ReactNode; children: ReactNode }) {
  const [verTabla, setVerTabla] = useState(false)
  return (
    <figure className={s.figura} style={{ margin: 0 }}>
      <figcaption className={s.cab}>
        <h3>{titulo}</h3>{sub && <span className={s.sub}>{sub}</span>}
        <span className={s.der}>{acciones}{tabla && <Button tamano="chico" variante="texto" onClick={() => setVerTabla((v) => !v)} aria-pressed={verTabla}>{verTabla ? 'Gráfica' : 'Tabla'}</Button>}</span>
      </figcaption>
      {verTabla && tabla ? tabla : children}
    </figure>
  )
}

const useAncho = <T extends HTMLElement>() => {
  const ref = useRef<T>(null); const [ancho, setAncho] = useState(600)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, e.contentRect.width)))
    ro.observe(el); setAncho(Math.max(240, el.clientWidth || 600))
    return () => ro.disconnect()
  }, [])
  return { ref, ancho }
}

/**
 * Líneas sobre un eje X de categorías (días, semanas) y UN eje Y compartido.
 * Hover/teclado: una guía vertical y un tooltip con todas las series en ese X.
 */
/** `eje='auto'` acota el eje Y al rango de los datos (tendencias de precio); por defecto arranca en 0. */
export function GraficaLineas({ etiquetas, series, formato, alto = 200, marcadores, eje = 'cero' }: { etiquetas: string[]; series: Serie[]; formato: Fmt; alto?: number; marcadores?: boolean; eje?: 'cero' | 'auto' }) {
  const { ref, ancho } = useAncho<HTMLDivElement>()
  const [sel, setSel] = useState<number | null>(null)
  const id = useId()
  const n = etiquetas.length
  const m = { izq: 46, der: 56, arr: 10, aba: 24 }
  const w = ancho, h = alto, pw = w - m.izq - m.der, ph = h - m.arr - m.aba
  const todos = series.flatMap((se) => se.valores.filter((v): v is number => v != null))
  const max = Math.max(0, ...todos), min = eje === 'auto' && todos.length ? Math.min(...todos) : 0
  const marcas = useMemo(() => eje === 'auto' ? marcasEjeRango(min, max) : marcasEje(max), [eje, min, max])
  const yMin = marcas[0], yMax = marcas[marcas.length - 1] || 1
  const x = (i: number) => m.izq + (n <= 1 ? pw / 2 : (i * pw) / (n - 1))
  const y = (v: number) => m.arr + ph - ((v - yMin) / (yMax - yMin || 1)) * ph
  const conDatos = series.some((se) => se.valores.some((v) => v != null))
  const puntos = marcadores ?? n <= 31
  const pasoEtiqueta = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 56))))

  const trazo = (vals: (number | null)[]) => {
    let d = ''; let abierto = false
    vals.forEach((v, i) => { if (v == null) { abierto = false; return } d += `${abierto ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; abierto = true })
    return d
  }
  const ultimo = (vals: (number | null)[]) => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i; return -1 }
  const indicePorX = (px: number) => Math.min(n - 1, Math.max(0, Math.round(((px - m.izq) / pw) * (n - 1))))

  if (!conDatos) return <div className={s.vacio}>Sin datos en el período.</div>
  return (
    <>
      {series.length >= 2 && <div className={s.leyenda} aria-hidden>{series.map((se) => <span key={se.nombre}><i className={s.clave} style={{ borderColor: se.color }} />{se.nombre}</span>)}</div>}
      <div className={s.lienzo} ref={ref}>
        <svg className={s.svg} viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-labelledby={id}>
          <title id={id}>{series.map((se) => se.nombre).join(' y ')}</title>
          {marcas.map((v) => <g key={v}><line className={s.grid} x1={m.izq} x2={w - m.der} y1={y(v)} y2={y(v)} /><text className={s.tick} x={m.izq - 6} y={y(v) + 4} textAnchor="end">{formato(v)}</text></g>)}
          <line className={s.eje} x1={m.izq} x2={w - m.der} y1={y(yMin)} y2={y(yMin)} />
          {etiquetas.map((e, i) => (i % pasoEtiqueta === 0 || i === n - 1) && <text key={e} className={s.tick} x={x(i)} y={h - 6} textAnchor="middle">{e}</text>)}
          {sel != null && <line className={s.cruz} x1={x(sel)} x2={x(sel)} y1={m.arr} y2={m.arr + ph} />}
          {series.map((se) => <path key={se.nombre} className={s.linea} d={trazo(se.valores)} stroke={se.color} />)}
          {series.map((se) => se.valores.map((v, i) => v != null && (puntos || i === sel) && <circle key={`${se.nombre}${i}`} className={s.punto} cx={x(i)} cy={y(v)} r={i === sel ? 5 : 3.5} fill={se.color} />))}
          {series.map((se) => { const i = ultimo(se.valores); return i >= 0 && <text key={se.nombre} className={s.etiquetaFin} x={x(i) + 8} y={y(se.valores[i] as number) + 4}>{formato(se.valores[i] as number)}</text> })}
          <rect className={s.zona} x={m.izq - 12} y={0} width={pw + 24} height={h} tabIndex={0} aria-label="Explorar valores con las flechas"
            onPointerMove={(e) => { const r = (e.currentTarget as SVGRectElement).getBoundingClientRect(); setSel(indicePorX(((e.clientX - r.left) / r.width) * (pw + 24) + m.izq - 12)) }}
            onPointerLeave={() => setSel(null)} onBlur={() => setSel(null)}
            onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); setSel((v) => Math.min(n - 1, (v ?? -1) + 1)) } if (e.key === 'ArrowLeft') { e.preventDefault(); setSel((v) => Math.max(0, (v ?? n) - 1)) } }} />
        </svg>
        {sel != null && <div className={s.tip} role="status" style={{ left: `${Math.min(92, Math.max(8, (x(sel) / w) * 100))}%`, top: 0, transform: `translate(${x(sel) > w * 0.6 ? '-105%' : '6px'}, 0)` }}>
          <div className={s.t}>{etiquetas[sel]}</div>
          {series.map((se) => <div key={se.nombre}><span><i className={s.clave} style={{ borderColor: se.color, display: 'inline-block', marginRight: 6 }} />{se.nombre}</span><b>{se.valores[sel] == null ? '—' : formato(se.valores[sel] as number)}</b></div>)}
        </div>}
      </div>
    </>
  )
}

/** Tabla equivalente de una gráfica de líneas (para el botón "Tabla"). */
export function TablaSeries({ etiquetas, series, formato, tituloX = 'Fecha' }: { etiquetas: string[]; series: Serie[]; formato: Fmt; tituloX?: string }) {
  type Fila = { i: number }
  const columnas: Columna<Fila>[] = [
    { key: 'x', titulo: tituloX, render: (f) => etiquetas[f.i] },
    ...series.map((se, k): Columna<Fila> => ({ key: `s${k}`, titulo: se.nombre, n: true, render: (f) => se.valores[f.i] == null ? '—' : formato(se.valores[f.i] as number) })),
  ]
  return <DataTable<Fila> filas={etiquetas.map((_, i) => ({ i }))} filaKey={(f) => f.i} columnas={columnas} maxAltura={260} />
}

/** Barras horizontales para comparar magnitudes entre pocas categorías (una sola serie → un solo color). */
export function GraficaBarras({ filas, formato, color = 'var(--serie-1)', detalle }: { filas: { etiqueta: string; valor: number; detalle?: string }[]; formato: Fmt; color?: string; detalle?: boolean }) {
  const max = Math.max(0, ...filas.map((f) => f.valor))
  if (filas.length === 0) return <div className={s.vacio}>Sin datos en el período.</div>
  return (
    <div className={s.barras} role="list">
      {filas.map((f) => (
        <div key={f.etiqueta} role="listitem" style={{ display: 'contents' }}>
          <div className={s.barraEt} title={f.etiqueta}>{f.etiqueta}</div>
          <div className={s.pista} title={`${f.etiqueta}: ${formato(f.valor)}${f.detalle ? ` · ${f.detalle}` : ''}`}>
            <div className={s.barra} style={{ width: `${max > 0 ? Math.max(0.5, (f.valor / max) * 100) : 0}%`, background: color }} />
          </div>
          <div className={s.barraVal}>{formato(f.valor)}{detalle && f.detalle && <span className={s.barraSub}>{f.detalle}</span>}</div>
        </div>
      ))}
    </div>
  )
}
