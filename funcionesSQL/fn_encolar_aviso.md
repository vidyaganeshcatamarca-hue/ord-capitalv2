CREATE OR REPLACE FUNCTION public.fn_encolar_aviso(p_user_id bigint, p_tipo text, p_categoria text DEFAULT NULL::text, p_familia text DEFAULT 'operativo'::text, p_titulo text DEFAULT NULL::text, p_mensaje text DEFAULT NULL::text, p_canal text DEFAULT 'in_app'::text, p_referencia_id bigint DEFAULT NULL::bigint, p_metadata jsonb DEFAULT '{}'::jsonb, p_prioridad smallint DEFAULT 50, p_dedupe_key text DEFAULT NULL::text, p_expira_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_config jsonb;
    v_id     bigint;
BEGIN
    IF p_user_id IS NULL OR p_tipo IS NULL OR p_familia NOT IN ('operativo', 'engage') THEN
        RAISE EXCEPTION '{"key": "error_notification_payload_invalid", "params": {}}';
    END IF;

    IF p_categoria IS NOT NULL THEN
        SELECT to_jsonb(c) INTO v_config
        FROM public.p_notificaciones_config c
        WHERE c.user_id = p_user_id;

        IF v_config IS NOT NULL
           AND (v_config ->> ('cat_' || p_categoria)) IS NOT NULL
           AND (v_config ->> ('cat_' || p_categoria))::boolean IS FALSE THEN
            RETURN NULL;
        END IF;
    END IF;

    -- Idempotente, pero ademas REACTIVA: si el hecho sigue vigente, la fila
    -- vuelve a estar sin leer y con la expiracion nueva en vez de crear otra.
    -- Sin esto el mismo hecho encolaba una fila por corrida y las viejas
    -- quedaban en la bandeja para siempre.
    IF p_dedupe_key IS NOT NULL THEN
        SELECT notificacion_id INTO v_id
        FROM public.p_notificaciones_enviadas
        WHERE user_id = p_user_id AND dedupe_key = p_dedupe_key
        LIMIT 1;

        IF v_id IS NOT NULL THEN
            UPDATE public.p_notificaciones_enviadas
               SET enviado_at     = now(),
                   expira_at      = p_expira_at,
                   leida          = false,
                   leida_at       = NULL,
                   pausada_hasta  = NULL,
                   prioridad      = p_prioridad,
                   metadata       = COALESCE(p_metadata, metadata)
             WHERE notificacion_id = v_id;
            RETURN v_id;
        END IF;
    END IF;

    INSERT INTO public.p_notificaciones_enviadas (
        user_id, tipo_notificacion, categoria, familia, titulo, mensaje, canal,
        referencia_id, metadata, prioridad, dedupe_key, expira_at
    ) VALUES (
        p_user_id, p_tipo, p_categoria, p_familia,
        COALESCE(p_titulo, ''), COALESCE(p_mensaje, ''), p_canal,
        p_referencia_id, COALESCE(p_metadata, '{}'::jsonb), p_prioridad, p_dedupe_key, p_expira_at
    )
    RETURNING notificacion_id INTO v_id;

    RETURN v_id;
END;
$function$;
