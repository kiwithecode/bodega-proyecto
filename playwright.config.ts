import { defineConfig } from '@playwright/test'
// Corre contra la app en local y un proyecto de Supabase DE PRUEBAS (nunca el de producción).
// Variables: E2E_EMAIL, E2E_PASSWORD  (usuario creado en Authentication del proyecto de pruebas)
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173', headless: true },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
})
