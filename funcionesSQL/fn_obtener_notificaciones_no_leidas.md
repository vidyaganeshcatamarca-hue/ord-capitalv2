CREATE OR REPLACE FUNCTION public.fn_obtener_notificaciones_no_leidas(p_limit integer DEFAULT 50)
 RETURNS TABLE(notificacion_id bigint, tipo_notificacion text, titulo text, mensaje text, canal text, referencia_id bigint, metadata jsonb, enviado_at timestamp with time zone, leida boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT 
        n.notificacion_id,
        n.tipo_notificacion,
        n.titulo,
        n.mensaje,
        n.canal,
        n.referencia_id,
        n.metadata,
        n.enviado_at,
        n.leida
    FROM public.p_notificaciones_enviadas n
    WHERE n.user_id = v_user_id
      AND (n.pausada_hasta IS NULL OR n.pausada_hasta < now())
    ORDER BY n.enviado_at DESC
    LIMIT p_limit;
END;
$function$