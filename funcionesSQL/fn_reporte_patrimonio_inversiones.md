CREATE OR REPLACE FUNCTION public.fn_reporte_patrimonio_inversiones()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_moneda_local text;
    v_total_local numeric := 0;
    v_convertido numeric;
    v_totales jsonb := '[]'::jsonb;
    v_sin_cotizacion text[] := ARRAY[]::text[];
    v_fila RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- Moneda local del país confirmado; sin configuración regional, ARS (histórico).
    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_moneda_local
    FROM public.p_config_region r WHERE r.user_id = v_user_id;
    v_moneda_local := COALESCE(v_moneda_local, 'ARS');

    FOR v_fila IN
        SELECT COALESCE(i.moneda, 'ARS') AS moneda,
               COALESCE(SUM(
                   CASE
                       WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                       WHEN i.tasa_anual_tna > 0 THEN
                           i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                       ELSE i.monto_invertido_original
                   END
               ), 0) AS total
        FROM p_inversiones i
        WHERE i.user_id = v_user_id AND i.estado = 'activa'
        GROUP BY COALESCE(i.moneda, 'ARS')
        ORDER BY (COALESCE(i.moneda, 'ARS') = v_moneda_local) DESC, COALESCE(i.moneda, 'ARS')
    LOOP
        v_totales := v_totales || jsonb_build_object('moneda', v_fila.moneda, 'total', v_fila.total);
        v_convertido := NULL;
        IF v_fila.total <> 0 THEN
            SELECT c.valor INTO v_convertido FROM fn_valor_a_moneda_local(v_fila.total, v_fila.moneda, v_user_id) c;
            IF v_convertido IS NOT NULL THEN
                v_total_local := v_total_local + v_convertido;
            ELSE
                v_sin_cotizacion := v_sin_cotizacion || v_fila.moneda;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'moneda_local', v_moneda_local,
        'total_moneda_local', ROUND(v_total_local, 2),
        'totales_por_moneda', v_totales,
        'monedas_sin_cotizacion', to_jsonb(v_sin_cotizacion)
    );
END;
$function$;
BEGIN
    -- Sincronización explícita agregada con los tipos de salida de fn_reporte_estado_inversiones
    RETURN QUERY
    SELECT 
        COALESCE(SUM(valor_actual_teorico), 0)::numeric as total_pesos,
        COALESCE(SUM(valor_actual_teorico / p_cotizacion_usd), 0)::numeric as total_dolares
    FROM public.fn_reporte_estado_inversiones();
END; $function$