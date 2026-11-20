CREATE OR REPLACE FUNCTION public.fn_monto_asignable(p_estructura_egreso_id bigint, p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_mes date;
    v_libre numeric := 0;
    v_bolsa numeric := 0;
    v_deficit numeric := 0;
    v_asignable numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    v_mes := date_trunc('month', COALESCE(p_mes, public.fn_mes_ciclo(v_user_id, CURRENT_DATE)))::date;
    v_libre := GREATEST(COALESCE(public.fn_obtener_saldo_a_asignar(v_mes), 0), 0);
    v_bolsa := COALESCE(public.fn_disponible_transferible(p_estructura_egreso_id, v_mes), 0);
    v_deficit := GREATEST(-v_bolsa, 0);
    v_asignable := v_libre + v_deficit;

    RETURN jsonb_build_object(
        'mes', v_mes,
        'libre', v_libre,
        'bolsa', v_bolsa,
        'deficit', v_deficit,
        'asignable', v_asignable,
        'motivo', CASE WHEN v_deficit > 0 THEN 'cubre_deficit_y_reserva' ELSE 'reserva_todo' END,
        -- Lo que queda reservado despues de asignar: tiene que ser exactamente lo libre.
        'reserva_resultante', v_bolsa + v_asignable
    );
END;
$function$
