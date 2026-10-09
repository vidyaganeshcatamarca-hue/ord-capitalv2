# Feature: Versionado legal — Términos y Política de Privacidad

Plan acordado: `docs/spec-versionado-legal-2026-10-09.md` (diseño aprobado por el dueño).
Rama: `feat/versionado-legal` (desde `feat/intermedio-gate-front`).
Commits base: `37f907f` (v1.1 docs) + spec commit.
Fuente de verdad de versiones/flags: tabla `legal_document_version` en DB (enfoque B).

## Objetivo

Tres niveles de política por versión legal (`none` / `notify` / `require_acceptance`),
publicados desde el panel ORD Admin (otro repo), con overlay bloqueante para re-aceptación
y modal combinado no bloqueante para avisos. `usuarios` queda libre de campos legales.

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Niveles | 3: none / notify / require_acceptance. Sin consentimiento granular (YAGNI). |
| Fuente de verdad | `legal_document_version` (doc_type, version PK; flags; effective_at). |
| Estado por usuario | Log append-only `p_legal_consentimientos` (aceptado/notificado/abierto). |
| usuarios | Se eliminan: consentimiento_legal_at, *_version_aceptada, opened_terms, opened_privacy (tras backfill). |
| pending_action | Derivado en backend: 'none' \| 'notify' \| 'require_acceptance'. Fallo seguro: sin eventos 'aceptado' = require_acceptance. |
| UX bloqueante | Overlay full-screen siguiendo la línea del gate de onboarding (ConsentGate/ConsentCheckbox/LegalDocModal). |
| UX aviso | Modal combinado una vez por versión; Ver cambios registra 'abierto'; Continuar → fn_registrar_notificacion_legal. |
| Admin | fn_admin_legal_versiones_listar + fn_admin_legal_version_publicar (fn_compare_versions: solo mayores; flags inmutables). Identidad vía fn_admin_session. |
| Releases | Deploy del HTML primero; publicación de fila después, misma release. LEGAL_VERSIONS queda como bootstrap del sign-up, sincronizado en la misma release. |
| v1.1 rollout | Semillas requires_acceptance=false, requires_notification=true. Backfill no re-prompta a nadie. |
| RPCs modificadas | fn_registrar_consentimiento_legal (log interno), fn_verificar_status_onboarding, fn_handle_new_user, fn_admin_funnel_onboarding (contratos de salida intactos). |
| Derivación pending_action (fix post-review) | 1) sin NINGÚN 'aceptado' del doc → require_acceptance; 2) requires_acceptance=true y sin aceptado de la vigente → require_acceptance; 3) requires_notification y sin notificado → notify; 4) none. Aplicado en 03 + spec §4.1. |
| Anti-bypass | registrarAperturaLegal deja de enviar versiones: NULL = solo registra 'abierto' (Tanda 2 front; la RPC ya hace skip con NULL). |
| DROP columnas | DEFERIDO: columnas de usuarios quedan congeladas post-backfill; DROP y migración de fn_admin_ficha_usuario coordinan en release futura. |
| Alcance admin | RPCs admin (05) se crean en Supabase y se espejan; su implementación en el repo del panel + keys error_legal_version_immutable/downgrade queda a cargo del panel con este contrato. |

## Tanda 0 — SQL: DDL + RPCs nuevas y modificadas (propuesta en temp_sql/)

- [x] `temp_sql/versionado-legal/01_create_legal_document_version.sql`
- [x] `temp_sql/versionado-legal/02_create_p_legal_consentimientos.sql`
- [x] `temp_sql/versionado-legal/03_rpc_obtener_estado_legal.sql`
- [x] `temp_sql/versionado-legal/04_rpc_registrar_notificacion_legal.sql`
- [x] `temp_sql/versionado-legal/05_rpc_admin_versiones.sql`
- [x] `temp_sql/versionado-legal/06_rpc_modificadas.sql`
- [x] `temp_sql/versionado-legal/07_backfill_semillas.sql` (backfill + seeds v1.1 + drop columnas al final)

## Tanda 1 — Creación en Supabase (requiere OK del dueño)

- [ ] Crear tablas + RPCs vía Management API tras OK del dueño
- [ ] Ejecutar backfill + semillas + drop de columnas
- [ ] Espejos en `funcionesSQL/` + `start_info/indice de funciones.md`

## Tanda 2 — Frontend (delegado a writer)

- [ ] Servicio `src/lib/` o hook de estado legal (llama fn_obtener_estado_legal al abrir sesión)
- [ ] Overlay bloqueante re-aprovechando ConsentGate/LegalDocModal
- [ ] Modal combinado de novedad legal (notify) + llamada a fn_registrar_notificacion_legal
- [ ] i18n: claves `legal_update_*` en es.ts (gate check-i18n)

## Tanda 3 — Verificación

- [x] Test SQL transaccional con ROLLBACK (runner solo con OK; create/run/drop vía Management API) (PASS 29/29 - fn_run_legal_versionado_test ejecutado con BEGIN/ROLLBACK y DROP final; cero residuo verificado)
- [ ] `node --test "tests/**/*.test.js"` · `node scripts/check-i18n.mjs` · `npx tsc --noEmit` (orquestador)

## Log de commits (evidencia)

- `37f907f` feat(legal): bump terms and privacy docs to v1.1
- `93e12e8` feat(legal): add legal versioning SQL batch (tables, RPCs, backfill, seeds)
- `6dd7c2d` feat(legal): add legal update gates (blocking re-acceptance overlay, combined notify modal)
- `a9e9eff` fix(legal): seal legal notification on acceptance (signup flow)

## Checks Tanda 3 (orquestador)

- tests/sql/legal_versionado_test.js: PASS 29/29 (A fallo seguro, B rollout notify, C/D derivacion, E guard requires_acceptance, F anti-bypass, G idempotencia, H gate admin JSON)
- Verificacion post-test via Management API: log identico al snapshot pre-test, sin fila 2.0, runner DROP-eado -> cero residuo
- Pendiente (fuera del scope del runner): smoke manual del overlay/modal en la app con un usuario real

## Checks Tanda 2 (orquestador)

- npx tsc --noEmit: OK
- node tests/consentimiento.test.js: OK (pin LEGAL_VERSIONS actualizado a 1.1)
- node tests/consentimiento_v2.test.js: OK
- node scripts/check-i18n.mjs: FAIL por deuda preexistente (249 USED-NOT-DEFINED + hardcoded legacy); sin incidencias nuevas de legal_update_*

## Notas de revisión del batch (Tanda 0)

- Desviaciones aceptadas del writer: ON DELETE CASCADE en user_id (convención p_app_sessions), REVOKE/GRANT belt-and-braces, regex de formato de versión (protege el cast de fn_compare_versions), rol admin + audit en las RPCs admin, skip de 'aceptado' con version NULL, funnels notas actualizadas.
- fn_compare_versions existe (funcionesSQL/fn_compare_versions.md): IMMUTABLE, -1/0/1, compara primeros dos segmentos; el validador de formato lo protege.
- Deuda registrada: tests/sql/consentimiento_tyc_test.sql + migration_consentimiento_tyc.sql quedan obsoletos tras el DROP futuro; índice (doc_type, evento, version) diferido.
## Pendiente de memoria (para proxima sesion con mem_* disponible)

- Fix Engram aplicado (mcp.json engram exposure codemode -> direct; causa: -builtin:codemode matava la unica via, pi mcp list OK).
- Persistir mirror Engram del feature versionado-legal: decision (tabla DB enfoque B + log usuarios) / bugfix (derivacion pending_action con guard requires_acceptance) / pattern (anti-bypass versiones NULL, aceptar sella notificado) / config (fix exposure). topic keys sugeridos: architecture/legal-versioning, bugfix/legal-pending-action, config/engram-exposure-direct.
