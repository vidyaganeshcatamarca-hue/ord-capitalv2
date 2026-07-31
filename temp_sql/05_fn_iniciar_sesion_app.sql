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
