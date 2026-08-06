# Propuesta: Session Tracking (Tiempo de Uso) - Fase 1

**Fecha**: 2026-07-31
**Estado**: PENDIENTE DE APROBACION
**Scope**: Tabla nueva + ALTER TABLE + 6 RPCs + Hook frontend

---

## 1. Decisiones Confirmadas

| # | Decision |
|---|----------|
| 1 | Opcion C — una fila por sesion, pausar/reanudar in-place |
| 2 | Idle timeout: 2 min sin interaccion = penalizacion de 105s (1:45) |
| 3 | Control interno, no se expone al usuario |
| 4 | `platform` y `app_version` se llenan desde Fase 1 |
| 5 | Prefijo `p_` para tablas, `fn_` para RPCs |

---

## 2. DDL — Tabla Nueva `p_app_sessions`

```sql
CREATE TABLE public.p_app_sessions (
    session_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 BIGINT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    platform                TEXT NOT NULL DEFAULT 'web',
    app_version             TEXT,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at                TIMESTAMPTZ,
    paused_at               TIMESTAMPTZ,
    total_active_seconds    INTEGER NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','paused','completed','crashed')),
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indice principal: consultas por usuario ordenadas por fecha
CREATE INDEX idx_p_app_sessions_user_time
    ON public.p_app_sessions (user_id, started_at DESC);

-- Indice parcial: solo sesiones abiertas (para crash recovery al iniciar)
CREATE INDEX idx_p_app_sessions_open
    ON public.p_app_sessions (user_id)
    WHERE status IN ('active', 'paused');
```

**Notas:**
- `metadata` JSONB queda libre para Fase 2 (screen tracking, device info)
- El `CHECK` constraint limita status a 4 valores validos
- `total_active_seconds` acumula solo segundos de uso real (neto, penalizado por idle)

---

## 3. ALTER TABLE — `usuarios` (2 campos agregados)

```sql
ALTER TABLE public.usuarios
    ADD COLUMN total_usage_seconds INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN last_session_at TIMESTAMPTZ;
```

**Justificacion:** estos campos son caches/agregados para consultas rapidas del dashboard interno. Evitan hacer `SUM(total_active_seconds) FROM p_app_sessions` cada vez. Se actualizan via `fn_finalizar_sesion_app`.

---

## 4. RPCs

### 4.1 `fn_iniciar_sesion_app(p_platform TEXT, p_app_version TEXT) -> UUID`

**Cuando se llama:** cada vez que se abre la app (mount de App.tsx).

**Logica:**
1. Resuelve `v_user_id` via `auth.uid()`
2. Marca como `crashed` cualquier sesion previa del usuario que este en `active/paused` (crash recovery automatico)
3. INSERT nueva sesion con `status='active'`
4. Retorna `session_id` (UUID)

```sql
CREATE OR REPLACE FUNCTION public.fn_iniciar_sesion_app(
    p_platform TEXT DEFAULT 'web',
    p_app_version TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
    v_session_id UUID;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- Crash recovery: cerrar sesiones previas que quedaron abiertas
    UPDATE p_app_sessions
    SET status = 'crashed',
        ended_at = COALESCE(updated_at, started_at),
        updated_at = now()
    WHERE user_id = v_user_id
      AND status IN ('active', 'paused');

    -- Crear nueva sesion
    INSERT INTO p_app_sessions (user_id, platform, app_version, started_at, status)
    VALUES (v_user_id, p_platform, p_app_version, now(), 'active')
    RETURNING session_id INTO v_session_id;

    RETURN v_session_id;
END;
$function$;
```

---

### 4.2 `fn_pausar_sesion_app(p_session_id UUID, p_delta_segundos INTEGER) -> VOID`

**Cuando se llama:** foco perdido, visibilidad oculta, app a background, idle 2 min.

**Logica del `p_delta_segundos`:**
- Pausa por foco/visibility: `delta = segundos activos desde ultima reanudacion`
- Pausa por idle 2 min: `delta = segundos activos desde ultima reanudacion - 105` (penalizacion)
- Si delta < 0, se pasa 0 (el backend hace `GREATEST(0, ...)` como safeguard)

```sql
CREATE OR REPLACE FUNCTION public.fn_pausar_sesion_app(
    p_session_id UUID,
    p_delta_segundos INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    UPDATE p_app_sessions
    SET status = 'paused',
        paused_at = now(),
        ended_at = now(),
        total_active_seconds = total_active_seconds + GREATEST(0, p_delta_segundos),
        updated_at = now()
    WHERE session_id = p_session_id
      AND user_id = v_user_id
      AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_session_not_active", "params": {}}';
    END IF;
END;
$function$;
```

---

### 4.3 `fn_reanudar_sesion_app(p_session_id UUID) -> VOID`

**Cuando se llama:** foco recuperado, visibilidad visible, app a foreground, interaccion detectada post-idle.

```sql
CREATE OR REPLACE FUNCTION public.fn_reanudar_sesion_app(
    p_session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    UPDATE p_app_sessions
    SET status = 'active',
        started_at = now(),
        paused_at = NULL,
        ended_at = NULL,
        updated_at = now()
    WHERE session_id = p_session_id
      AND user_id = v_user_id
      AND status = 'paused';

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_session_not_paused", "params": {}}';
    END IF;
END;
$function$;
```

---

### 4.4 `fn_finalizar_sesion_app(p_session_id UUID, p_delta_segundos INTEGER) -> VOID`

**Cuando se llama:** app se cierra (beforeunload), usuario se desconecta.

**Logica:**
1. Si la sesion esta `active`: suma los ultimos `p_delta_segundos` y cierra
2. Si la sesion esta `paused`: simplemente cierra (el tiempo ya estaba acumulado)
3. Actualiza `usuarios.total_usage_seconds` y `last_session_at`

```sql
CREATE OR REPLACE FUNCTION public.fn_finalizar_sesion_app(
    p_session_id UUID,
    p_delta_segundos INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
    v_total_session INTEGER;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- Si esta activa: acumular ultimos segundos y cerrar
    UPDATE p_app_sessions
    SET total_active_seconds = total_active_seconds + GREATEST(0, p_delta_segundos),
        ended_at = now(),
        status = 'completed',
        updated_at = now()
    WHERE session_id = p_session_id
      AND user_id = v_user_id
      AND status = 'active';

    -- Si estaba pausada: simplemente cerrar (tiempo ya acumulado)
    UPDATE p_app_sessions
    SET ended_at = now(),
        status = 'completed',
        updated_at = now()
    WHERE session_id = p_session_id
      AND user_id = v_user_id
      AND status = 'paused';

    -- Obtener total final de la sesion
    SELECT total_active_seconds INTO v_total_session
    FROM p_app_sessions
    WHERE session_id = p_session_id
      AND user_id = v_user_id;

    -- Actualizar agregados en usuarios (solo si hay tiempo que sumar)
    IF v_total_session IS NOT NULL AND v_total_session > 0 THEN
        UPDATE public.usuarios
        SET total_usage_seconds = total_usage_seconds + v_total_session,
            last_session_at = now()
        WHERE user_id = v_user_id;
    END IF;
END;
$function$;
```

---

### 4.5 `fn_marcar_crash_sesion(p_session_id UUID) -> VOID`

**Cuando se llama:** llamada por el frontend al iniciar si detecta que la sesion anterior quedo abierta y no se pudo cerrar (crash recovery manual como fallback). Nota: `fn_iniciar_sesion_app` ya hace crash recovery automatico, esta RPC es un fallback.

```sql
CREATE OR REPLACE FUNCTION public.fn_marcar_crash_sesion(
    p_session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    UPDATE p_app_sessions
    SET status = 'crashed',
        ended_at = COALESCE(updated_at, started_at),
        updated_at = now()
    WHERE session_id = p_session_id
      AND user_id = v_user_id
      AND status IN ('active', 'paused');
END;
$function$;
```

---

### 4.6 `fn_resumen_uso_app(p_desde DATE, p_hasta DATE) -> TABLE`

**Cuando se llama:** dashboard interno de administracion.

**Retorna:** totales diarios de sesiones por fecha en el rango especificado.

```sql
CREATE OR REPLACE FUNCTION public.fn_resumen_uso_app(
    p_desde DATE DEFAULT NULL,
    p_hasta DATE DEFAULT NULL
)
RETURNS TABLE (
    fecha DATE,
    total_sesiones BIGINT,
    total_segundos BIGINT,
    sesiones_completadas BIGINT,
    sesiones_crashed BIGINT,
    promedio_segundos DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    RETURN QUERY
    SELECT
        s.started_at::DATE AS fecha,
        COUNT(*) AS total_sesiones,
        COALESCE(SUM(s.total_active_seconds), 0) AS total_segundos,
        COUNT(*) FILTER (WHERE s.status = 'completed') AS sesiones_completadas,
        COUNT(*) FILTER (WHERE s.status = 'crashed') AS sesiones_crashed,
        COALESCE(AVG(s.total_active_seconds) FILTER (WHERE s.total_active_seconds > 0), 0) AS promedio_segundos
    FROM p_app_sessions s
    WHERE s.user_id = v_user_id
      AND (p_desde IS NULL OR s.started_at >= p_desde::TIMESTAMPTZ)
      AND (p_hasta IS NULL OR s.started_at < (p_hasta + INTERVAL '1 day')::TIMESTAMPTZ)
    GROUP BY s.started_at::DATE
    ORDER BY fecha DESC;
END;
$function$;
```

---

## 5. Frontend — Hook `useSessionTracker`

### Arquitectura

```
App.tsx
  |-- <AuthProvider>
  |-- <SessionTrackerProvider>    <-- NUEVO (monta el hook)
  |-- <ToastProvider>
  |-- <Router>
```

### Ciclo de vida

| Evento | Accion | RPC llamada |
|--------|--------|-------------|
| App mount / auth OK | Iniciar sesion | `fn_iniciar_sesion_app()` |
| `document.hidden = true` (visibilitychange) | Pausar | `fn_pausar_sesion_app(id, delta)` |
| `document.hidden = false` | Reanudar | `fn_reanudar_sesion_app(id)` |
| Idle 2 min sin interaccion | Pausar con penalizacion | `fn_pausar_sesion_app(id, delta - 105)` |
| Interaccion post-idle | Reanudar | `fn_reanudar_sesion_app(id)` |
| `beforeunload` / `pagehide` | Finalizar | `fn_finalizar_sesion_app(id, delta)` via `sendBeacon` |
| Capacitor `appStateChange` (background) | Pausar | `fn_pausar_sesion_app(id, delta)` |
| Capacitor `appStateChange` (foreground) | Reanudar | `fn_reanudar_sesion_app(id)` |

### Estado interno del hook

```typescript
interface SessionState {
  sessionId: string | null;      // UUID de la sesion activa
  activeStart: number | null;    // timestamp local (ms) de ultima reanudacion
  isIdle: boolean;               // true si el idle timer disparo
}
```

### Idle Timer

```
Reseteado cada vez que hay interaccion (mousemove, touchstart, keydown, scroll)
Si pasan 120s sin interaccion:
  1. Marcar isIdle = true
  2. Calcular delta = ahora - activeStart - 105
  3. Llamar fn_pausar_sesion_app(sessionId, max(0, delta))
  
Cuando se detecta interaccion y isIdle = true:
  1. Llamar fn_reanudar_sesion_app(sessionId)
  2. Resetear activeStart = ahora
  3. isIdle = false
```

### Persistencia del `session_id`

Guardado en `localStorage` como fallback. Al iniciar:
- Si hay un `session_id` en localStorage → llamar `fn_marcar_crash_sesion(oldId)` → limpiar → crear nueva sesion
- Esto es redundante con `fn_iniciar_sesion_app` (que ya hace crash recovery), pero sirve como doble seguridad

### `sendBeacon` para cierre confiable

`beforeunload` puede no dar tiempo a completar un `fetch`. Usar `navigator.sendBeacon()` para la llamada de finalizacion:

```typescript
const handleBeforeUnload = () => {
  const delta = calcDelta();
  const body = JSON.stringify({
    session_id: sessionId,
    delta_segundos: delta
  });
  navigator.sendBeacon(
    `${SUPABASE_URL}/rest/v1/rpc/fn_finalizar_sesion_app`,
    body
  );
};
```

---

## 6. i18n

Agregar a `src/locales/es.ts` (solo para errores del backend, no se muestra al usuario directamente):

```typescript
error_session_not_active: 'La sesion no esta activa',
error_session_not_paused: 'La sesion no esta pausada',
```

---

## 7. Actualizacion de Documentacion

Una vez aprobados y creados en Supabase:

1. Actualizar `funcionesSQL/` con cada nueva RPC
2. Agregar entradas en `start_info/indice de funciones.md`
3. Actualizar `start_info/tablas todas.md` con la nueva tabla

---

## 8. Orden de Ejecucion en Supabase

1. `ALTER TABLE public.usuarios ADD COLUMN ...` (primero, porque las RPCs lo referencian)
2. `CREATE TABLE public.p_app_sessions ...`
3. `CREATE INDEX ...`
4. RPCs en orden: `fn_iniciar_sesion_app`, `fn_pausar_sesion_app`, `fn_reanudar_sesion_app`, `fn_finalizar_sesion_app`, `fn_marcar_crash_sesion`, `fn_resumen_uso_app`

---

## 9. Riesgos y Consideraciones

| Riesgo | Mitigacion |
|--------|-----------|
| `beforeunload` no dispara la RPC de cierre | `sendBeacon` + crash recovery automatico en `fn_iniciar_sesion_app` |
| Sesiones zombie (app sin internet al cerrar) | `fn_iniciar_sesion_app` marca como `crashed` todas las anteriores |
| Clock drift frontend/backend | El frontend reporta `delta_segundos` (duracion), no timestamps absolutos |
| Acumulacion incorrecta por doble-fire de eventos | Check `status = 'active'` en WHERE de la RPC de pausa |
| `p_delta_segundos` negativo | `GREATEST(0, ...)` como safeguard en backend |
| Tabla crece indefinidamente | Futuro: politica de particionado por fecha + retencion (fuera de Fase 1) |
