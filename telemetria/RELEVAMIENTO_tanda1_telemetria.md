# Relevamiento — Telemetría BASIC v1, Tanda 1

**Alcance relevado:** commit `ff3316b` sobre rama `feat/telemetria-basic`
**Fecha:** 2026-09-16
**Modo:** read-only puro. Sin cambios en el repo (ni una línea), sin `tsc`/`build`, sin escritura en Supabase (solo `SELECT` de verificación).

---

## Piezas relevadas

| Pieza | Ruta |
|---|---|
| Servicio | `src/lib/telemetry.ts` (251 líneas) |
| Router | `src/components/TelemetryRouteTracker/TelemetryRouteTracker.tsx` |
| Wiring | `src/App.tsx:180`, `src/providers/SessionTrackerProvider.tsx:12-18` |
| Home | `src/pages/Home/HomePage.tsx` (9 puntos de track) |
| Backend | spec real `fn_telemetry_ingest` + `p_telemetry_events` en Supabase, espejo `funcionesSQL/fn_telemetry_ingest.md`, índice entrada 224 |
| Plan | `telemetria/PLAN_Telemetria_BASIC_v1.md` |

---

## 🔴 Bloqueantes

### 1. Tormenta de reintento infinito en `flush()`

`src/lib/telemetry.ts:206`

```ts
.finally(() => {
  this.flushing = false
  if (this.queue.length > 0) this.flush()
})
```

Si el RPC **falla**, la cola no se vacía → `flush()` se vuelve a llamar a sí misma
**sin backoff y sin tope de intentos**. Reproducción del control flow exacto en Node:

```
attempts=102  queueStillPending=5  (sim cortada artificialmente en 5000)
```

102 requests en 1,5 segundos y el loop no termina nunca. El comentario dice
*"Keep queue; retry on next trigger"*; el código hace otra cosa.

Disparadores reales:

- **Login screen**: cualquier evento encolado logged-out → `auth.uid()` es `NULL` → el RPC hace
  `RAISE EXCEPTION error_unauthorized` → tormenta permanente mientras el usuario esté en `/auth`.
- **Offline** (caso natural en mobile): ídem, con `fetch` rechazando apenas.
- **Cold start**: `telemetry.init()` corre en el import del módulo (`:251`) → `restoreQueue()`
  borra el backup y hace flush **antes** de que el client de Supabase restaure la sesión
  (`:242`) → ventana de tormenta en cada arranque con cola pendiente.

Impacto: battery drain, spam de red, y anula la política de descarte por prioridad.

### 2. `previous_module` siempre está un salto atrás

`src/lib/telemetry.ts:141`

```ts
previous_module: this.previousModule ?? this.currentModule
```

El `??` prioriza `previousModule`, que es el módulo **anterior al actual**. Desde el tercer
cambio de módulo en adelante reporta mal. Trace ejecutando el algoritmo real:

| Navegación real | `previous_module` emitido | Esperado |
|---|---|---|
| `home → cards` | `"home"` | ✅ |
| `cards → wallets` | `"home"` | ❌ debería ser `"cards"` |
| `wallets → budget` | `"cards"` | ❌ debería ser `"wallets"` |
| `budget → home` | `"wallets"` | ❌ debería ser `"budget"` |

Es el único dato de flujo de navegación del PRD §10 → **el evento `main_module_opened`
no sirve para análisis de rutas ni para el funnel de módulos**.
Corrección: `previous_module: this.currentModule`.

---

## 🟠 Altos

### 3. "Una vez por sesión" es en realidad "una vez por arranque de la app"

`src/lib/telemetry.ts:127-129` + `src/providers/SessionTrackerProvider.tsx:12-18`

`sessionOnce.clear()` solo ocurre si se llama `setSession(null)`, y **nadie lo llama nunca**:
el logout desmonta `SessionTrackerInner` y su cleanup solo hace `telemetry.flush()`.
`signOut()` (`AuthContext.tsx:141`) es puro `supabase.auth.signOut()`, sin reload.

Dos consecuencias:

- `home_session_viewed` / `cards_session_viewed` / `budget_session_viewed` no vuelven a salir
  jamás en una segunda sesión del mismo arranque → sub-reporte sistemático.
- `this.sessionId` queda pegado en la sesión **muerta**: tras el logout, el redirect a `/auth`
  dispara `main_module_opened` estampado con un `session_id` cuya fila ya tiene `ended_at`.
  Contamina toda métrica por sesión, incluido el `same_session` del funnel (plan §4).

### 4. La cola en localStorage no está namespaced por usuario

`src/lib/telemetry.ts:25` → `const STORAGE_KEY = 'telemetry_queue_v1'`

`fn_telemetry_ingest` estampa `user_id` desde el `auth.uid()` **del momento de la ingesta**, no
del momento del click. Si el device cambia de cuenta (logout con cola pendiente por el bug 1,
o device compartido), el evento conductual del usuario A se escribe con el `user_id` del
usuario B. En una app de finanzas personales esto es privacidad, no solo calidad de dato.

---

## 🟡 Medios

### 5. `platform` nunca va a decir `ios`/`android`, y el listener nativo nunca se monta

`src/lib/telemetry.ts:57` y `:112` — `require('@capacitor/core')` / `require('@capacitor/app')`

`require` no existe en ESM/browser: Rollup lo deja literal (prueba en el build:
`dist/assets/index-LYZ2E5YL.js` contiene `require("@capacitor/core")`) → ReferenceError
capturado por el `catch` → siempre cae a `'web'`. Y en `init()` el `require('@capacitor/app')`
hace que **el disparador de flush "primario" en nativo (plan §2.3) nunca se registre**.

Hoy está inerte porque no hay proyecto Capacitor (no hay `capacitor.config.ts` ni `android/`)
y `p_app_sessions` da `platform='web'` en las 1748 sesiones — correcto por ahora. Pero el día
que se agregue la shell nativa, telemetry reporta `web` igual, sin error visible.

El patrón correcto ya está en el mismo repo: `src/hooks/useSessionTracker.ts:204` usa
`await import('@capacitor/app')`, y `src/lib/haptics.ts:5` usa
`window.Capacitor?.isNativePlatform?.()`. El bug de `getPlatform()` ya existía en
`useSessionTracker`; ahora quedó duplicado en telemetry.

### 6. Telemetría corre antes del consentimiento legal y logged-out

`src/lib/telemetry.ts:251` + `src/components/AppConsentGate/AppConsentGate.tsx:80`

`init()` corre en el import del módulo. `AppConsentGate` renderiza `children` mientras
`checking` (fail-open) y cuando no hay sesión; `TelemetryRouteTracker` cuelga de adentro.
Resultado: navegación pre-consentimiento y pre-login encolada que, una vez que entrás, se
atribuye a tu `user_id` con `session_id = NULL`. El plan no tomó esta decisión → hay que
decidirla (gate en `init()`, o flag `enabled` prendido post-consent).

### 7. Flush en background con `fetch` no es confiable

`src/lib/telemetry.ts:104-106`

El disparador primario (`visibilitychange → hidden`) manda un request normal: el browser lo
puede throttlear o matar cuando la pestaña pasa a background. La Fase 1 del session tracker ya
resolvió esto con `navigator.sendBeacon()` + `apikey` en query param. Acá no se reutilizó.
Los eventos no se pierden del todo (quedan en localStorage) pero se retrasan y quedan
expuestos a la política de descarte.

### 8. `track()` serializa toda la cola en cada evento

`src/lib/telemetry.ts:180` + `:222`

`persistQueue()` → `JSON.stringify(this.queue)` + escritura síncrona a localStorage **por cada
evento**, con hasta 500 eventos. Es O(n) por track y contradice el contrato del header del
propio archivo (*"track() is synchronous and lightweight"*) y el PRD §21/§24 ("no bloquea UI").
Con backlog grande, cada tap cuesta un stringify de 500 objetos.

---

## 🟢 Bajos / calidad de dato

9. **`{accepted, duplicates, invalid}` se descarta** (`:194-197`): el `.then` remueve los
   `batchIds` igual, sin leer la respuesta. Un evento con `properties > 2 KB` se pierde en
   silencio y no hay ningún lugar donde eso se vea.
10. **`restoreQueue()` borra el backup antes de enviar** (`:240`): si el flush no cierra antes
    de que maten la app, la recuperación de crash se pierde. La garantía es parcial.
11. **FK `session_id` sin `ON DELETE`** (confirmado en `pg_constraint`): hoy está OK porque nadie
    borra `p_app_sessions` (chequeado en `funcionesSQL/`), pero un purge de retención futuro
    hace fallar el insert de los 50 eventos del lote → alimenta el bug 1.
12. **Catálogo de `module` se abre**: el fallback de `pathToModule` devuelve el segmento crudo →
    `/auth` emite `module='auth'`, `/ayuda` emite `'ayuda'` (ninguno está en el catálogo), y los
    regex son prefijo sin límite (`/salud-fake` → `'salud'`).
13. `telemetria/check_events.cjs` está **untracked** y nunca se corrió. Tiene una línea muerta
    (`sessions_fix`; por hoisting no rompe, pero es ruido).

---

## Lo que está bien (verificado, no asumido)

- **El spec real en Supabase es idéntico al espejo** `funcionesSQL/fn_telemetry_ingest.md` y a
  `telemetria/sql/tanda1_telemetry_events.sql`: 12 columnas, PK `event_id`, FK a
  `p_app_sessions(session_id)`, 3 índices, RLS `enabled` con 0 policies, `proacl` con EXECUTE a
  `anon`/`authenticated`/`service_role`, `SET search_path TO 'public'`. **Cero drift espejo ↔ DB.**
- Idempotencia por `event_id` con `ON CONFLICT DO NOTHING` ✅
- Clamps `LEFT(...)` / `LEAST(GREATEST(...))` encajan con el schema ✅
- Tope de 50 coherente entre client (`MAX_BATCH`) y server (`v_max_events`) ✅
- Umbrales del plan (threshold 20 / timer 180 s / cap 500) ✅ · prioridades 1/2/3 ✅
- `track()` no lanza ni hace `await` en el camino funcional ✅
- En los eventos de Home no hay importes ni texto libre ✅
- No hay doble-emisión por StrictMode: `trackModule` está guardado por `currentModule !== module` ✅

---

## El dato que resume todo

```sql
SELECT count(*) FROM p_telemetry_events;
-- 0
```

**Nunca entró un solo evento.** Con 1748 sesiones registradas entre el 31/07 y hoy. O nadie abrió
la app desde el commit, o la ruta end-to-end está roto — y con el bug 1, lo segundo es lo más
probable.

Además: el plan §9 (y la regla 11 de `AGENTS.md`) pide test transaccional por tanda →
**no hay nada de telemetría en `tests/`**.

---

## Orden de resolución recomendado

| # | Bug | Esfuerzo | Por qué en ese orden |
|---|---|---|---|
| 1 | Tormenta de reintento (`:206`) | bajo | Convierte cualquier fallo de red/auth en loop de requests |
| 2 | `previous_module` (`:141`) | 1 línea | Invalida el único evento que justifica la tanda 1 |
| 3 | `setSession` / `sessionOnce` en logout | 1 línea en el cleanup | Corregí atribución por sesión |
| 4 | namespace de la cola por usuario | chico | Privacidad antes que la tanda 2 |
| 5 | Capacitor `require` → `import()` | chico | Se puede dejar para cuando exista la shell nativa, pero no hay que olvidarlo |
| 6-8 | gate legal, `sendBeacon`, persist decayado | medio | Decisiones de diseño, no typos |

**Antes de testear en un device: 1 y 2.**
