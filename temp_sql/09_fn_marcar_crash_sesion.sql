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
