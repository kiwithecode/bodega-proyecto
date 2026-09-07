import * as XLSX from 'xlsx'
export interface Hoja { nombre: string; filas: Record<string, unknown>[] }
export function exportarExcel(hojas: Hoja[], nombreArchivo: string) {
  const wb = XLSX.utils.book_new()
  hojas.forEach((h) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h.filas), h.nombre.slice(0, 31)))
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
