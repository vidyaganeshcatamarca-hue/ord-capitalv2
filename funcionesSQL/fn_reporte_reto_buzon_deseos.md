CREATE OR REPLACE FUNCTION public.fn_reporte_reto_buzon_deseos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_f_inicio date; v_f_fin date; v_total_hormigas numeric := 0; v_buzon_id bigint; v_buzon_nombre text; v_buzon_saldo numeric; v_mensaje_key text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto();

    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_total_hormigas FROM p_caja c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha BETWEEN v_f_inicio AND v_f_fin AND e.es_hormiga = true;

    SELECT billetera_id, nombre, saldo_actual INTO v_buzon_id, v_buzon_nombre, v_buzon_saldo FROM p_billeteras WHERE user_id = v_user_id AND es_fondo_prevision = true AND activa = true ORDER BY CASE WHEN nombre ILIKE '%buzón%' OR nombre ILIKE '%deseo%' THEN 0 ELSE 1 END, saldo_actual DESC LIMIT 1;

    IF v_total_hormigas = 0 THEN v_mensaje_key := 'msg_challenge_zero_ants';
    ELSIF v_buzon_id IS NULL THEN v_mensaje_key := 'msg_challenge_no_piggybank';
    ELSE v_mensaje_key := 'msg_challenge_transfer_to_piggybank'; END IF;

    RETURN jsonb_build_object(
        'total_hormigas_mes', ROUND(v_total_hormigas, 2),
        'cantidad_hormigas', (SELECT COUNT(*) FROM p_caja c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha BETWEEN v_f_inicio AND v_f_fin AND e.es_hormiga = true),
        'buzon_disponible', CASE WHEN v_buzon_id IS NOT NULL THEN true ELSE false END,
        'buzon_id', v_buzon_id, 'buzon_nombre', v_buzon_nombre, 'buzon_saldo_actual', v_buzon_saldo,
        'mensaje_key', v_mensaje_key
    );
END;
$function$
