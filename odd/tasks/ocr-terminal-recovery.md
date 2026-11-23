# OCR — terminal recovery

Spec: the owner's message of 2026-11-13 (verbatim in `## Log`), which accepts the
forensic diagnosis and orders the fix. Backend OCR and the v1 contract are out of
scope: this changes frontend recovery only.

Functional definition that governs every spec below:

> `backend terminal` NO significa `frontend terminado`.
> Frontend termina solamente cuando la cuarentena quedó confirmada.

## Specs

- **S1** — Un job con `last_status = completed | needs_review` y
  `quarantine_dispatched = false` DEBE seguir siendo recuperable **aunque tenga
  `last_error_code`**.
- **S2** — No considerar un terminal como "cerrado" hasta que
  `quarantine_dispatched === true && pendiente_id !== null`.
- **S3** — NO volver a llamar `dispatchToQuarantine` sobre el mismo objeto local:
  el recovery tiene que revalidar contra el backend.
- **S4** — Para TODO terminal no despachado recuperado en mount/auth/foreground:
  (1) hacer nuevamente `GET /v1/ocr/jobs/{job_id}`; (2) si devuelve 200: adoptar o
  confirmar `owner_user_id` con la sesión actual, actualizar `last_status`,
  `last_stage`, `last_successful_poll_at`, persistir nuevamente el ticket/result
  normalizado, limpiar el error anterior; (3) si sigue `completed` o
  `needs_review` y hay ticket válido: ejecutar dispatch; (4) marcar
  `quarantine_dispatched=true`, `pendiente_id`, `quarantine_dispatched_at`
  **sólo después** de la RPC exitosa.
- **S5** — Si un GET terminal vuelve a producir `ticket = null`, conservar el job
  y registrar el error; no convertirlo en cerrado ni entrar en loop agresivo.
- **S6** — Cualquier GET 200 válido, sea terminal o no terminal, debe poder
  adoptar de forma segura el owner de la sesión con la que ese GET fue
  autorizado. Debe permitir recuperar `2afa03b0-0d0b-4f1b-a616-d805411de47e` y
  `af324289-ce44-4de7-a9e1-8b4683289af3` sin reupload ni reprocesamiento.
- **S7** — Un GET terminal 200 también es un poll exitoso: actualizar
  `last_successful_poll_at` **antes** de bifurcar entre `onUpdate` y `onResult`.
- **S8** — Auditar `normalizeOcrResult()` y documentar por qué puede devolver
  `null` ante un terminal 200. No relajar validaciones a ciegas. Si el backend
  devuelve una forma válida que el parser no reconoce, corregir el parser con
  evidencia y test. Si `null` es legítimo ante payload inválido, mantenerlo como
  error recuperable.
- **S9** — Tests obligatorios A–G (ver `## Tasks`).
- **S10** — No crear un segundo mecanismo de polling: reutilizar la
  reconciliación, el GET existente y el dispatch existente.

## Tasks

| ID | Spec | Route | Notes |
| --- | --- | --- | --- |
| T1 | S1, S2 | inline | `selectResumableOcrJobs` closes only on a confirmed quarantine row |
| T2 | S7, S6 | inline | `onPolled` hook in the loop: any 200 updates trace and adopts owner |
| T3 | S3, S4, S5, S10 | inline | recovery re-polls through the existing loop; no local re-dispatch |
| T4 | S4 | inline | remove the contradictory filter in `retryPendingDispatches` |
| T5 | S8 | inline | document the three legitimate `null` paths of `normalizeOcrResult` |
| T6 | S9 | inline | `tests/ocr_terminal_recovery.test.js` A–G |
| T7 | — | inline | OCR suite + `tsc --noEmit` |

## Commits

- `977be92` — fix: selector closes only on a confirmed quarantine row, `onPolled`
  adoption/trace on every 200, recovery through the existing GET, `resumePending`
  no longer degrades a pending dispatch, `NO_TICKET` documented (T1–T5).
- `6bae80c` — test: regressions A–G plus the dispatch-list tie (T6).

Verified: 147/147 OCR tests, `tsc --noEmit` exit 0.

## Log

L1 (owner, verbatim):

> El diagnóstico está aceptado. Ahora sí implementá la corrección.
>
> No tocar backend OCR.
>
> ### 1. Terminal no despachado queda fuera del retry
>
> Hoy `selectResumableOcrJobs` descarta terminales demasiado temprano.
>
> Un job:
>
> - `last_status = completed | needs_review`
> - `quarantine_dispatched = false`
>
> DEBE seguir siendo recuperable aunque tenga `last_error_code`.
>
> No considerar un terminal como “cerrado” hasta que:
>
> `quarantine_dispatched === true && pendiente_id !== null`
>
> Corregir el selector con esa regla.
>
> Pero NO hagas simplemente que vuelva a llamar `dispatchToQuarantine` sobre el mismo objeto local.
>
> ### 2. Recovery de terminal debe revalidar backend
>
> Caso crítico:
>
> `GET 200 terminal → normalizeOcrResult() = null → NO_TICKET`
>
> Si el StoredOcrJob conserva `ticket=null`, reintentar dispatch localmente vuelve a producir NO_TICKET indefinidamente.
>
> Por lo tanto, para TODO terminal no despachado recuperado en mount/auth/foreground:
>
> 1. hacer nuevamente `GET /v1/ocr/jobs/{job_id}`;
> 2. si devuelve 200:
>    - adoptar/confirmar `owner_user_id` con la sesión actual;
>    - actualizar `last_status`;
>    - actualizar `last_stage`;
>    - actualizar `last_successful_poll_at`;
>    - persistir nuevamente ticket/result normalizado;
>    - limpiar el error anterior si la lectura fue exitosa;
> 3. si sigue `completed` o `needs_review` y existe ticket válido:
>    - ejecutar dispatch;
> 4. marcar:
>    - `quarantine_dispatched=true`
>    - `pendiente_id`
>    - `quarantine_dispatched_at`
>    sólo después de RPC exitosa.
>
> Si GET terminal vuelve a producir `ticket=null`, conservar el job y registrar el error; no convertirlo en cerrado ni entrar en loop agresivo.
>
> ### 3. Legacy sin owner
>
> Corregir el caso descubierto:
>
> legacy `owner_user_id=null`
> → primer GET ya devuelve terminal
> → hoy no pasa por `onUpdate`
> → nunca adopta owner.
>
> Cualquier GET 200 válido, sea terminal o no terminal, debe poder adoptar de forma segura el owner de la sesión con la que ese GET fue autorizado.
>
> Esto debe permitir recuperar específicamente:
>
> - `2afa03b0-0d0b-4f1b-a616-d805411de47e`
> - `af324289-ce44-4de7-a9e1-8b4683289af3`
>
> sin reupload ni reprocesamiento.
>
> ### 4. Timestamp diagnóstico
>
> Un GET terminal 200 también es un poll exitoso.
>
> Actualizar `last_successful_poll_at` antes de bifurcar entre:
>
> - onUpdate
> - onResult
>
> para que el campo represente realmente el último GET exitoso.
>
> ### 5. Revisar NO_TICKET
>
> Auditar `normalizeOcrResult()` y documentar por qué puede devolver null ante un terminal 200.
>
> No relajes validaciones a ciegas.
>
> Si el backend devuelve una forma válida que el parser actual no reconoce, corregir el parser con evidencia y test.
>
> Si null es legítimo ante payload inválido, mantenerlo como error recuperable.
>
> ### Tests obligatorios
>
> Agregar regresiones para:
>
> A. terminal + dispatch RPC falla → queda no despachado → mount/foreground → GET backend → dispatch reintentado → éxito exactamente una vez.
>
> B. terminal + `NO_TICKET` → permanece recuperable → siguiente reconciliación hace GET otra vez → ticket válido → dispatch exactamente una vez.
>
> C. legacy owner=null → primer GET devuelve `needs_review` → adopta owner → dispatch exactamente una vez.
>
> D. legacy owner=null → primer GET devuelve `completed` → mismo comportamiento.
>
> E. GET terminal exitoso actualiza `last_successful_poll_at`.
>
> F. cuarentena ya confirmada nunca vuelve a consultar ni despachar innecesariamente.
>
> G. error de sesión/404 sigue sin borrar ni cerrar permanentemente el job.
>
> ### Importante
>
> No crear un segundo mecanismo de polling.
>
> Reutilizar reconciliación, GET existente y dispatch existente.
>
> La definición funcional final es:
>
> `backend terminal` NO significa `frontend terminado`.
>
> Frontend termina solamente cuando la cuarentena quedó confirmada.
>
> Ejecutar suite OCR completa + `tsc --noEmit`.
>
> Reportar: causa raíz corregida; ruta exacta de recuperación terminal; comportamiento de NO_TICKET; migración/adopción legacy; tests; commits.
