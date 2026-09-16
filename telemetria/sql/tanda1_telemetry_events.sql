-- ============================================================================
-- Telemetría BASIC v1 — Tanda 1
-- p_telemetry_events (event store) + fn_telemetry_ingest (batch ingest RPC)
-- Plan: telemetria/PLAN_Telemetria_BASIC_v1.md (§2, §8.1, §8.2)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Event store de telemetría
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.p_telemetry_events (
    event_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          bigint NOT NULL,
    session_id       uuid REFERENCES public.p_app_sessions(session_id),
    event_name       text NOT NULL,
    event_timestamp  timestamptz NOT NULL DEFAULT now(),
    received_at      timestamptz NOT NULL DEFAULT now(),
    app_version      text,
    platform         text,
    schema_version   text NOT NULL DEFAULT 'basic_v1',
    priority         smallint NOT NULL DEFAULT 2,
    properties       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.p_telemetry_events IS
    'Telemetry event store (behavioral events only). No financial amounts, no user free text. Access via fn_telemetry_ingest (SECURITY DEFINER) or service_role.';

CREATE INDEX IF NOT EXISTS idx_telemetry_events_user_ts
    ON public.p_telemetry_events (user_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_name_ts
    ON public.p_telemetry_events (event_name, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_session
    ON public.p_telemetry_events (session_id);

-- RLS activado sin políticas: solo service_role y funciones SECURITY DEFINER.
ALTER TABLE public.p_telemetry_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Ingesta por lotes (único endpoint de escritura desde la app)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_telemetry_ingest(p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id     bigint;
    v_event       jsonb;
    v_props       jsonb;
    v_rowcount    int;
    v_accepted    int := 0;
    v_duplicates  int := 0;
    v_invalid     int := 0;
    v_max_events  constant int := 50;
    v_max_props   constant int := 2048;  -- bytes, guard per PRD §21.6
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
        RAISE EXCEPTION '{"key": "error_invalid_params", "params": {}}';
    END IF;

    FOR v_event IN
        SELECT e FROM jsonb_array_elements(p_events) AS e
        LIMIT v_max_events
    LOOP
        -- Validación mínima: nombre y timestamp obligatorios
        IF v_event->>'event_name' IS NULL OR v_event->>'event_timestamp' IS NULL THEN
            v_invalid := v_invalid + 1;
            CONTINUE;
        END IF;

        v_props := v_event->'properties';
        IF v_props IS NULL THEN
            v_props := '{}'::jsonb;
        END IF;

        -- Guard de payload: propiedades demasiado grandes se descartan
        IF pg_column_size(v_props) > v_max_props THEN
            v_invalid := v_invalid + 1;
            CONTINUE;
        END IF;

        INSERT INTO public.p_telemetry_events (
            event_id, user_id, session_id, event_name, event_timestamp,
            app_version, platform, schema_version, priority, properties
        ) VALUES (
            COALESCE((v_event->>'event_id')::uuid, gen_random_uuid()),
            v_user_id,
            (v_event->>'session_id')::uuid,
            LEFT(v_event->>'event_name', 64),
            (v_event->>'event_timestamp')::timestamptz,
            LEFT(v_event->>'app_version', 32),
            LEFT(v_event->>'platform', 16),
            LEFT(COALESCE(v_event->>'schema_version', 'basic_v1'), 32),
            LEAST(GREATEST(COALESCE((v_event->>'priority')::smallint, 2), 1), 3),
            v_props
        )
        ON CONFLICT (event_id) DO NOTHING;

        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        IF v_rowcount > 0 THEN
            v_accepted := v_accepted + v_rowcount;
        ELSE
            v_duplicates := v_duplicates + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'accepted',   v_accepted,
        'duplicates', v_duplicates,
        'invalid',    v_invalid
    );
END;
$function$;