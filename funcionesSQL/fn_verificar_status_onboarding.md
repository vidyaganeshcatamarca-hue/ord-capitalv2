CREATE OR REPLACE FUNCTION public.fn_verificar_status_onboarding()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_has_wallets boolean;
    v_has_config boolean;
    v_consentimiento_aceptado boolean;
BEGIN
    -- 1. Comprobación del token y obtención del user_id bigint
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Verificar si tiene al menos una billetera activa
    SELECT EXISTS (
        SELECT 1 FROM public.p_billeteras WHERE user_id = v_user_id
    ) INTO v_has_wallets;

    -- 3. Verificar si existe configuración de presupuestos
    SELECT EXISTS (
        SELECT 1 FROM public.p_presupuestos_config WHERE user_id = v_user_id
    ) INTO v_has_config;

    -- 4. Verificar si aceptó el consentimiento legal
    --    (fuente nueva: log append-only; antes usuarios.consentimiento_legal_at)
    SELECT EXISTS (
        SELECT 1 FROM public.p_legal_consentimientos c
         WHERE c.user_id = v_user_id
           AND c.evento = 'aceptado'
    ) INTO v_consentimiento_aceptado;

    -- 5. Retornar un JSON con los estados detallados
    RETURN jsonb_build_object(
        'onboarding_completo', (v_has_wallets AND v_has_config),
        'tiene_billeteras', v_has_wallets,
        'tiene_config', v_has_config,
        'consentimiento_aceptado', v_consentimiento_aceptado
    );
END;
$function$

-- ============================================================
-- Migración a log legal (2026-10-09): el único cambio interno es el
-- check de consentimiento. Pasa de leer la columna
-- usuarios.consentimiento_legal_at a un EXISTS sobre el log append-only
-- p_legal_consentimientos con evento='aceptado' (sin acotar por versión:
-- equivale al "hay consentimiento" de la columna). El JSON de salida
-- queda idéntico:
--   { onboarding_completo, tiene_billeteras, tiene_config, consentimiento_aceptado }
-- ============================================================
