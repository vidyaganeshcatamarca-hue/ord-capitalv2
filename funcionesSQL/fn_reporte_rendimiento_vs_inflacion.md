CREATE OR REPLACE FUNCTION public.fn_reporte_rendimiento_vs_inflacion()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_total_actual numeric := 0;
    v_total_original numeric := 0;
    v_rendimiento_nominal numeric := 0;
    v_inflacion_6m numeric := 0;
    v_rendimiento_real numeric := 0;
    v_config_inflacion RECORD;
    v_inflacion_disponible boolean := false;
    v_mensaje_key text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- Esquema real: monto_invertido_original, valor_mercado_actual, estado='activa'
    SELECT
        COALESCE(SUM(
            CASE
                WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                WHEN i.tasa_anual_tna > 0 THEN
                    i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                ELSE i.monto_invertido_original
            END
        ), 0),
        COALESCE(SUM(i.monto_invertido_original), 0)
    INTO v_total_actual, v_total_original
    FROM p_inversiones i
    WHERE i.user_id = v_user_id AND i.estado = 'activa';

    IF v_total_original = 0 THEN
        RETURN jsonb_build_object(
            'sin_inversiones', true,
            'mensaje_key', 'msg_no_investments'
        );
    END IF;

    v_rendimiento_nominal := ((v_total_actual - v_total_original) / v_total_original) * 100;

    -- Intentar leer config de inflación (puede no existir)
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
        v_inflacion_disponible := true;
        v_inflacion_6m := v_config_inflacion.inflacion_acumulada_6m;
        v_rendimiento_real := ((1 + (v_rendimiento_nominal / 100)) / (1 + (v_inflacion_6m / 100)) - 1) * 100;
    END IF;

    IF NOT v_inflacion_disponible THEN
        v_mensaje_key := 'msg_configure_inflation';
    ELSIF v_rendimiento_real > 0 THEN
        v_mensaje_key := 'msg_portfolio_beat_inflation';
    ELSE
        v_mensaje_key := 'msg_portfolio_lost_purchasing_power';
    END IF;

    RETURN jsonb_build_object(
        'sin_inversiones', false,
        'total_actual', ROUND(v_total_actual, 2),
        'total_original', ROUND(v_total_original, 2),
        'rendimiento_nominal', ROUND(v_rendimiento_nominal, 2),
        'inflacion_disponible', v_inflacion_disponible,
        'inflacion_6m', CASE WHEN v_inflacion_disponible THEN ROUND(v_inflacion_6m, 2) ELSE NULL END,
        'rendimiento_real', CASE WHEN v_inflacion_disponible THEN ROUND(v_rendimiento_real, 2) ELSE NULL END,
        'fuente_inflacion', COALESCE(v_config_inflacion.fuente_inflacion, 'desactivado'),
        'mensaje_key', v_mensaje_key
    );
END;
$function$
