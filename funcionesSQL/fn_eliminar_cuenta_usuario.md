CREATE OR REPLACE FUNCTION public.fn_eliminar_cuenta_usuario(p_confirmacion_texto text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
    v_deleted_at TIMESTAMPTZ;
    v_programmed_deletion TIMESTAMPTZ;
BEGIN
    -- 1. Validar usuario
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Validar texto de confirmación
    IF p_confirmacion_texto IS DISTINCT FROM 'DELETE' THEN
        RAISE EXCEPTION '{"key": "error_confirmation_invalid", "params": {}}';
    END IF;

    -- 3. Verificar que no esté ya programado
    SELECT deleted_at INTO v_deleted_at FROM public.usuarios WHERE user_id = v_user_id;
    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION '{"key": "error_account_already_scheduled", "params": {}}';
    END IF;

    -- 4. Calcular fecha de borrado (30 días desde ahora)
    v_programmed_deletion := now() + INTERVAL '30 days';

    -- 5. Marcar cuenta para borrado (soft delete)
    UPDATE public.usuarios
    SET
        deleted_at = v_programmed_deletion,
        estado_cuenta = 'pendiente_eliminacion'
    WHERE user_id = v_user_id;

    -- 6. Invalidar sesión (opcional - fuerza logout)
    -- El frontend debe llamar a supabase.auth.signOut() tras confirmar

    RETURN v_programmed_deletion;
END;
$function$
