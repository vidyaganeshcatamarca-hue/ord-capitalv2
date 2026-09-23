# Feature: Voice v1 — Carga por voz en ORD Capital Personal

Plan acordado: `docs/voz/ORD_Voice_PRD_Frontend_2026-09-22.md` + handoff completo + contrato cerrado v6.
Rama: `feature/voice-v1-frontend` (basada en `produccion` `af41079`).
Mirror Engram: `voice/planning-decisions` (id 425), `voice/json-contract` (id 427), `voice/codec-fallback` (en `voice/planning-decisions`), `voice/frontend-contract` (id 424).

## Objetivo de la feature

Reemplazar `fn_disparar_procesamiento_voz` (backend viejo, vía webhook n8n genérico) por la integración real contra `https://api.ordcapital.app/v1/voice/jobs`. La voz graba audio (max 30s) en el navegador, lo envía junto con catálogos del usuario (nombres + IDs), hace polling del job, recibe `movements[]` y los vuelca en la cuarentena existente para que el usuario apruebe/edite/descarte.

## Decisiones cerradas (resumen)

| Tema | Decisión |
|---|---|
| Backend target | `api.ordcapital.app` (FastAPI + Whisper + n8n + Qwen 3.5 4B) |
| RPC vieja | Se reemplaza `fn_disparar_procesamiento_voz`. Queda deprecada. |
| Multipart | 4 campos: `audio`, `idempotency_key`, `language`, `context` (JSON string). Sin `audio_codec` — ffprobe detecta. |
| IDs en JSON | Todos `string` (bigint del proyecto). `Number()` solo antes de pasar a Supabase. |
| Catálogos en context | `Array<{ id, name, currency? }>` con PKs: `billetera_id`, `estructura_id`, `tarjeta_id`, `producto_id` (ojo: `p_ingresos` usa `producto_id`, no `ingreso_id`). |
| Output movements | `*_id` resuelto por parser determinista + `*_name` para mostrar. `null` cuando ambiguo. |
| Transfer ARS↔USD | Voice las permite; cuarentena las bloquea con mensaje claro. Cross-currency real = fase aparte. |
| Codec navegador | Fallback capability-based OGG/Opus → WebM/Opus → MP4/AAC via `MediaRecorder.isTypeSupported`. Sin UA sniffing. |
| Recorder UX | Auto-envía al detener (soltar o corte a 30s). Sin paso intermedio. Visor 30s visible. |
| Cuarentena UX | Cada movement en tarjeta propia (checklist). Aprobación uno por uno, marcados en lote o todos. Incompletos no aprobables. |
| Edición cuarentena | Libre sobre todos los campos. Si cambia type, revalidar obligatorios. |
| Notificación | FAB en Home con cuenta persistente (no Badge nav). |
| Acceso (doble) | A) Micrófono visible dentro de AddMovementModal. B) Long-press 2s sobre tab "+" del BottomNav abre grabador full-screen desde cualquier pantalla. |
| Reanudar job | Solo si background < 10 min. Pasado eso, abandoned local. |
| Errores | Toast global (showToast) + inline en recorder. Centralizado en `i18n.errors.voice.*`. |
| Metodología | ODD puro con este task doc. |
| Regla sub-agentes | No corren tsc/build pesado. Solo read-only o `node -e` ad-hoc chico. |

## Tanda 0 — PR inicial (tipos + contratos + codec) — COMMIT 2f0aa61

Esta es la primera tanda. NO toca componentes vivos. Solo archivos nuevos en `src/voice/`.

- [x] Crear `src/voice/types.ts` con `VoiceContext`, `VoiceMovement`, enums, response types
- [x] Crear `src/voice/contract.ts` con constantes de endpoint y multipart builder
- [x] Crear `src/voice/codec.ts` con fallback chain + helper `pickSupportedMime()`
- [x] Crear `src/voice/errors.ts` con mapeo de códigos FastAPI → claves i18n `errors.voice.*`
- [x] Crear `src/voice/index.ts` con barrel export
- [x] Agregar claves i18n base en `src/locales/es.ts` (aplanadas voice_* por el resolver t() de 1 nivel) sección `errors.voice` (vacías por ahora)
- [x] Verificar `npx tsc --noEmit` — 0 errores

## Tanda 1 — API client + hooks de estado + storage — COMMIT 07aa4ce

- [x] `src/voice/apiClient.ts` con POST job, GET job, normalización de errores
- [x] `src/voice/useVoiceRecorder.ts` hook con MediaRecorder + timer 30s + countdown
- [x] `src/voice/useVoicePolling.ts` hook con backoff (1s/3s/7s/15s/30s) y cleanup
- [x] `src/voice/useVoiceJobs.ts` store (Context + reducer) para jobs activos
- [x] `src/voice/storage.ts` con `voice_active_jobs` en localStorage (job_id, created_at, idempotency_key)
- [x] Tests unitarios con `node --test` (4 archivos, 26 aserciones PASS) whitelisted en .gitignore

## Tanda 2 — Componente recorder + UI mínima — COMMIT bc0fd93

- [x] `src/components/voice/VoiceRecorderModal.tsx` (368 l; Bridge/Session split, 6 vistas derivadas)
- [x] `src/components/voice/VoiceRecorderButton.tsx` (95 l; pointer capture, guard anti doble release)
- [x] `src/components/voice/VoiceCountdown.tsx` (61 l; anillo SVG con stroke-dashoffset, role=timer)
- [x] CSS atómico `VoiceRecorderModal.css` (236 l, tokens con calc(*var(--font-scale)))
- [x] Story / mock visual — omitido por decisión del orquestador (referencia legacy suficiente; polish post-integración)

## Tanda 3 — Integración con BottomNav long-press — COMMIT 17991c3

- [x] Detectar long-press 2s sobre tab "+" en BottomNav (pointer events, supresión del click sintético, contextmenu prevenido)
- [x] Distinguir tap vs long-press sin romper tap normal (flag consumido en handleAddClick; onAddPress intacto)
- [x] Montar `VoiceRecorderModal` global en `App.tsx` (lazy + requestIdle preload, instancia única, cerrar solo desmonta)

## Tanda 4 — Integración con AddMovementModal — COMMIT 0e499ae

- [x] Agregar micrófono visible (icono + label) como tab/segmented "Manual | Voz" (tablist A11y, CTA mic que abre el modal global)
- [x] Estado del tab persiste mientras el modal está abierto (paneles alternados con hidden, form nunca desmontado)
- [x] Tap en tab Voz abre `VoiceRecorderModal` (onOpenVoice → isVoiceRecorderOpen; recorder overlay 1100/1110 encima del add-modal 1000/1010)

## Tanda 5 — FAB Home + contador cuarentena voz — COMMIT f01694d

- [x] `src/components/voice/VoiceHomeFab.tsx` con conteo (discriminador: metadata.job_id, NO origen)
- [x] Polling cada 15s (VOICE_QUARANTINE_POLL_MS) con cancel guard y errores silenciosos
- [x] Respetar feature flag `menu_cuarentena` (hasFeature + guard loading, sin RPC si apagado)
- [x] Navegación al tap: `/cuarentena?origen=voz`

## Tanda 6 — Integración con cuarentena existente — COMMIT 8052b6f

(Prerrequisito Supabase RESUELTO el 2026-09-23 por el orquestador: p_caja_cuarentena extendida (7 columnas) + fn_reporte_cuarentena_pendientes v2 + fn_cargar_movimientos_voz + fn_aprobar_cuarentena_v2 + fn_aprobar_cuarentena_lote_v2 + fn_editar_cuarentena_v2, con espejos en funcionesSQL/ y DEPRECATED en fn_disparar_procesamiento_voz. Tests parciales 7/9 PASS. Valores en espanol: estado=pendiente/procesado, origen=api_banco. FIX 2026-09-23 (autorizado): fn_reporte_cuarentena_pendients + fn_rechazar_cuarentena filtraban estado=pending (ingles, invisible contra el CHECK en espanol) -> pendiente; fn_cargar_movimientos_voz ahora persiste ambiguous_matches en metadata. FIX 2 (mismo dia, autorizado): mismo cambio pending->pendiente en fn_aprobar_cuarentena, fn_aprobar_gastos_cuarentena_lote, fn_editar_cuarentena, fn_editar_gasto_cuarentena (2 overloads) y fn_reporte_alertas_home. Sweep final de la DB: solo quedan pending en fn_disparar_procesamiento_voz (DEPRECATED, cero call-sites) y fn_reporte_termometro_tarjeta (label literal, distinto dominio) — se dejan como estan.)

- [ ] `src/voice/useVoiceQuarantine.ts` hook que mapea movements[] → filas cuarentena
- [x] Extender `BandejaCuarentena` (cards por tipo, filtro cliente, RPC sin params)
- [x] Si el movement tiene `*_id` null: selector de candidatas (ambiguous_matches) → fn_editar_cuarentena_v2
- [x] Botones Aprobar 1/lote/todos (incompletos excluidos con motivo; isApprovable por tipo)
- [x] Llamar `fn_aprobar_cuarentena_v2` + lote_v2 (rechazo via fn_rechazar_cuarentena legacy)
- [x] Llamar `fn_cargar_movimientos_voz` desde el Bridge al completar (una vez por job, guard)
- [x] Cancelar AudioRecorderModal viejo (borrado; botón Dictar gasto removido de AddMovementModal)
- [x] Marcar `fn_disparar_procesamiento_voz` deprecada en el espejo (hecho en Tanda 6 Supabase)

## Tanda 7 — Manejo de errores + i18n completo — COMMIT (Tanda 7)

- [x] Cobertura i18n completa (auditoria): 25 claves usadas resuelven — voice_* aplanadas en errors + export voice (claves de estado en voz.*)
- [x] Textos de estado via export voice: recording/uploading/queued/transcribing/interpreting/finalizing + NUEVO retry_wait (label propio para la espera de reintento)
- [x] Cubiertos en Tanda 6 via cuarentena_incompleto_falta, cuarentena_lote_excluidos, cuarentena_aprobar_todos, etc.
- [x] voice.terminal_failed definida (consumo decidido en Tanda 8 con endurecimiento) + retry_wait NUEVA y consumida en progressLabel
- [x] mic_denied/codec_unsupported ya consumidas via constantes de useVoiceRecorder; acceso denegado cubierto por voice_unauthorized
- [x] 13/13 códigos del contrato mapeados en errors.ts (auditoria: sin cambios necesarios)
- [x] check-i18n: 0 flags de voz (exit 1 = deuda preexistente de otros componentes)

## Tanda 8 — Endurecimiento

- [ ] Manejo de jobs abandonados tras >10 min background
- [ ] Cancelación limpia al desmontar el recorder (cerrar stream + parar MediaRecorder)
- [ ] Manejo de página hidden/visible (`document.visibilitychange`)
- [ ] Telemetría básica: `voice_recorded`, `voice_sent`, `voice_polling_started`, `voice_quarantine_approved_lote`, etc.

## Tandas siguientes (post v1)

- [ ] Pruebas E2E reales desde la UI (matriz del PRD §26)
- [ ] Soporte para Capacitor / Android (origin distinto + plugin MediaRecorder nativo)
- [ ] Extender cuarentena para soportar transferencias ARS↔USD reales (compra/venta de divisas)

## Riesgos / Deuda detectada

- **Unicidad de nombres NO enforced** en `fn_crear_billetera` / `fn_crear_tarjeta_credito` / `fn_crear_ingreso_personalizado`. Voice v1 lo asume pero un constraint UNIQUE + validación cliente es deuda viva. NO se aborda en esta entrega.
- **`p_caja_cuarentena` solo soporta expense hoy**. Tanda 6 depende de que tu par de backend extienda la tabla + cree `fn_aprobar_cuarentena_v2`. Sin eso, Tanda 6 queda bloqueada.
- **`fn_disparar_procesamiento_voz` queda deprecada** pero no se borra. Si la dejás viva y otro flujo la usa, queda con dos backends de voz en paralelo.

## Convenciones de commit (Conventional Commits, inglés, sin atribución de IA)

- `feat(voice): tipos y contrato JSON` — Tanda 0
- `feat(voice): codec fallback capability-based` — Tanda 0
- `feat(voice): api client y polling hooks` — Tanda 1
- `feat(voice): recorder modal con countdown 30s` — Tanda 2
- `feat(voice): bottom nav long-press` — Tanda 3
- `feat(voice): integration con add movement modal` — Tanda 4
- `feat(voice): fab home con conteo voz` — Tanda 5
- `feat(voice): quarantine integration v2` — Tanda 6 (requiere backend)
- `feat(voice): i18n errors.voice.*` — Tanda 7
- `chore(voice): cleanup AudioRecorderModal viejo` — Tanda 8

## Puertas

- Push, PR y cherry-pick: solo con OK explícito del dueño (regla 13).
- Cualquier extensión de `p_caja_cuarentena` o creación de RPCs nuevas en Supabase: pedir OK antes (regla 0).
- `tsc --noEmit` y `npm run build`: solo el orquestador, no los sub-agentes (regla 14).
