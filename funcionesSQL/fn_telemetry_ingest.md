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
