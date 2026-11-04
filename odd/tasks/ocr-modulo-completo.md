# Módulo OCR de tickets — frontend ORD Capital

Fuente normativa: `docs/OCR/prd-ocr-final.md` (PRD DEFINITIVO, autoridad) y
`docs/OCR/propuesta contrato back-front.md` (contrato v1).
Rama de trabajo: `feat/ocr-ticket-module`. Backend OCR: dependencia externa, no se modifica.

## Specs

- **S1 — Un ticket = una cuarentena.** PRD §2: "Un comprobante completo constituye **un único elemento de cuarentena**." No deben crearse N tarjetas de cuarentena por ticket.
- **S2 — Todo pasa por cuarentena.** PRD §1: "Todos los tickets OCR pasan por cuarentena." Incluye `completed` y `needs_review`; `completed` no significa aprobado y no existe autoaprobación (§55, §62).
- **S3 — Agrupación por nodo final.** PRD §3: "Al confirmar el ticket se crea **un movimiento financiero por cada categoría/subcategoría final diferente**." Nunca uno por producto. Nodo padre sin hijos es nodo final (§4); se persiste el `estructura_id` real, nunca el nombre.
- **S4 — `OCR no reconocidos`.** PRD §8/§9: categoría de sistema con clave estable `ocr_unrecognized`, traducción i18n, ID real válido, protegida contra borrado/edición. Recibe `expense_category_id = null`. Traducciones mínimas: `ES: OCR no reconocidos`, `EN: OCR unrecognized`, `PT: OCR não reconhecidos`.
- **S5 — `OCR no reconocidos` no es memoria.** PRD §10: "si el producto permanece en OCR no reconocidos → no registrar memoria; si el usuario cambia OCR no reconocidos → categoría real → sí registrar memoria".
- **S6 — Descuentos.** PRD §11: el descuento propio queda en el producto y "El grupo financiero utiliza el **importe final/neto** del producto." PRD §12: `descuento_grupo = descuento_general × subtotal_grupo / suma_subtotales`.
- **S7 — Redondeo.** PRD §13: "nunca desechar, rechazar ni bloquear un ticket solamente porque falten o sobren centavos"; el ajuste "se asignará de forma determinista al grupo con mayor subtotal"; regla final `SUM(movimientos confirmados) = TOTAL ticket`. PRD §89: no inventar importes materiales.
- **S8 — Importe autoritativo.** PRD §14: se usa `net_amount`; cantidad y precio unitario son auxiliares y no sobrescriben un importe final confiable.
- **S9 — Descripción original inmutable.** PRD §15: "Ese campo no debe ser editable." La interpretación se expresa por categoría.
- **S10 — Guardar ≠ Confirmar ≠ Rechazar.** PRD §17: Guardar persiste el borrador y registra memoria, sin crear movimientos y dejando `estado = pendiente`; Confirmar crea los movimientos agrupados; Rechazar no crea movimientos.
- **S11 — Memoria.** PRD §18/§19/§20/§21/§22/§23: solo `producto → categoría`, personal, global entre comercios, últimas 30 correcciones explícitas, endpoint `POST /v1/ocr/jobs/{job_id}/category-memory` con `item_index` + categoría y **sin** descripción; rechazar no borra memoria.
- **S12 — Fallo de memoria secundario.** PRD §24: "1. persistir correctamente el borrador; 2. registrar las correcciones de memoria." Si la memoria falla no se revierte el borrador; se conserva localmente y se reintenta, con `ocr_frontend_error`.
- **S13 — Envío.** PRD §26/§27: `POST /v1/ocr/jobs`, multipart `files` + `context`, sesión normal, sin `user_id`; 1 PDF o 1–10 imágenes JPEG/PNG/WebP/PDF; 20 MB por archivo, 80 MB total; no mezclar PDF con imágenes. Criterios §106: "rechaza 11 imágenes", "rechaza mezcla PDF + imagen", "rechaza >20 MB individual", "rechaza >80 MB total".
- **S14 — Contexto.** PRD §28/§29/§30/§31: `language`, `local_datetime`, `local_date`, `timezone`, `local_currency`, `expense_categories[]` con `{id, name, parent_name}`, `wallets[]`, `cards[]` con `supported_currencies[]` adaptado desde `moneda_iso`. La categoría de sistema no se envía al clasificador.
- **S15 — Ocho estados.** PRD §35/§36: `queued`, `processing`, `waiting_for_inference`, `classifying`, `completed`, `needs_review`, `failed`, `cancelled`, todos con i18n. `waiting_for_inference` no es error y puede durar días.
- **S16 — Polling.** PRD §38: backoff, sin telemetría por GET, pausa en background, consulta inmediata al volver, parada en estado terminal. No copiar la ventana de 10 minutos de Voice.
- **S17 — Persistencia del job.** PRD §39/§40: todo `job_id` se persiste y sobrevive cierre de modal, navegación, refresh, cierre de la PWA y cambio de día. El job se retira sólo con estado terminal **y** cuarentena despachada.
- **S18 — Foto local.** PRD §41/§42/§43/§44: copia local privada; IndexedDB con blobs en web, filesystem privado en móvil; clave `ocr-image/{job_id}/{index}`; manifiesto con `job_id`, `file_index`, `mime_type`, `created_at`, `processed_at`, `expires_at`; 7 días desde `completed`/`needs_review`.
- **S19 — Limpieza.** PRD §45/§95: limpieza mensual de expirados (nunca de jobs pendientes) + `Borrar caché` que borra imágenes y manifiestos OCR y **no** borra jobs pendientes, cuarentenas, movimientos ni memoria.
- **S20 — Foto ausente degrada.** PRD §46: "Imagen original no disponible en este dispositivo."; nunca bloquear edición, guardado ni confirmación.
- **S21 — Idempotencia.** PRD §52/§123: el mismo `ocr_job_id` no puede crear dos cuarentenas; protección en frontend **y** en RPC/base. Prueba obligatoria en base.
- **S22 — Discriminador.** PRD §51: `Voice → metadata.job_id`, `OCR → metadata.ocr_job_id`; `origen = 'ocr'`. No modificar Voice.
- **S23 — Confirmación transaccional.** PRD §58: 1 fila → N grupos → N movimientos, misma fuente de pago, una sola transacción, rollback completo ante fallo, cuarentena `procesado` sólo al final.
- **S24 — Rechazo.** PRD §59: no crea movimientos, retira la fila con el mecanismo vigente, no toca memoria ni foto.
- **S25 — Feature gate.** PRD §60/§61: gate `menu_ocr`; se elimina el toggle `OCR – Lectura inteligente de ticket` de Ajustes; no crear `ocr_enabled`.
- **S26 — i18n.** PRD §66: toda cadena visible por `t()` en `es`, `en`, `pt`; sin literales hardcodeados.
- **S27 — Telemetría propia.** PRD §69/§71: eventos `ocr_*`, sin evento por polling, sin importes/descripciones/imágenes, errores por `error_code`; la aprobación OCR no se cuenta como Voice.
- **S28 — Compatibilidad.** PRD §78/§79: no romper Voice, recurrentes ni API bancaria; las tarjetas no-OCR siguen sin conocer `items[]`/`ocr_job_id`.
- **S29 — Esquema real.** PRD §49: verificar esquema y RPC desplegadas antes de migrar; no confiar en espejos viejos; no romper la cuarentena existente.
- **S30 — Backend OCR intocable.** PRD §25/§127: no modificar el backend; si un endpoint no coincide, documentar endpoint, request real, response real, diferencia e impacto, y proponer el ajuste mínimo.

## Tasks

| ID | Specs | Ruta | Commit |
| --- | --- | --- | --- |
| T1 | S26 | i18n: sección `ocr` en es/en/pt | sí |
| T2 | S3,S6,S7,S8 | `src/ocr/` contrato, tipos, normalizador y aritmética de agrupación | sí |
| T3 | S13,S14,S15,S16,S30 | `src/ocr/` apiClient, contextBuilder, polling | sí |
| T4 | S17,S18,S19,S20 | `src/ocr/` storage de jobs, store de imágenes IndexedDB, limpieza | sí |
| T5 | S11,S12,S21,S27 | `src/ocr/` memoria, telemetría, errores, hooks de orquestación | sí |
| T6 | S1,S2,S4,S5,S9,S10,S23,S24 | UI de captura y de ticket en cuarentena + editores | sí |
| T7 | S22,S25,S27,S28 | Integración: App, AddMovementModal, BandejaCuarentena, Ajustes, mantenimiento | sí |
| T8 | S29,S21,S23,S4 | SQL: RPCs OCR, categoría de sistema y flag `menu_ocr` (autorización del dueño) | no |
| T9 | S3,S6,S7,S13,S17,S21 | Tests unitarios y de contrato | sí |
| T10 | — | Checks (tsc, node --test, check-i18n) e informe final | — |

## Log

### L1 — pedido del dueño (verbatim)

"Implementá el módulo OCR completo de ORD Capital siguiendo como fuente normativa principal el **“PRD DEFINITIVO — OCR DE TICKETS — Integración Frontend ORD Capital ↔ Backend OCR”** y, como contrato de integración con el backend, el documento previo **“Contrato OCR ↔ Frontend ORD — v1”**.

ambos archivos estan en la carpeta: C:\temp\Antigravity\ORD Capital v2\Personal\docs\OCR

Tomá el PRD definitivo como autoridad cuando exista cualquier diferencia con documentación anterior. No reabras decisiones funcionales ya cerradas allí.

Objetivo: llevar OCR a producción en el frontend, incluyendo captura/subida, contexto ORD, persistencia y reanudación de jobs, polling, almacenamiento local temporal de imágenes, aterrizaje idempotente en cuarentena, UI desplegable por categorías/productos, edición, memoria de categorías, `OCR no reconocidos`, descuentos proporcionales, redondeo, confirmación agrupada y transaccional, rechazo, i18n, feature gate `menu_ocr`, telemetría y tests.

Antes de modificar SQL o RPC, verificá el esquema real y la implementación vigente del proyecto; reutilizá Voice y cuarentena como patrones cuando corresponda, pero sin mezclar contratos ni `job_id`. No modifiques el backend OCR salvo incompatibilidad real y documentada. Si encontrás una contradicción que impida implementar exactamente el PRD, detené sólo esa parte, documentá la diferencia y proponé el ajuste mínimo.

Empezá la ejecución e implementación completa del módulo OCR."

### L2 — verificación del esquema real (2026-11-04)

- `p_caja_cuarentena` real: 19 columnas; `origen` ya admite `'ocr'`; `estado` ∈ `pendiente|procesado|rechazado`; `metadata jsonb`; sin índice único por `ocr_job_id`.
- `p_estructuras_egresos`: no existe columna `codigo`/`sistema`. Las categorías de sistema se identifican por `nombre_cuenta` = clave i18n (`cat_mystery`, `no_detail`, `cat_card_diff`, `cat_investments_portfolio`). Por eso `ocr_unrecognized` se provisiona como fila raíz con `nombre_cuenta = 'ocr_unrecognized'`.
- `app_feature_flags` no contiene `menu_ocr`; hay que insertarlo.
- `fn_aprobar_cuarentena_v2` es 1 fila → 1 movimiento; no sirve para OCR (PRD §58).
- `fn_onboarding_completo_usuario` es el trigger real de seed de categorías (`tr_onboarding_usuario`); `fn_crear_categorias_defecto_usuario` no tiene trigger.
- `p_preferencias_usuario.categoria_default_sin_clasificar` existe pero nunca se usa (0 de 83 filas): no se reutiliza para OCR.
- Rama: `produccion` (nunca se commitea ahí) → rama de trabajo `feat/ocr-ticket-module`.

### L3 — contratos verificados de Voice y cuarentena

- Voice: `src/voice/{contract,apiClient,contextBuilder,storage,useVoiceJobs,useVoicePolling,useVoiceQuarantine}.ts`; `VOICE_API_BASE_URL='https://api.ordcapital.app'`.
- `fn_reporte_cuarentena_pendientes()` devuelve la fila padre con `metadata`; el front filtra por `origen` en cliente.
- `fn_rechazar_cuarentena(p_pendiente_id)` ya sirve para OCR (borra la fila pendiente del usuario).
- `fn_editar_cuarentena_v2` sólo escribe columnas escalares: no sirve para editar `items[]`, así que OCR usa `fn_guardar_ticket_ocr_cuarentena`.

### L4 — implementación (rama `feat/ocr-ticket-module`)

- `src/ocr/` (17 módulos): `types`, `contract`, `normalize`, `grouping`, `apiClient`, `contextBuilder`,
  `contextTypes`, `polling`, `storage`, `imageStore`, `memoryRules`, `memory`, `telemetryProps`,
  `telemetry`, `errors`, `quarantine`, `useOcrJobs`, `useOcrCatalog`, `useOcrImages`, `OcrJobsProvider`, `index`.
- `src/components/ocr/`: `OcrCaptureModal`, `OcrTicketCard`, `OcrTicketImageModal`, `Ocr.css`.
- Integración: `App.tsx` (provider global + modal lazy + gate), `AddMovementModal` (botón cámara con
  `menu_ocr`), `BandejaCuarentena` (tarjeta OCR, OCR fuera del lote genérico, telemetría separada,
  estado vacío), `PreferenciasOperativasPage` (toggle eliminado), `settingsMenu` (hoja OCR eliminada),
  `catalogRegistry`/`categoryFilters` (`ocr_unrecognized` como categoría de sistema),
  `MantenimientoAppCard` + `appCache` (§95).
- Tests: `tests/ocr_*.test.js` (66) + `tests/cache/clear-app-cache-ocr.test.js` (3).

### L5 — defectos y hallazgos durante la implementación

1. **`toCents` roto en 1.005**: `Math.round(1.005*100)` da 100 porque `1.005*100` es
   `100.49999999999999`. Reescrito con el truco del exponente decimal (`Number('1.005e2')` → 100.5)
   y redondeo simétrico. Detectado por el test obligatorio de redondeo (§118).
2. **`clearAppCache` borraba los job ids OCR**: `localStorage` se vaciaba salvo tokens de Supabase, lo
   que viola §95 ("no borrar active job ids necesarios para recuperación"). Se preservan
   `ord.ocr.v1.active_jobs` y `ord.ocr.v1.pending_memory`; las fotos y manifiestos sí se borran
   (además de forma explícita, para navegadores sin `indexedDB.databases()`).
3. **El borrado de la categoría de sistema no va por trigger DELETE**: `fn_borrar_datos_usuario` hace
   `DELETE FROM p_estructuras_egresos WHERE user_id = $1`; un trigger BEFORE DELETE abortaría el
   borrado de cuenta. El bloqueo va en `fn_eliminar_estructura_egreso` y
   `fn_migrar_y_eliminar_estructura_egreso`, y el trigger cubre solo UPDATE (renombrar/re-cuelgar).
4. **Orden de guardado de la imagen**: el contrato exige clave `ocr-image/{job_id}/{index}` y el
   `job_id` solo existe después del POST. Se guarda bajo un id local (`upload-<uuid>`) antes del POST
   (§130) y se re-clava al `job_id` real al aceptar; un fallo deja la copia huérfana, que barre la
   limpieza mensual.
5. **Deuda de tests preexistente, no tocada** (13 fallos de 999, ninguno en archivos OCR):
   `recurrentes_fecha_corta` (en reordena placeholders a propósito: `{mes} {dia}` vs `{dia} de {mes}`)
   bloquea `ledger build` y el test de placeholders; `the pipeline turns the master into a translated
   dictionary` espera 10 secciones y `es.ts` ya tenía 11 antes de este trabajo (ahora 12 por `ocr`);
   `GROUP_ICONS`; hoja `recurring_expenses` en el grupo avanzado; 3 tests de presupuestos; un token
   `green` en `GastosRecurrentesPage.css`; y los 4 documentados
   (`budget-modal-select-action`, `consent-v2-i18n`, `i18n-nested-keys`, `run_transfer_insufficient_balance`).

### L6 — pendiente de autorización

Las migraciones `temp_sql/95..99` **no se aplicaron**. Requieren OK explícito del dueño
(AGENTS.md regla 1) y, una vez creadas, actualizar `funcionesSQL/` + `start_info/indice de funciones.md`
(reglas 5 y 7).
