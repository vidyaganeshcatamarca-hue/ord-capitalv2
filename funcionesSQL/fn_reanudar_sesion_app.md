CREATE OR REPLACE FUNCTION public.fn_reanudar_sesion_app(p_session_id uuid)
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
    SET status = 'active',
        started_at = now(),
        paused_at = NULL,
        ended_at = NULL,
        updated_at = now()
    WHERE session_id = p_session_id
      AND user_id = v_user_id
      AND status = 'paused';

    -- Idempotente: otra pestaña puede haber reanudado ya la misma sesión. No-op.
    IF NOT FOUND THEN
        RETURN;
    END IF;
END;
$function$
