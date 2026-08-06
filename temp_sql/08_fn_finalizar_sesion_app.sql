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
