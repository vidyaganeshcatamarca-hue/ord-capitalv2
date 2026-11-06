CREATE OR REPLACE FUNCTION public.fn_limpieza_cuentas_eliminadas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_count INTEGER := 0;
    v_user RECORD;
BEGIN
    -- Buscar cuentas con 30+ días de soft-delete
    FOR v_user IN
        SELECT user_id, auth_id
        FROM public.usuarios
        WHERE deleted_at IS NOT NULL
          AND deleted_at <= now() - INTERVAL '30 days'
    LOOP
        -- 1. Eliminar usuario de auth (requiere Service Role)
        -- NOTA: Esta operación debe hacerse vía Edge Function con Service Role
        -- Aquí solo limpiamos las tablas del schema público

        -- 2. Eliminar en cascada (ON DELETE CASCADE debería manejar esto)
        DELETE FROM public.p_caja WHERE user_id = v_user.user_id;
        DELETE FROM public.p_billeteras WHERE user_id = v_user.user_id;
        DELETE FROM public.p_presupuestos WHERE user_id = v_user.user_id;
        DELETE FROM public.p_estructuras_egresos WHERE user_id = v_user.user_id;
        DELETE FROM public.p_inversiones WHERE user_id = v_user.user_id;
        DELETE FROM public.p_tarjetas_credito WHERE user_id = v_user.user_id;
        DELETE FROM public.p_prestamos WHERE user_id = v_user.user_id;
        DELETE FROM public.p_notificaciones_config WHERE user_id = v_user.user_id;
        DELETE FROM public.p_notificaciones_enviadas WHERE user_id = v_user.user_id;
        DELETE FROM public.p_preferencias_usuario WHERE user_id = v_user.user_id;
        DELETE FROM public.p_config_region WHERE user_id = v_user.user_id;
        DELETE FROM public.p_feedback_usuario WHERE user_id = v_user.user_id;

        -- 3. Eliminar registro de usuarios
        DELETE FROM public.usuarios WHERE user_id = v_user.user_id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$