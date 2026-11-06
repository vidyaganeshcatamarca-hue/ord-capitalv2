CREATE OR REPLACE FUNCTION public.fn_pausar_sesion_app(p_session_id uuid, p_delta_segundos integer DEFAULT 0)
 RETURNS void
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

    -- Idempotente: otra pestaña puede haber pausado ya la misma sesión
    -- (localStorage compartido entre pestañas del mismo origen). No-op.
    IF NOT FOUND THEN
        RETURN;
    END IF;
END;
$function$
