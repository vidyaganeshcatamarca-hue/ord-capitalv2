CREATE OR REPLACE FUNCTION public.fn_eliminar_compromiso_tarjeta(p_tarjeta_id bigint, p_monto_total numeric, p_fecha_inicio date, p_cuotas integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_monto_cuota numeric; v_i integer; v_mes_periodo date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    v_monto_cuota := p_monto_total / p_cuotas;

    FOR v_i IN 0..(p_cuotas - 1) LOOP
        v_mes_periodo := date_trunc('month', p_fecha_inicio + (v_i || ' months')::interval);
        UPDATE p_compromisos_tarjeta SET monto_cuota = monto_cuota - v_monto_cuota WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id AND mes_periodo = v_mes_periodo;
        DELETE FROM p_compromisos_tarjeta WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id AND mes_periodo = v_mes_periodo AND monto_cuota <= 0;
    END LOOP;
END;
$function$