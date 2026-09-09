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
| `07_tests_correcciones_pgtap.sql` en el SQL Editor | 54 pruebas de `fn_editar_lote`, `fn_quitar_jaba`, `fn_anular_lote`, sobrante, pedidos y obreros: el código se rearma con la fecha, no pisa lotes existentes, quitar una jaba recalcula el lote y respeta lo ya procesado, no anula lotes ya procesados, borra jabas y recepción vacía, deja constancia | Supabase con 01–05 y 07–16 |
| `E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e` | Flujo completo de la encargada en navegador real: login → recibir → procesar → stock → Actividad | Un proyecto de Supabase **de pruebas** (crea datos) y `npx playwright install chromium` la primera vez |

`npm run typecheck` pasa con `strict`.

## Base de datos (`db/`)
`00_reset` · `01_schema` · `02_seed_catalogos` · `03_alta_catalogos` · `04_metricas_alertas` · `05_auditoria_logs` · **`07_correcciones`** (editar fecha / quitar una jaba / anular lote; obligatorio para que Stock y Lotes puedan corregir) · **`08_proceso_obrero`** (columna `procesos.obrero`, `fn_obreros`; obligatorio para el campo "Quién procesó") · `09_pendientes_cerrados` (HUP confirmado y limpieza semanal de logs con pg_cron) · **`10_sobrante`** (cerrar procesos cuyas salidas pesan más que la entrada: KPIs sin merma negativa, `kg_sobrante`, alerta SOBRANTE) · **`11_stock_alto`** (semáforo con nivel ALTO por encima del kg ideal; mínimo e ideal opcionales) · `12_fechas_validas` (CHECK de fechas 2020…mañana en recepciones, procesos y lotes; lista las filas a corregir) · `14_horas_proceso` (hora de inicio y fin del proceso, en trazabilidad) · `16_destinos_moler_cortar` (destinos "para moler" y "para cortar" con lotes -MOLER / -CORTAR; filtro por destino en Stock) · **`15_obreros`** (catálogo de obreros con nombre único, `procesos.obrero_id`, migración de los nombres digitados, `fn_rendimiento_obrero`) · **`13_pedidos`** (salidas de proceso para stock o para el pedido de un cliente: lote hijo separado con sufijo del cliente, `destino`/`cliente` en lotes y trazabilidad, `fn_clientes`). Se cargan en orden en el SQL Editor, **una vez cada uno**: no hace falta repetir un archivo ya cargado (una vista redefinida por un archivo posterior no puede volver a la versión anterior). Los `*_tests_pgtap.sql` se corren aparte y no dejan datos.

## Estructura
```
src/
  lib/          supabase.ts (cliente + ok(): todo error de la base se registra en logs_app), format.ts, cuadre.ts (balance puro), series.ts (series de gráficas), types.ts
  services/     acceso a datos, una función por operación; las páginas NUNCA importan supabase directo
  hooks/        useAuth, useAsync, useDebounce
  components/
    atoms/      Button, Input, Select, Checkbox, Badge, Notice, Mono/Ayuda/Sub
    molecules/  Field, Combo, Kpi, Tabs, Chips, AlertItem, CuadreBar, SimilarList
    organisms/  DataTable, Sidebar, Panel, KpiGrid, AlertList, StockTable, RecepcionLineas, ProcesoEntradas,
                ProcesoSalidas, ProductoForm, ProveedorForm, LoteDetalle, ErrorBoundary,
                Grafica (Figura, GraficaLineas, GraficaBarras, TablaSeries: SVG/HTML sin librerías)
    templates/  AppTemplate, PageTemplate, AuthTemplate
  pages/        una por ruta; componen organismos y llaman servicios
  styles/       tokens.css y base.css. Lo demás es CSS Module junto a su componente
tests/e2e/      Playwright
```

## Pantallas
**Tablero** (KPIs del período, alertas, stock y cinco gráficas: kilos por día, rendimiento y merma, compras por proveedor, costo real semanal y rendimiento por proveedor del producto elegido) · Recibir · Procesar · **Stock** (por producto con semáforo de cuatro colores, medidor por fila, filtro por estado y mínimo/ideal editables; por lote; desde cualquier lote se corrige fecha, kilos y precio, se quita una jaba digitada de más, o se anula la recepción completa; los lotes que salieron de un proceso se corrigen en el proceso) · Lotes · Costos · Catálogos (productos, proveedores y **obreros**) · **Actividad** (cambios en los datos con quién/cuándo/qué, y errores de la aplicación: JS, render, promesas rechazadas y respuestas de error de Supabase se registran solos).

## Reglas para que siga escalando
- Un componente = `X.tsx` + `X.module.css`. Sin CSS global nuevo; solo tokens.
- Átomos y moléculas no importan servicios. Si necesita datos, es organismo o página.
- Toda tabla usa `DataTable` con `columnas: Columna<T>[]`.
- Toda llamada a Supabase vive en `services/` y pasa por `ok()`.
- Lógica calculable (como el cuadre) va en `lib/` como función pura, con su test.
- Añadir pantalla: servicio → organismos → página → una línea en `RUTAS` (`App.tsx`).

## Desplegar en Vercel
Importar el repo, framework Vite, variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. `vercel.json` ya redirige las rutas.
