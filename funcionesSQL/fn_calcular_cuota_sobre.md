CREATE OR REPLACE FUNCTION public.fn_calcular_cuota_sobre(p_billetera_id bigint)
 RETURNS TABLE(monto_meta numeric, saldo_actual numeric, monto_faltante numeric, meses_restantes integer, cuota_sugerida numeric, estado_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_meta numeric;
    v_saldo numeric;
    v_fecha_obj date;
    v_meses int;
    v_faltante numeric;
    v_cuota numeric;
    v_estado text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    SELECT monto_meta, saldo_actual, fecha_objetivo INTO v_meta, v_saldo, v_fecha_obj
    FROM p_billeteras
    WHERE billetera_id = p_billetera_id AND es_fondo_prevision = true
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND es_compartida = true AND user_id IN (SELECT user_id FROM p_hogar_participantes WHERE hogar_id = v_hogar_id)));

    IF NOT FOUND THEN RAISE EXCEPTION '{"key": "error_savings_fund_not_found", "params": {}}'; END IF;

    v_faltante := GREATEST(v_meta - v_saldo, 0);
    v_meses := GREATEST((EXTRACT(YEAR FROM age(v_fecha_obj, CURRENT_DATE)) * 12 + EXTRACT(MONTH FROM age(v_fecha_obj, CURRENT_DATE)))::int, 1);
    v_cuota := CEIL(v_faltante / v_meses);

    IF v_saldo >= v_meta THEN
        v_estado := 'state_fulfilled';
    ELSIF v_fecha_obj < CURRENT_DATE THEN
        v_estado := 'state_overdue';
    ELSIF v_meses <= 2 AND (v_saldo / v_meta) < 0.5 THEN
        v_estado := 'state_critical';
    ELSE
        v_estado := 'state_in_progress';
    END IF;

    RETURN QUERY SELECT v_meta, v_saldo, v_faltante, v_meses, v_cuota, v_estado;
END;
$function$