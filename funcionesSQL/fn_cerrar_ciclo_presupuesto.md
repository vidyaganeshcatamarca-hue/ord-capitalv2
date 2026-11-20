CREATE OR REPLACE FUNCTION public.fn_cerrar_ciclo_presupuesto(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_modo text;
    v_mes date;
    v_inicio date;
    v_fin date;
    v_grupos int := 0;
    v_hijas int := 0;
    v_ya boolean;
    v_plata numeric;
    v_gasto numeric;
    v_saldo numeric;
    v_gasto_hija numeric;
    r record;
    h record;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    SELECT modo_presupuesto INTO v_modo FROM public.p_presupuestos_config WHERE user_id = v_user_id;

    v_mes := COALESCE(p_mes, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date);
    v_mes := date_trunc('month', v_mes)::date;

    SELECT f.fecha_inicio, f.fecha_fin INTO v_inicio, v_fin
      FROM public.fn_obtener_fechas_ciclo_presupuesto(v_mes) f;

    IF v_fin >= CURRENT_DATE THEN
        RETURN jsonb_build_object('cerrado', false, 'motivo', 'ciclo_abierto',
                                  'mes', v_mes, 'inicio', v_inicio, 'fin', v_fin);
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.p_presupuestos_cierre c
                    WHERE c.tipo = 'ciclo'
                      AND c.mes_periodo = v_mes
                      AND COALESCE(c.user_id, 0) = v_user_id
                      AND COALESCE(c.hogar_id, 0) = COALESCE(v_hogar_id, 0)) INTO v_ya;
    IF v_ya THEN
        RETURN jsonb_build_object('cerrado', false, 'motivo', 'ya_cerrado', 'mes', v_mes);
    END IF;

    FOR r IN
        SELECT e.estructura_id, COALESCE(p.monto_limite, 0) AS plata
          FROM public.p_estructuras_egresos e
          JOIN public.p_presupuestos p ON p.estructura_egreso_id = e.estructura_id
         WHERE e.padre_id IS NULL
           AND p.mes_periodo = v_mes
           AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
         ORDER BY e.estructura_id
    LOOP
        SELECT COALESCE(SUM(COALESCE(c.valor_local, c.valor_egreso)), 0) INTO v_gasto
          FROM public.v_p_caja_reportable c
         WHERE c.tipo = 'expense'
           AND c.fecha BETWEEN v_inicio AND v_fin
           AND (c.estructura_egreso_id = r.estructura_id
                OR c.estructura_egreso_id IN (SELECT h2.estructura_id
                                                FROM public.p_estructuras_egresos h2
                                               WHERE h2.padre_id = r.estructura_id))
           AND ((c.user_id = v_user_id AND c.es_compartido = false)
                OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true));

        v_saldo := public.fn_disponible_transferible(r.estructura_id, v_mes);
        v_plata := r.plata;

        INSERT INTO public.p_presupuestos_cierre
            (user_id, hogar_id, mes_periodo, estructura_egreso_id, padre_id, tipo,
             monto_limite, monto_gastado, monto_techo, saldo_cierre, detalle)
        VALUES (v_user_id, v_hogar_id, v_mes, r.estructura_id, NULL, 'cierre',
                v_plata, v_gasto, NULL, v_saldo,
                jsonb_build_object('modo', v_modo, 'inicio', v_inicio, 'fin', v_fin,
                                   'arrastre', v_saldo - v_plata + v_gasto,
                                   'gasto_grupo', v_gasto, 'desglose', true))
        ON CONFLICT DO NOTHING;
        v_grupos := v_grupos + 1;

        -- El desglose: que gasto cada subcategoria y con que techo contaba. No es dinero
        -- asignado; es como se reparte el consumo del padre.
        FOR h IN
            SELECT e2.estructura_id, p2.monto_techo AS techo
              FROM public.p_estructuras_egresos e2
              LEFT JOIN public.p_presupuestos p2
                     ON p2.estructura_egreso_id = e2.estructura_id
                    AND p2.mes_periodo = v_mes
                    AND (p2.user_id = v_user_id
                         OR (v_hogar_id IS NOT NULL AND p2.hogar_id = v_hogar_id))
             WHERE e2.padre_id = r.estructura_id
        LOOP
            SELECT COALESCE(SUM(COALESCE(c.valor_local, c.valor_egreso)), 0) INTO v_gasto_hija
              FROM public.v_p_caja_reportable c
             WHERE c.tipo = 'expense'
               AND c.fecha BETWEEN v_inicio AND v_fin
               AND c.estructura_egreso_id = h.estructura_id
               AND ((c.user_id = v_user_id AND c.es_compartido = false)
                    OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true));

            INSERT INTO public.p_presupuestos_cierre
                (user_id, hogar_id, mes_periodo, estructura_egreso_id, padre_id, tipo,
                 monto_limite, monto_gastado, monto_techo, saldo_cierre, detalle)
            VALUES (v_user_id, v_hogar_id, v_mes, h.estructura_id, r.estructura_id, 'cierre',
                    0, v_gasto_hija, h.techo, 0,
                    jsonb_build_object('modo', v_modo, 'inicio', v_inicio, 'fin', v_fin,
                                       'desglose', true))
            ON CONFLICT DO NOTHING;
            v_hijas := v_hijas + 1;
        END LOOP;
    END LOOP;

    INSERT INTO public.p_presupuestos_cierre
        (user_id, hogar_id, mes_periodo, estructura_egreso_id, tipo, detalle)
    VALUES (v_user_id, v_hogar_id, v_mes, 0, 'ciclo',
            jsonb_build_object('modo', v_modo, 'inicio', v_inicio, 'fin', v_fin,
                               'grupos', v_grupos, 'hijas', v_hijas, 'desglose', true))
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object('cerrado', true, 'mes', v_mes, 'inicio', v_inicio,
                              'fin', v_fin, 'grupos', v_grupos, 'hijas', v_hijas,
                              'modo', v_modo);
END;
$function$
