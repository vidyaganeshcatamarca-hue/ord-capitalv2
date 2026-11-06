CREATE OR REPLACE FUNCTION public.fn_obtener_saldo_a_asignar(p_mes_periodo date)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_f_inicio date;
    v_f_fin date;
    v_dia_ancla int2;
    v_moneda_local text;
    v_total_ingresos numeric := 0;
    v_total_asignado numeric := 0;
    v_total_tarjetas numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- Sin pais confirmado no hay moneda principal contra la cual comparar: 0 explicito.
    v_moneda_local := public.fn_get_default_currency(v_user_id);
    IF v_moneda_local IS NULL THEN
        RETURN 0;
    END IF;

    SELECT dia_ancla_ciclo INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;
    IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;

    v_f_inicio := date_trunc('month', p_mes_periodo) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin := (v_f_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- 1. Liquidez Total (solo billeteras normales activas de la MONEDA PRINCIPAL)
    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_total_ingresos
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false AND moneda = v_moneda_local;

    -- 2. Dinero ya comprometido en sobres: SOLO los saldos positivos.
    -- Ronda 7 (S1): antes se sumaba monto_disponible completo, y como un sobre en
    -- rojo es negativo, restarlo SUMABA liquidez inexistente (7.358.752 sobre
    -- 2.627.275 reales para el user 1). El sobregasto no se resta porque el gasto
    -- ya salio de la billetera: se muestra como alerta, no como plata disponible.
    SELECT COALESCE(SUM(GREATEST(monto_disponible, 0)), 0) INTO v_total_asignado
    FROM public.fn_reporte_sobres_detalle(p_mes_periodo)
    WHERE cuenta_en_totales;

    -- 3. Tarjetas impagas hasta el fin del ciclo actual
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_total_tarjetas
    FROM p_cuotas_detalle
    WHERE user_id = v_user_id AND pagado = false AND fecha_estimada_pago <= v_f_fin;

    RETURN v_total_ingresos - v_total_asignado - v_total_tarjetas;
END;
$function$

-- NOTA: Guard explicito: sin pais confirmado devuelve 0 en lugar de comparar contra NULL.
-- NOTA (ronda 8): el espejo estaba desactualizado; se copio la definicion viva, que es
-- la que incluye el fix de la ronda 7 (GREATEST + cuenta_en_totales).
