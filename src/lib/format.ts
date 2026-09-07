type N = number | string | null | undefined
const es = (v: number, min: number, max: number) => v.toLocaleString('es-EC', { minimumFractionDigits: min, maximumFractionDigits: max })
const toNum = (v: N): number | null => (v == null || v === '' ? null : Number(v))

export const fmt = {
  kg:    (v: N) => { const x = toNum(v); return x == null || isNaN(x) ? '' : es(x, 2, 3) },
  usd:   (v: N) => { const x = toNum(v); return x == null || isNaN(x) ? '' : '$' + es(x, 2, 2) },
  usd4:  (v: N) => { const x = toNum(v); return x == null || isNaN(x) ? '' : '$' + es(x, 4, 4) },
  pct:   (v: N) => { const x = toNum(v); return x == null || isNaN(x) ? '' : es(x, 0, 1) + ' %' },
  fecha: (v: string | null | undefined) => (v ? new Date(v.length === 10 ? v + 'T00:00:00' : v).toLocaleDateString('es-EC') : ''),
  hora:  (v: string | null | undefined) => (v ? new Date(v).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''),
}
export const hoy = () => new Date().toISOString().slice(0, 10)
export const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
/** Texto digitado → número. Acepta coma decimal. Vacío o basura → 0. */
export const num = (v: N) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(x) ? 0 : x }
/** Código de lote como lo arma la base: <proveedor><producto><ddmmyy> */
export const codigoLote = (provCodigo: number | string | null | undefined, prodCodigo: string | null | undefined, fecha: string | null | undefined) => {
  if (!prodCodigo || !fecha || fecha.length !== 10) return ''
  const [y, m, d] = fecha.split('-'); return `${provCodigo ?? ''}${prodCodigo}${d}${m}${y.slice(2)}`
}
