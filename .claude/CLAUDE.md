# Bodega de producción cárnica

Sistema de control de una bodega de producción de carnes en Quito: recepción de materia prima por lotes,
desposte/limpieza, subproductos, stock y costo real por kilo. Lo usa una sola persona (la encargada de bodega),
no técnica, desde una PC. El desarrollador es Kevin (QA/DevOps); yo trabajo con él en español.

## Stack
- **Base de datos: Supabase (Postgres 15+)**. Toda la lógica de negocio vive en Postgres: funciones, triggers, vistas, RLS.
  No hay backend propio y **no debe agregarse** salvo integraciones externas (báscula, SRI, WhatsApp) — y aun ahí, primero Edge Functions.
- **Frontend: React 18 + TypeScript + Vite**, Atomic Design, CSS Modules, `@supabase/supabase-js`, `xlsx` para exportar. Desplegado en Vercel.
- **Tests:** Vitest + Testing Library (unitarios/componentes), pgTAP (base), Playwright (e2e).

## Scripts SQL (carpeta `db/` o donde estén los `0N_*.sql`) — se ejecutan en orden en el SQL Editor
| Archivo | Contenido |
|---|---|
| `00_reset.sql` | Borra todo. Solo para empezar de cero. |
| `01_schema.sql` | Tablas, motor de costo (`fn_procesar`, `fn_actualizar_lote`), triggers, vistas de stock/costo, RLS. Idempotente. |
| `02_seed_catalogos.sql` | Especies, tipos de proceso, 169 proveedores, 122 productos. **No** es idempotente. |
| `03_alta_catalogos.sql` | Alta inteligente: `fn_productos_similares`, `fn_sugerir_codigos`, `fn_crear_producto`, `fn_proveedores_similares`, `fn_crear_proveedor`. Usa `unaccent` + `pg_trgm`. |
| `04_metricas_alertas.sql` | `v_stock_semaforo`, `v_alertas`, `fn_kpis`, `v_rendimiento_proveedor`, `parametros`, `stock_minimos`. |
| `05_auditoria_logs.sql` | `auditoria` (trigger genérico), `logs_app` + `fn_log`, `v_auditoria`, `v_logs_resumen`. |
| `06_tests_pgtap.sql` | 29 pruebas del motor; se revierte solo. |
| `07_correcciones.sql` | `fn_editar_lote` (cambia fecha → rearma código), `fn_quitar_jaba` (una fila de `recepcion_detalle`; borra el lote si era la última) y `fn_anular_lote` (borra jabas, recepción vacía y lote). Requerido por Stock y Lotes. |
| `07_tests_correcciones_pgtap.sql` | 35 pruebas de las correcciones; se revierte solo. |
| `08_proceso_obrero.sql` | `procesos.obrero` (texto libre, quién procesó), `v_trazabilidad.obrero`, `fn_obreros()` para autocompletar. |

## Modelo (lo esencial)
- **Todo es un lote.** `lotes` es la tabla central: nace de una recepción o de un proceso, tiene `kg_disponible` y `costo_kg`.
- **Código de lote = `<codigo_proveedor><codigo_producto><ddmmyy>`**, ej. `131AR040526`. Lo genera `fn_codigo_lote`; nadie lo escribe a mano.
  Mismo producto + mismo proveedor + misma fecha = **mismo lote** (varias jabas suman). Lotes mezclados (molida) no llevan proveedor: `EMC030226`.
- **Código de producto**: 2–6 letras mayúsculas; la(s) última(s) indican especie (R res, C cerdo, P pollo, V vísceras, B borrego, I importado, PV pavo).
  Variantes = código base + calificativo (`CR` lomo falda → `CRA` limpio; `ER` industrial → `ERE` especial). `fn_sugerir_codigos` sigue esa lógica.
- **Recepción**: `recepciones` (cabecera) + `recepcion_detalle` (una fila por jaba). Total = `kg_real × precio_kg`. El trigger asigna el lote.
- **Proceso**: `procesos` + `proceso_entradas` (lote, kg_tomados, kg_devueltos) + `proceso_salidas` (producto, rol, kg, precio_credito, conserva_proveedor).
  El frontend inserta filas y llama `rpc('fn_procesar', {p_proceso_id})`. `procesos.obrero` es quién lo hizo (texto libre, opcional, con autocompletado de nombres ya usados; sin catálogo de personal).
- **Roles de salida**: `principal` (recibe el costo), `subproducto` (se acredita a `precio_credito`, que se escribe en cada proceso),
  `merma` (costo 0, solo resta kilos: venas, sangre, desperdicio), `devolucion` (vuelve al lote origen).
- **Costo**: neto = Σ(kg consumidos × costo_kg de entrada) − Σ(subproductos × precio_credito); costo/kg principal = neto ÷ Σ kg principales.
  Lotes hijos que se fusionan (misma clave) → promedio ponderado. Editar precio de compra **recalcula en cascada** todos los descendientes.
- Venas/sangre/desperdicio **no son stock** ni disparan alertas de lote viejo.
- Kilos que no cuadran quedan en `procesos.kg_merma_no_reg` y disparan alerta si superan `parametros.merma_max_pct`.
- **Correcciones** (Stock → Por lote, o Lotes): kg y precio se editan en `recepcion_detalle` (la cascada hace el resto);
  fecha, quitar una jaba y anulación van **solo por RPC** (`fn_editar_lote`, `fn_quitar_jaba`, `fn_anular_lote`), nunca `update`/`delete` directo a `lotes` ni `delete` a `recepcion_detalle` desde el cliente.
  Caso típico: el mismo producto digitado dos veces el mismo día queda en UN lote con dos jabas → se quita la jaba repetida, no se anula el lote.
  Anular **borra** el lote en vez de marcarlo `anulado`: `fn_obtener_lote` busca por código y un lote anulado atraparía las jabas al volver a recibirlas.
  Lotes con `origen = 'proceso'` no se corrigen como lote: se corrige el proceso (`/procesar?id=…`) y `fn_procesar` reparte de nuevo.
- `lotes` **no se audita** fila a fila (lo recalcula el sistema); su historia se reconstruye desde `recepcion_detalle`, `proceso_*` y `logs_app` (origen `correccion`).

## Frontend — estructura y reglas
```
src/lib/        supabase.ts (cliente + ok(): todo error se registra en logs_app), format.ts, cuadre.ts (balance puro), types.ts
src/services/   una función por operación; las páginas NUNCA importan supabase directo
src/hooks/      useAuth, useAsync, useDebounce
src/components/ atoms/ molecules/ organisms/ templates/  — X.tsx con su X.module.css cuando tiene estilo propio
                (Input/Select/Checkbox comparten Control.module.css; los organismos que solo componen no llevan CSS)
src/pages/      una por ruta; componen organismos y llaman servicios
```
- Átomos y moléculas **no importan servicios**. Si un componente necesita datos, es organismo o página.
- **Toda tabla usa `DataTable`** con `columnas: Columna<T>[]`. No escribir `<table>` a mano.
- Toda llamada a Supabase pasa por `ok()`; las páginas hacen `try/catch` y muestran `<Notice tipo="error">`.
- Lógica calculable (cuadre, validaciones) va en `lib/` como función pura **con test**.
- Nombres en español, la misma voz que la interfaz (`guardarProceso`, `listLotesDisponibles`).
- Para añadir pantalla: servicio → organismos que falten → página → una línea en `RUTAS` de `App.tsx`. El menú sale de ese array.
- Nada de CSS global nuevo: solo `styles/tokens.css` y CSS Modules. Sin Tailwind.
- Diseño: gris acero de fondo, tinta oscura, un solo acento rojo (`--rojo`) para acción principal y alertas críticas. Números tabulares, inputs altos.

## Comandos
```bash
npm run dev          # http://localhost:5173  (requiere .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY)
npm run typecheck    # tsc strict
npm test             # 48 pruebas Vitest
npm run build        # tsc -b && vite build
E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e   # Playwright, contra Supabase DE PRUEBAS
```
Antes de dar por terminado un cambio: `npm run typecheck && npm test && npm run build`.
Si toco SQL: volver a correr `06_tests_pgtap.sql` y `07_tests_correcciones_pgtap.sql`, y agregar pruebas para lo nuevo.
No hay Postgres local ni Docker en la máquina de Kevin: las pruebas pgTAP se corren en el SQL Editor de Supabase; la `anon key` no permite leer el esquema, así que la fuente de verdad del modelo son los `.sql` de `db/`.

## Decisiones ya tomadas (no reabrir sin motivo)
- Sin macros Excel, sin backend propio, sin Tailwind, TypeScript estricto.
- La llave del frontend es la `anon`/`publishable`; **nunca** `service_role` en el cliente.
- RLS: un solo rol (`authenticated`) con acceso total; `auditoria` y `logs_app` solo lectura desde la app.
- Alertas se calculan al abrir la pantalla (vista), no se guardan. Notificaciones push/WhatsApp quedan para más adelante.
- Los servicios devuelven `PromiseLike` (builder de Supabase): para `.catch` en páginas, envolver con `Promise.resolve(...)`.

## Pendientes conocidos
- Código de **hueso pollo** (`HUP` propuesto, `por_confirmar = true`) — confirmar con bodega.
- Proveedores 17 y 48 son ambos "JUAN SANCHEZ": ¿misma persona?
- Fase 2: fileteada y acumulación de goulash como pantallas guiadas (hoy se hacen con Procesar genérico).
- pg_cron para `fn_limpiar_logs()` semanal.
