import { useCallback, useEffect, useState, type DependencyList } from 'react'
/** Ejecuta una promesa y expone { data, error, cargando, recargar, setData } */
export function useAsync<T>(fn: () => PromiseLike<T>, deps: DependencyList, inicial: T) {
  const [data, setData] = useState<T>(inicial)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recargar = useCallback(() => {
    setCargando(true); setError('')
    return Promise.resolve(fn()).then(setData).catch((e: Error) => setError(e.message)).finally(() => setCargando(false))
  }, deps)
  useEffect(() => { void recargar() }, [recargar])
  return { data, error, cargando, recargar, setData }
}
