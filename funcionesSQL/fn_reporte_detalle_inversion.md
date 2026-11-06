CREATE OR REPLACE FUNCTION public.fn_reporte_detalle_inversion(p_inversion_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_inversion RECORD;
    v_historial jsonb;
    v_rendimiento_nominal numeric;
    v_rendimiento_real numeric;
    v_config_inflacion RECORD;
    v_valor_actual_teorico numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT * INTO v_inversion
    FROM p_inversiones
    WHERE inversion_id = p_inversion_id AND user_id = v_user_id;

    IF v_inversion.inversion_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_investment_not_found", "params": {}}';
    END IF;

    -- Calcular valor actual teórico
    v_valor_actual_teorico := CASE
        WHEN v_inversion.valor_mercado_actual IS NOT NULL THEN v_inversion.valor_mercado_actual
        WHEN v_inversion.tasa_anual_tna > 0 THEN
            v_inversion.monto_invertido_original + (v_inversion.monto_invertido_original * (v_inversion.tasa_anual_tna / 100) * (CURRENT_DATE - v_inversion.fecha_inicio) / 365)
        ELSE v_inversion.monto_invertido_original
    END;

    v_rendimiento_nominal := CASE
        WHEN v_inversion.monto_invertido_original > 0
        THEN ((v_valor_actual_teorico - v_inversion.monto_invertido_original) / v_inversion.monto_invertido_original) * 100
        ELSE 0
    END;

    -- Intentar leer config de inflación del usuario
    BEGIN
        SELECT * INTO v_config_inflacion FROM p_config_inflacion WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
        v_config_inflacion := NULL;
    END;

    IF v_config_inflacion IS NOT NULL
       AND v_config_inflacion.fuente_inflacion IS NOT NULL
       AND v_config_inflacion.fuente_inflacion != 'desactivado'
       AND COALESCE(v_config_inflacion.inflacion_acumulada_6m, 0) > 0
    THEN
        v_rendimiento_real := ((1 + (v_rendimiento_nominal / 100)) / (1 + (v_config_inflacion.inflacion_acumulada_6m / 100)) - 1) * 100;
    ELSE
        v_rendimiento_real := NULL;
    END IF;

    -- Historial de movimientos vinculados (busca por metadata->>'inversion_id')
    SELECT COALESCE(jsonb_agg(row_to_json(mov)), '[]'::jsonb) INTO v_historial
    FROM (
        SELECT c.fecha,
               c.detalle,
               CASE
                   WHEN c.tipo = 'expense' THEN -c.valor_egreso
                   WHEN c.tipo = 'income' THEN c.valor_ingreso
                   ELSE 0
               END AS monto
        FROM p_caja c
        WHERE c.user_id = v_user_id
          AND c.metadata->>'inversion_id' = p_inversion_id::text
        ORDER BY c.fecha DESC
    ) mov;

    RETURN jsonb_build_object(
        'inversion_id', v_inversion.inversion_id,
        'nombre_activo', v_inversion.nombre_activo,
        'tipo_activo', CASE WHEN v_inversion.tasa_anual_tna > 0 THEN 'plazo_fijo' ELSE 'variable' END,
        'monto_invertido_original', v_inversion.monto_invertido_original,
        'valor_actual_teorico', ROUND(v_valor_actual_teorico, 2),
        'valor_mercado_actual', v_inversion.valor_mercado_actual,
        'tasa_anual_tna', v_inversion.tasa_anual_tna,
        'moneda', COALESCE(v_inversion.moneda, 'ARS'),
        'ultima_conciliacion', v_inversion.ultima_conciliacion,
        'dias_desde_conciliacion', (CURRENT_DATE - v_inversion.ultima_conciliacion)::int,
        'estado_semaforo_key', CASE
            WHEN (CURRENT_DATE - v_inversion.ultima_conciliacion) <= 30 THEN 'green'
            WHEN (CURRENT_DATE - v_inversion.ultima_conciliacion) <= 45 THEN 'yellow'
            ELSE 'red'
        END,
        'estado_inversion', v_inversion.estado,
        'rendimiento_nominal', ROUND(v_rendimiento_nominal, 2),
        'rendimiento_real', CASE WHEN v_rendimiento_real IS NOT NULL THEN ROUND(v_rendimiento_real, 2) ELSE NULL END,
        'historial', v_historial
    );
END;
$function$
