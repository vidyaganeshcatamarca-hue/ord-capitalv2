CREATE OR REPLACE FUNCTION public.fn_reporte_bola_nieve_estrategia(p_estrategia text DEFAULT 'math'::text)
 RETURNS TABLE(deuda_id bigint, nombre_deuda text, tipo_deuda text, saldo_actual numeric, tna numeric, cuota_mensual numeric, vencimiento_proximo date, prioridad integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT p.prestamo_id, p.nombre_prestamo, p.tipo_deuda, p.saldo_actual, p.tasa_anual_tna, p.cuota_mensual, p.proximo_vencimiento,
        ROW_NUMBER() OVER (
            ORDER BY 
                CASE WHEN p_estrategia = 'math' THEN p.tasa_anual_tna ELSE 0 END DESC,
                CASE WHEN p_estrategia = 'emotional' THEN p.saldo_actual ELSE 0 END ASC,
                CASE WHEN p_estrategia = 'relationships' THEN CASE WHEN p.tipo_deuda = 'personal' THEN 0 ELSE 1 END ELSE 0 END ASC
        )::int
    FROM p_prestamos p WHERE p.user_id = v_user_id AND p.estado = 'activo' ORDER BY prioridad;
END;
$function$