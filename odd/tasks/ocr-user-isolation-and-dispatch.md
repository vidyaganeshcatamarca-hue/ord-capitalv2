# OCR: aislamiento por usuario y despacho concurrente

Dos incidentes reconstruidos desde Spark. El Caso A es auth de almacenamiento local; el Caso B es concurrencia de polling/dispatch. Backend y contrato OCR no se tocan.

## Specs

**S1.** Persistir `owner_user_id` en `StoredOcrJob`.

**S2.** Al hidratar/resumir, pollear sólo jobs cuyo owner coincida con el usuario Supabase actual.

**S3.** Al logout/cambio de usuario, detener polling de jobs del usuario anterior sin borrarlos.

**S4.** Al volver al usuario original, permitir reanudarlos.

**S5.** Jobs legacy sin owner: definir migración segura; no asumir que pertenecen al usuario actual.

**S6.** Un 404 nunca puede dejar el job visualmente en "Procesando" indefinidamente.

**S7.** El estado de polling debe ser por `jobId`, no mediante flags globales.

**S8.** `dispatching/dispatched` debe ser por `jobId`.

**S9.** Un terminal de un job no puede ser sobrescrito por una actualización de otro.

**S10.** `completed` y `needs_review` deben seguir exactamente el mismo camino de dispatch.

**S11.** El `StoredOcrJob` terminal se persiste antes de intentar la RPC.

**S12.** Sólo se marca `dispatched` después de éxito confirmado de cuarentena.

**S13.** Si la RPC falla, conservar ticket + `last_error_code` y reintentar en mount/visibilitychange.

**S14.** Varios terminals concurrentes crean exactamente una cuarentena cada uno.

**S15.** Prueba de regresión con 3 jobs simultáneos:
- A = processing, B = needs_review, C = processing.
- B debe despacharse exactamente una vez sin detener ni alterar A/C.
- Después A = completed y C = needs_review casi simultáneamente: ambos exactamente una vez.

**S16.** Caso A: job `2afa03b0-0d0b-4f1b-a616-d805411de47e`, owner `54db30d1d4`, backend `needs_review` a las 00:57:30; al operar con owner `6a013d9bfe` el API devuelve 404. El 404 es correcto: no distinguirlo de "job inexistente" en el backend.

**S17.** Caso B: job `af324289-ce44-4de7-a9e1-8b4683289af3`, owner `6a013d9bfe`, `has_result=true`, GET 200 sostenido, y el usuario nunca recibió la cuarentena.

## Tasks

- T1 (S1, S5) — `owner_user_id` en `StoredOcrJob`, normalización y migración legacy.
- T2 (S2, S3, S4) — resumen filtrado por owner, corte de pollers al cambiar de usuario, reanudación al volver.
- T3 (S6) — 404 y falta de token nunca dejan "Procesando" indefinidamente.
- T4 (S11, S12, S13) — persistir terminal antes de la RPC, marcar dispatched tras éxito, reintentar en mount/visibilitychange.
- T5 (S7-S10, S14) — auditoría de concurrencia por `jobId` y corrección de los caminos.
- T6 (S15) — test de regresión con 3 jobs simultáneos.
- T7 — `tsc`, suite y commit.

## Log

**L1** — Incidentes y requisitos (verbatim del dueño): «Auditar y corregir storage OCR para que los jobs estén aislados por usuario: 1. Persistir `owner_user_id` en `StoredOcrJob`. 2. Al hidratar/resumir, pollear sólo jobs cuyo owner coincida con el usuario Supabase actual. 3. Al logout/cambio de usuario, detener polling de jobs del usuario anterior sin borrarlos. 4. Al volver al usuario original, permitir reanudarlos. 5. Jobs legacy sin owner: definir migración segura; no asumir que pertenecen al usuario actual. 6. Un 404 nunca puede dejar el job visualmente en "Procesando" indefinidamente. No modificar backend para distinguir job inexistente de job perteneciente a otro usuario.»

**L1b** — «Auditá específicamente concurrencia de polling/dispatch. En esa franja había varios OCR jobs simultáneamente activos.» Verificaciones: estado de polling por `jobId`; `dispatching/dispatched` por `jobId`; un terminal no sobrescrito por otro; `completed` y `needs_review` mismo camino; terminal persistido antes de la RPC; `dispatched` sólo tras éxito; si la RPC falla conservar ticket + `last_error_code` y reintentar en mount/visibilitychange; varios terminals concurrentes = una cuarentena cada uno.

**L1c** — «No cambies backend ni contrato OCR para resolver estos dos bugs.»

**L2** — Diagnóstico (auditoría de `storage.ts`, `useOcrJobs.ts`, `polling.ts`): `StoredOcrJob` no tiene owner; `loadOcrJobs()` y `resumePending()` hidratan todo sin filtro; sin token el job queda `phase: 'processing'` con `errorCode: UNAUTHORIZED` indefinidamente (S6); en `dispatchToQuarantine`, `if (!job.ticket) return false` sale **sin liberar el guard y sin patch**, dejando el job en "Procesando" para siempre (S17); el terminal se persiste **después** de la RPC, no antes (S11); `visibilitychange` sólo llama `syncMemory()`, nunca reintenta dispatch (S13).
