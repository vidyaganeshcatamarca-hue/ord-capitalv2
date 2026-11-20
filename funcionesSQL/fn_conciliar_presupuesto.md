CREATE OR REPLACE FUNCTION public.fn_conciliar_presupuesto(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_modo text;
    v_dia_ancla int2;
    v_mes date;
    v_f_inicio date;
    v_f_fin date;
    v_moneda text;
    v_liquidez numeric := 0;
    v_reservas numeric := 0;
    v_cuotas numeric := 0;
    v_libre_calculado numeric := 0;
    v_libre_reportado numeric := 0;
    v_deficit numeric := 0;
    v_ajustes numeric := 0;
    v_descuadres jsonb := '[]'::jsonb;
    v_repetidos jsonb := '[]'::jsonb;
    v_miembros int := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    SELECT modo_presupuesto, dia_ancla_ciclo INTO v_modo, v_dia_ancla
      FROM public.p_presupuestos_config WHERE user_id = v_user_id;
    IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;

    -- La ventana sale del ciclo real, no del mes calendario.
    v_f_inicio := (date_trunc('month', COALESCE(p_mes, CURRENT_DATE)) + ((v_dia_ancla - 1) * INTERVAL '1 day'))::date;
    v_f_fin := (v_f_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_mes := date_trunc('month', v_f_inicio)::date;

    -- 1 · liquidez real: billeteras activas de la moneda principal, sin fondos de prevision
    v_moneda := public.fn_get_default_currency(v_user_id);
    IF v_moneda IS NOT NULL THEN
        SELECT COALESCE(SUM(saldo_actual), 0) INTO v_liquidez
          FROM public.p_billeteras
         WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false
           AND moneda = v_moneda;
    END IF;

    -- 2 · reservas positivas: una sola fila por grupo
    SELECT COALESCE(SUM(GREATEST(r.monto_disponible, 0)), 0)
      INTO v_reservas
      FROM public.fn_reporte_sobres_detalle(v_mes) r
     WHERE r.cuenta_en_totales;

    SELECT COALESCE(SUM(ABS(r.monto_disponible)), 0)
      INTO v_deficit
      FROM public.fn_reporte_sobres_detalle(v_mes) r
     WHERE r.cuenta_en_totales AND r.monto_disponible < 0;

    -- 3 · cuotas impagas que caen dentro del ciclo
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_cuotas
      FROM public.p_cuotas_detalle
     WHERE user_id = v_user_id AND pagado = false AND fecha_estimada_pago <= v_f_fin;

    v_libre_calculado := v_liquidez - v_reservas - v_cuotas;
    v_libre_reportado := public.fn_obtener_saldo_a_asignar(v_mes);

    -- 4 · gastos: lo que informa el reporte contra la suma independiente de los miembros
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_descuadres
      FROM (
        SELECT jsonb_build_object(
                 'grupo', r.estructura_id,
                 'reporte', r.monto_gastado,
                 'independiente', COALESCE(m.gasto, 0),
                 'diferencia', COALESCE(r.monto_gastado, 0) - COALESCE(m.gasto, 0)
               ) AS x
          FROM public.fn_reporte_sobres_detalle(v_mes) r
          LEFT JOIN (
                SELECT COALESCE(e.padre_id, e.estructura_id) AS grupo,
                       SUM(COALESCE(c.valor_local, c.valor_egreso)) AS gasto
                  FROM public.v_p_caja_reportable c
                  JOIN public.p_estructuras_egresos e ON e.estructura_id = c.estructura_egreso_id
                 WHERE c.user_id = v_user_id
                   AND c.tipo = 'expense'
                   AND c.fecha BETWEEN v_f_inicio AND v_f_fin
                   AND ((c.user_id = v_user_id AND c.es_compartido = false)
                        OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
                 GROUP BY 1
               ) m ON m.grupo = r.estructura_id
         WHERE r.cuenta_en_totales
           AND COALESCE(r.monto_gastado, 0) <> COALESCE(m.gasto, 0)
      ) d;

    -- 5 · grupos que aparecen mas de una vez en los totales: reserva duplicada
    SELECT COALESCE(jsonb_agg(y), '[]'::jsonb) INTO v_repetidos
      FROM (
        SELECT jsonb_build_object('grupo', r.estructura_id, 'veces', count(*)) AS y
          FROM public.fn_reporte_sobres_detalle(v_mes) r
         WHERE r.cuenta_en_totales
         GROUP BY r.estructura_id
        HAVING count(*) > 1
      ) d;

    -- 6 · ajustes firmados del ciclo: plata que ya estaba contada, se informa aparte
    SELECT COALESCE(SUM(-h.monto_limite), 0) INTO v_ajustes
      FROM public.p_presupuestos_historial h
     WHERE h.user_id = v_user_id
       AND h.mes_periodo = v_mes
       AND h.motivo IN ('transferencia_salida', 'transferencia_entrada');

    RETURN jsonb_build_object(
        'mes', v_mes,
        'modo', v_modo,
        'ventana', jsonb_build_object('inicio', v_f_inicio, 'fin', v_f_fin),
        'liquidez', v_liquidez,
        'reservas_positivas', v_reservas,
        'cuotas_del_ciclo', v_cuotas,
        'libre_calculado', v_libre_calculado,
        'libre_reportado', v_libre_reportado,
        'diferencia', v_libre_calculado - v_libre_reportado,
        'cierra', (v_libre_calculado - v_libre_reportado) = 0,
        'deficit_total', v_deficit,
        'ajustes_del_ciclo', v_ajustes,
        'grupos_con_gasto_descuadrado', v_descuadres,
        'grupos_repetidos_en_totales', v_repetidos,
        'libertad_es_planificacion', (COALESCE(v_modo, '') = 'anticipado')
    );
END;
$function$
