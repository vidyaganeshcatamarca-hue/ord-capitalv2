CREATE OR REPLACE FUNCTION public.fn_reporte_podadora_bcg()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_candidatos jsonb;
    v_metas jsonb;
    v_tiene_metas boolean;
    v_arsenal numeric;
    v_deuda_total numeric;
    v_burn_supervivencia numeric;
    v_escudo_actual int;
    v_cotizacion_usd numeric;
BEGIN
    -- 1. Identidad
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- 2. Cotización USD (Fallback)
    SELECT COALESCE((SELECT valor_por_usd FROM p_divisas WHERE nombre = 'USD' ORDER BY ultima_actualizacion DESC LIMIT 1), 1.00) INTO v_cotizacion_usd;

    -- 3. CANDIDATOS A LA GUILLONTINA (Placer <= 5 Y Flexibilidad >= 6)
    SELECT COALESCE(json_agg(json_build_object(
        'estructura_id', e.estructura_id,
        'nombre', e.nombre_cuenta,
        'icono', e.icono,
        'color', e.color,
        'gasto_prom_90d', ROUND(COALESCE(g.promedio, 0), 2),
        'utilidad_placer', e.utilidad_placer,
        'flexibilidad_recorte', e.flexibilidad_recorte
    )), '[]'::jsonb) INTO v_candidatos
    FROM p_estructuras_egresos e
    LEFT JOIN (
        SELECT estructura_egreso_id, SUM(valor_egreso) / 3.0 as promedio -- Promedio mensual basado en 90 días
        FROM p_caja
        WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY estructura_egreso_id
    ) g ON e.estructura_id = g.estructura_egreso_id
    WHERE e.user_id = v_user_id 
      AND e.utilidad_placer <= 5 
      AND e.flexibilidad_recorte >= 6
      AND COALESCE(g.promedio, 0) > 0; -- Solo mostrar si hay gasto real

    -- 4. METAS (Sobres de Previsión / Fase 12)
    SELECT COALESCE(json_agg(json_build_object(
        'billetera_id', b.billetera_id,
        'nombre', b.nombre,
        'monto_meta', b.monto_meta,
        'saldo_actual', b.saldo_actual,
        'dias_restantes', GREATEST(b.fecha_objetivo - CURRENT_DATE, 0)
    )), '[]'::jsonb) INTO v_metas
    FROM p_billeteras b
    WHERE b.user_id = v_user_id AND b.es_fondo_prevision = true AND b.activa = true;

    v_tiene_metas := (SELECT COUNT(*) FROM p_billeteras WHERE user_id = v_user_id AND es_fondo_prevision = true AND activa = true) > 0;

    -- 5. LÍNEA BASE (Para que el Frontend calcule el Delta del Escudo)
    -- Arsenal
    SELECT COALESCE(SUM(CASE WHEN moneda = 'USD' THEN saldo_actual * v_cotizacion_usd ELSE saldo_actual END), 0) INTO v_arsenal FROM p_billeteras WHERE user_id = v_user_id;
    
    -- Deuda Total (Simplificada para el juego)
    SELECT COALESCE(SUM(monto_total_deuda - monto_pagado_acumulado), 0) INTO v_deuda_total FROM p_prestamos WHERE user_id = v_user_id AND tipo_flujo = 'debo' AND estado != 'cancelado';
    v_deuda_total := v_deuda_total + COALESCE((SELECT SUM(monto_cuota) FROM p_cuotas_detalle WHERE user_id = v_user_id AND pagado = false), 0);

    -- Burn Rate Supervivencia (Promedio diario de necesidades últimos 90 días)
    SELECT COALESCE(SUM(c.valor_egreso), 0) / 90.0 INTO v_burn_supervivencia
    FROM p_caja c
    JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'need' AND c.fecha >= CURRENT_DATE - INTERVAL '90 days';
    
    IF v_burn_supervivencia <= 0 THEN v_burn_supervivencia := 1; END IF; -- Evitar división por cero

    -- Escudo Actual
    v_escudo_actual := GREATEST(((v_arsenal - v_deuda_total) / v_burn_supervivencia)::int, 0);

    -- 6. EMPAQUETAR Y RETORNAR JSON
    RETURN jsonb_build_object(
        'candidatos', v_candidatos,
        'metas', v_metas,
        'tiene_metas', v_tiene_metas,
        'linea_base', jsonb_build_object(
            'arsenal_total', v_arsenal,
            'deuda_total', v_deuda_total,
            'burn_rate_supervivencia', v_burn_supervivencia,
            'escudo_dias_actual', v_escudo_actual
        )
    );
END;
$function$
