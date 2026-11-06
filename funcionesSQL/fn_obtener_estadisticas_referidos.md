CREATE OR REPLACE FUNCTION public.fn_obtener_estadisticas_referidos()
 RETURNS TABLE(codigo_referido text, total_invitados bigint, total_onboarding_completado bigint, total_suscritos bigint, beneficio_estimado numeric, historial jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
    v_codigo TEXT;
    v_beneficio_por_suscrito NUMERIC := 10.00; -- USD o equivalente, configurable luego
BEGIN
    -- 1. Validar usuario
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Obtener código
    SELECT codigo_referido INTO v_codigo
    FROM public.p_referidos
    WHERE user_id_invitador = v_user_id
    LIMIT 1;

    IF v_codigo IS NULL THEN
        -- Si no tiene código aún, retornar valores vacíos
        RETURN QUERY SELECT NULL::TEXT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::NUMERIC, '[]'::JSONB;
        RETURN;
    END IF;

    -- 3. Retornar estadísticas agregadas
    RETURN QUERY
    SELECT
        v_codigo,
        COUNT(*) FILTER (WHERE user_id_invitado IS NOT NULL)::BIGINT,
        COUNT(*) FILTER (WHERE completado_onboarding = true)::BIGINT,
        COUNT(*) FILTER (WHERE suscrito_premium = true)::BIGINT,
        (COUNT(*) FILTER (WHERE suscrito_premium = true) * v_beneficio_por_suscrito)::NUMERIC,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'referido_id', r.referido_id,
                    'user_id_invitado', r.user_id_invitado,
                    'email_invitado', r.email_invitado,
                    'completado_onboarding', r.completado_onboarding,
                    'suscrito_premium', r.suscrito_premium,
                    'usado_at', r.usado_at
                )
                ORDER BY r.creado_at DESC
            ) FILTER (WHERE r.user_id_invitado IS NOT NULL),
            '[]'::jsonb
        )
    FROM public.p_referidos r
    WHERE r.user_id_invitador = v_user_id;
END;
$function$