CREATE OR REPLACE FUNCTION public.fn_reporte_feed_compartido(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(evento_id text, tipo_evento text, fecha timestamp with time zone, usuario_nombre text, usuario_inicial text, categoria_nombre text, categoria_icono text, monto numeric, detalle text, impacto_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    IF v_hogar_id IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT * FROM (
        SELECT 
            ('caja_' || c.p_caja_id)::text AS evento_id,
            'gasto_compartido'::text AS tipo_evento,
            c.fecha::timestamp AS fecha,
            u.nombre::text AS usuario_nombre,
            upper(substr(u.nombre, 1, 1))::text AS usuario_inicial,
            COALESCE(e.nombre_cuenta, 'no_category')::text AS categoria_nombre,
            COALESCE(e.icono, '💸')::text AS categoria_icono,
            c.valor_egreso AS monto,
            c.detalle,
            NULL::numeric AS impacto_balance
        FROM p_caja c
        LEFT JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        LEFT JOIN usuarios u ON c.pagado_por_user_id = u.user_id
        WHERE c.hogar_id = v_hogar_id
          AND c.es_compartido = true
          AND c.tipo = 'expense'

        UNION ALL

        SELECT 
            ('conc_' || hc.conciliacion_id)::text AS evento_id,
            'conciliacion'::text AS tipo_evento,
            hc.creado_at AS fecha,
            u.nombre::text AS usuario_nombre,
            upper(substr(u.nombre, 1, 1))::text AS usuario_inicial,
            CASE 
                WHEN hc.tipo = 'transferencia_real' THEN 'transferencia_real'
                WHEN hc.tipo = 'marcar_saldado' THEN 'marcar_saldado'
                WHEN hc.tipo = 'disolucion' THEN 'disolucion'
                ELSE 'conciliacion'
            END::text AS categoria_nombre,
            '🤝'::text AS categoria_icono,
            hc.monto_saldado AS monto,
            hc.nota AS detalle,
            hc.monto_saldado AS impacto_balance
        FROM p_hogar_conciliaciones hc
        LEFT JOIN usuarios u ON hc.creado_por_user_id = u.user_id
        WHERE hc.hogar_id = v_hogar_id
    ) AS eventos
    ORDER BY eventos.fecha DESC, eventos.evento_id DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$
