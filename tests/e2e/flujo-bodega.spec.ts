import { test, expect } from '@playwright/test'
/**
 * Flujo completo de la encargada: entrar → recibir → procesar → ver stock.
 * Requiere un proyecto de Supabase DE PRUEBAS con 01–05 cargados y un usuario.
 *   E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
 */
const email = process.env.E2E_EMAIL ?? '', password = process.env.E2E_PASSWORD ?? ''
test.skip(!email || !password, 'Define E2E_EMAIL y E2E_PASSWORD')

const hoy = new Date(); const dd = String(hoy.getDate()).padStart(2, '0'), mm = String(hoy.getMonth() + 1).padStart(2, '0'), yy = String(hoy.getFullYear()).slice(2)
const lote = `131AR${dd}${mm}${yy}`

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Correo').fill(email); await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible()
})

test('recibir pulpa res y ver el lote en stock', async ({ page }) => {
  await page.getByRole('link', { name: 'Recibir' }).click()
  await page.getByLabel('Proveedor').fill('maigua'); await page.getByRole('option').first().click()
  await page.getByLabel('Producto fila 1').fill('pulpa res'); await page.getByRole('option').first().click()
  await page.getByLabel('Peso fila 1').fill('116.5'); await page.getByLabel('Precio fila 1').fill('6.6')
  await expect(page.getByText(lote)).toBeVisible()          // el código se muestra antes de guardar
  await page.getByRole('button', { name: 'Guardar recepción' }).click()
  await expect(page.getByRole('status')).toContainText('Recepción guardada')
  await page.getByRole('link', { name: 'Stock' }).click()
  await page.getByRole('tab', { name: /Por lote/ }).click()
  await expect(page.getByText(lote)).toBeVisible()
})

test('procesar el lote: el cuadre y el costo se calculan en vivo', async ({ page }) => {
  await page.getByRole('link', { name: 'Procesar' }).click()
  await page.getByLabel('Lote fila 1').fill(lote); await page.getByRole('option').first().click()
  await page.getByLabel('kg tomados fila 1').fill('116.5')
  await expect(page.getByTestId('cuadre-estado')).toContainText('Faltan 116,50')
  await page.getByLabel('Salida fila 1').fill('pulpa res limpia'); await page.getByRole('option').first().click()
  await page.getByLabel('kg salida fila 1').fill('98.4')
  await page.getByLabel('Salida fila 2').fill('industrial res'); await page.getByRole('option').first().click()
  await page.getByLabel('kg salida fila 2').fill('12.75'); await page.getByLabel('precio crédito fila 2').fill('3.66')
  await page.getByLabel('Salida fila 3').fill('venas'); await page.getByRole('option').first().click()
  await page.getByLabel('kg salida fila 3').fill('5.35')
  await expect(page.getByTestId('cuadre-estado')).toContainText('Cuadra')
  await page.getByRole('button', { name: 'Cerrar proceso' }).click()
  await expect(page.getByRole('status')).toContainText('Proceso cerrado')
})

test('un error de la base queda en Actividad', async ({ page }) => {
  await page.getByRole('link', { name: 'Actividad' }).click()
  await page.getByRole('tab', { name: /Errores/ }).click()
  await page.getByRole('button', { name: 'Enviar log de prueba' }).click()
  await expect(page.getByText('Log de prueba desde Actividad').first()).toBeVisible()
})
