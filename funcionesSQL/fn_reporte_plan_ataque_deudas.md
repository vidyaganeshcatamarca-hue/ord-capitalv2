CREATE OR REPLACE FUNCTION public.fn_reporte_plan_ataque_deudas(p_lente text)
 RETURNS TABLE(deuda_id text, tipo_deuda text, nombre_acreedor text, saldo_pendiente numeric, tasa_virtual numeric, es_vinculo boolean, sugerencia_categoria text, sugerencia_icono text, sugerencia_monto_libre numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_sug_cat text;
    v_sug_ico text;
    v_sug_monto numeric := 0;
BEGIN
    -- 1. Identidad
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- 2. Buscar la Sugerencia de la Podadora BCG (El gasto "Perro" más caro)
    SELECT e.nombre_cuenta, e.icono, COALESCE(SUM(c.valor_egreso) / 3.0, 0)
    INTO v_sug_cat, v_sug_ico, v_sug_monto
    FROM p_caja c
    JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha >= CURRENT_DATE - INTERVAL '90 days'
      AND e.utilidad_placer <= 5 AND e.flexibilidad_recorte >= 6
    GROUP BY e.estructura_id, e.nombre_cuenta, e.icono
    ORDER BY SUM(c.valor_egreso) DESC LIMIT 1;

    -- 3. Consolidar y Ordenar Deudas
    RETURN QUERY
    WITH deudas_unificadas AS (
        -- A. Préstamos Personales
        SELECT 
            ('prestamo_' || prestamo_id)::text as d_id,
            'prestamo'::text as d_tipo,
            entidad_nombre as d_nombre,
            (monto_total_deuda - monto_pagado_acumulado) as d_saldo,
            50.00 as d_tasa, -- Tasa asumida para préstamos
            (tipo_entidad = 'tercero') as d_vinculo
        FROM p_prestamos
        WHERE user_id = v_user_id AND tipo_flujo = 'debo' AND estado != 'cancelado'
          AND (monto_total_deuda - monto_pagado_acumulado) > 0

        UNION ALL

        -- B. Tarjetas de Crédito (Pasivos)
        SELECT 
            ('tarjeta_' || t.tarjeta_id)::text as d_id,
            'tarjeta'::text as d_tipo,
            t.nombre_tarjeta as d_nombre,
            COALESCE(SUM(ct.monto_cuota), 0) + COALESCE((SELECT SUM(cd.monto_cuota) FROM p_cuotas_detalle cd WHERE cd.tarjeta_id = t.tarjeta_id AND cd.pagado = false), 0) as d_saldo,
            150.00 as d_tasa, -- Tasa Tóxica Virtual
            false as d_vinculo
        FROM p_tarjetas_credito t
        LEFT JOIN p_compromisos_tarjeta ct ON t.tarjeta_id = ct.tarjeta_id AND ct.mes_periodo >= date_trunc('month', (SELECT fecha_inicio FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE)))
        WHERE t.user_id = v_user_id
        GROUP BY t.tarjeta_id, t.nombre_tarjeta
        HAVING (COALESCE(SUM(ct.monto_cuota), 0) + COALESCE((SELECT SUM(cd.monto_cuota) FROM p_cuotas_detalle cd WHERE cd.tarjeta_id = t.tarjeta_id AND cd.pagado = false), 0)) > 0
    )
    SELECT 
        d.d_id, d.d_tipo, d.d_nombre, d.d_saldo, d.d_tasa, d.d_vinculo,
        v_sug_cat, v_sug_ico, v_sug_monto
    FROM deudas_unificadas d
    ORDER BY 
        -- Lente Vínculos: Prioriza terceros
        CASE WHEN p_lente = 'vinculos' AND d.d_vinculo THEN 0 ELSE 1 END ASC,
        -- Lente Matemático: Prioriza Tasa (Tarjetas primero)
        CASE WHEN p_lente = 'matematico' THEN d.d_tasa ELSE 0 END DESC,
        -- Lente Emocional: Prioriza Saldo Menor (Bola de Nieve)
        CASE WHEN p_lente = 'emocional' THEN d.d_saldo ELSE 0 END ASC,
        -- Desempate Matemático: Entre préstamos (tasa 50), atacar el mayor primero
        CASE WHEN p_lente = 'matematico' AND d.d_tasa < 100 THEN d.d_saldo ELSE 0 END DESC,
        -- Fallback general
        d.d_saldo DESC;
END;
$function$
