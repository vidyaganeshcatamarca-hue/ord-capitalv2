CREATE OR REPLACE FUNCTION public.fn_reporte_safe_to_spend()
 RETURNS TABLE(saldo_operativo numeric, blindaje_fijos_7d numeric, blindaje_deudas_7d numeric, capital_libre_semana numeric, dias_restantes_mes integer, safe_to_spend_diario numeric, umbral_deseo_diario numeric, estado_semaforo_key text, mensaje_sistema_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint; v_cotizacion_usd numeric; v_moneda_local text; v_saldo_operativo numeric := 0; v_gasto_nec_30d numeric := 0; v_gasto_des_30d numeric := 0;
    v_blindaje_fijos numeric := 0; v_blindaje_deudas numeric := 0; v_deudas_cuotas numeric := 0; v_deudas_tarjetas numeric := 0;
    v_capital_libre numeric := 0; v_dias_restantes int; v_safe_to_spend numeric := 0; v_umbral_deseo numeric := 0; v_estado text; v_mensaje_key text;
    v_f_inicio date; v_f_fin date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);

    -- La cotizacion que sirve es la del dolar EN LA MONEDA LOCAL del usuario, no la fila 'USD'
    -- (que vale 1 por definicion). Antes se leia 'USD' y los saldos en dolares se sumaban 1:1.
    SELECT r.moneda_default::text INTO v_moneda_local
    FROM p_config_region r WHERE r.user_id = v_user_id;

    SELECT p.valor_por_usd INTO v_cotizacion_usd
    FROM p_divisas p
    WHERE p.nombre = COALESCE(v_moneda_local, 'USD')
    ORDER BY p.ultima_actualizacion DESC LIMIT 1;
    v_cotizacion_usd := COALESCE(v_cotizacion_usd, 1.00);
    SELECT COALESCE(SUM(CASE WHEN moneda = 'USD' THEN saldo_actual * v_cotizacion_usd ELSE saldo_actual END), 0) INTO v_saldo_operativo FROM p_billeteras WHERE user_id = v_user_id AND es_fondo_prevision = false;
    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_gasto_nec_30d FROM p_caja c JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'need' AND c.fecha >= CURRENT_DATE - INTERVAL '30 days';
    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_gasto_des_30d FROM p_caja c JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'want' AND c.fecha >= CURRENT_DATE - INTERVAL '30 days';

    v_blindaje_fijos := (v_gasto_nec_30d / 30.0) * 7.0; v_umbral_deseo := v_gasto_des_30d / 30.0;
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_deudas_cuotas FROM p_cuotas_detalle WHERE user_id = v_user_id AND pagado = false AND fecha_estimada_pago BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days';

    SELECT COALESCE(SUM(ct.monto_cuota), 0) INTO v_deudas_tarjetas
    FROM p_compromisos_tarjeta ct
    JOIN p_tarjetas_credito t ON ct.tarjeta_id = t.tarjeta_id
    WHERE ct.user_id = v_user_id
      AND ct.mes_periodo = date_trunc('month', CURRENT_DATE)
      AND t.dia_vencimiento IS NOT NULL
      AND (date_trunc('month', CURRENT_DATE) + ((t.dia_vencimiento - 1) * INTERVAL '1 day'))::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days';

    v_blindaje_deudas := v_deudas_cuotas + v_deudas_tarjetas;
    v_capital_libre := v_saldo_operativo - v_blindaje_fijos - v_blindaje_deudas;

    v_dias_restantes := (v_f_fin - CURRENT_DATE) + 1;
    IF v_dias_restantes <= 0 THEN v_dias_restantes := 1; END IF;

    IF v_capital_libre > 0 THEN v_safe_to_spend := v_capital_libre / v_dias_restantes; ELSE v_safe_to_spend := 0; END IF;

    IF v_safe_to_spend <= 0 THEN v_estado := 'red'; v_mensaje_key := 'msg_safe_to_spend_red';
    ELSIF v_safe_to_spend < v_umbral_deseo THEN v_estado := 'yellow'; v_mensaje_key := 'msg_safe_to_spend_yellow';
    ELSE v_estado := 'green'; v_mensaje_key := 'msg_safe_to_spend_green'; END IF;

    RETURN QUERY SELECT v_saldo_operativo, v_blindaje_fijos, v_blindaje_deudas, v_capital_libre, v_dias_restantes, v_safe_to_spend, v_umbral_deseo, v_estado, v_mensaje_key;
END;
$function$

-- NOTA: H2a: la cotizacion se busca en la moneda local del usuario, no en la fila USD (que vale 1). Funcion unica: el overload legado con p_user_id uuid se elimino el 2026-10-12.
