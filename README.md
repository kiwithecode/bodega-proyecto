# Bodega de producción · frontend

React 18 + TypeScript + Vite + Supabase. Atomic Design, capa de servicios, CSS Modules. Tests en tres capas.

## Correr
```bash
npm install
cp .env.example .env        # VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (Supabase → Settings → API)
npm run dev                  # http://localhost:5173
```
Usuario: Supabase → Authentication → Users → Add user (Auto Confirm).

## Tests
| Comando | Qué prueba | Necesita |
|---|---|---|
| `npm test` | 41 pruebas: matemática del cuadre (idéntica a `fn_procesar`), formato y código de lote, Combo (búsqueda y teclado), DataTable, StockTable, CuadreBar, servicio de recepción con Supabase simulado, registro automático de errores | nada |
| `06_tests_pgtap.sql` en el SQL Editor | 29 pruebas del motor de costo, lotes, cascada, protecciones y auditoría. Se revierte solo, no deja datos | Supabase con 01–05 cargados |
| `E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e` | Flujo completo de la encargada en navegador real: login → recibir → procesar → stock → Actividad | Un proyecto de Supabase **de pruebas** (crea datos) y `npx playwright install chromium` la primera vez |

`npm run typecheck` pasa con `strict`.

## Estructura
```
src/
  lib/          supabase.ts (cliente + ok(): todo error de la base se registra en logs_app), format.ts, cuadre.ts (balance puro), types.ts
  services/     acceso a datos, una función por operación; las páginas NUNCA importan supabase directo
  hooks/        useAuth, useAsync, useDebounce
  components/
    atoms/      Button, Input, Select, Checkbox, Badge, Notice, Mono/Ayuda/Sub
    molecules/  Field, Combo, Kpi, Tabs, Chips, AlertItem, CuadreBar, SimilarList
    organisms/  DataTable, Sidebar, Panel, KpiGrid, AlertList, StockTable, RecepcionLineas, ProcesoEntradas,
                ProcesoSalidas, ProductoForm, ProveedorForm, LoteDetalle, ErrorBoundary
    templates/  AppTemplate, PageTemplate, AuthTemplate
  pages/        una por ruta; componen organismos y llaman servicios
  styles/       tokens.css y base.css. Lo demás es CSS Module junto a su componente
tests/e2e/      Playwright
```

## Pantallas
Tablero · Recibir · Procesar · Stock · Lotes · Costos · Catálogos · **Actividad** (cambios en los datos con quién/cuándo/qué, y errores de la aplicación: JS, render, promesas rechazadas y respuestas de error de Supabase se registran solos).

## Reglas para que siga escalando
- Un componente = `X.tsx` + `X.module.css`. Sin CSS global nuevo; solo tokens.
- Átomos y moléculas no importan servicios. Si necesita datos, es organismo o página.
- Toda tabla usa `DataTable` con `columnas: Columna<T>[]`.
- Toda llamada a Supabase vive en `services/` y pasa por `ok()`.
- Lógica calculable (como el cuadre) va en `lib/` como función pura, con su test.
- Añadir pantalla: servicio → organismos → página → una línea en `RUTAS` (`App.tsx`).

## Desplegar en Vercel
Importar el repo, framework Vite, variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. `vercel.json` ya redirige las rutas.
