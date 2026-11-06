CREATE OR REPLACE FUNCTION public.fn_generar_recurrentes_hoy(p_hoy date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r_rec            RECORD;
    v_monto          numeric;
    v_hoy            date := COALESCE(p_hoy, CURRENT_DATE);
    v_dia_hoy        int  := EXTRACT(DAY FROM v_hoy)::int;
    v_mes_hoy        int  := EXTRACT(MONTH FROM v_hoy)::int;
    v_dow_hoy        int  := EXTRACT(ISODOW FROM v_hoy)::int;
    v_ultimo_dia_mes int  := EXTRACT(DAY FROM
                            (date_trunc('month', v_hoy) + INTERVAL '1 month' - INTERVAL '1 day'))::int;
    v_insertados     int  := 0;
    v_fallidos       int  := 0;
    v_vencidos       int  := 0;

    v_cierre         date;   -- cierre de la tarjeta (día del mes, recortado)
    v_aviso          date;   -- cierre - 3
    v_moneda         text;
BEGIN
    FOR r_rec IN
        SELECT * FROM public.p_gastos_recurrentes WHERE activo IS TRUE
    LOOP
        BEGIN
            -- ---------- vigencia vencida: se pausa y no se genera ----------
            IF r_rec.fecha_fin IS NOT NULL AND v_hoy > r_rec.fecha_fin THEN
                UPDATE public.p_gastos_recurrentes
                   SET activo = false, motivo_pausa = 'vencida', pausado_at = now()
                 WHERE recurrente_id = r_rec.recurrente_id AND activo IS TRUE;
                v_vencidos := v_vencidos + 1;
                CONTINUE;
            END IF;

            -- ================= RAMA TARJETA =================
            -- El día no lo decide el patrón del recurrente sino el CIERRE de la
            -- tarjeta: se propone 3 días antes de que cierre el ciclo.
            IF r_rec.tarjeta_id IS NOT NULL THEN
                SELECT LEAST(t.dia_cierre,
                             EXTRACT(DAY FROM (date_trunc('month', v_hoy)
                                               + INTERVAL '1 month' - INTERVAL '1 day'))::int),
                       COALESCE(t.moneda_iso, 'ARS')
                  INTO v_dia_hoy, v_moneda
                  FROM public.p_tarjetas_credito t
                 WHERE t.tarjeta_id = r_rec.tarjeta_id
                   AND t.user_id = r_rec.user_id;

                CONTINUE WHEN v_dia_hoy IS NULL;   -- tarjeta inexistente: se ignora

                -- modo unica: el ciclo que corresponde a su fecha
                IF r_rec.modo = 'unica' THEN
                    IF r_rec.fecha_unica IS NULL THEN CONTINUE; END IF;
                    -- primer cierre >= fecha_unica
                    v_cierre := (date_trunc('month', r_rec.fecha_unica)
                                 + ((v_dia_hoy - 1) || ' days')::interval)::date;
                    IF r_rec.fecha_unica > v_cierre THEN
                        v_cierre := (date_trunc('month', r_rec.fecha_unica + INTERVAL '1 month')
                                     + ((v_dia_hoy - 1) || ' days')::interval)::date;
                    END IF;
                ELSE
                    -- mensual: el próximo cierre desde hoy
                    v_cierre := (date_trunc('month', v_hoy)
                                 + ((v_dia_hoy - 1) || ' days')::interval)::date;
                    IF v_hoy > v_cierre THEN
                        v_cierre := (date_trunc('month', v_hoy + INTERVAL '1 month')
                                     + ((v_dia_hoy - 1) || ' days')::interval)::date;
                    END IF;
                END IF;

                v_aviso := v_cierre - 3;
                CONTINUE WHEN v_hoy <> v_aviso;

                -- idempotencia
                CONTINUE WHEN EXISTS (
                    SELECT 1 FROM public.p_caja_cuarentena c
                     WHERE c.recurrente_id = r_rec.recurrente_id
                       AND c.fecha = v_hoy);

                INSERT INTO public.p_caja_cuarentena (
                    user_id, origen, tipo, recurrente_id, tarjeta_id, billetera_id,
                    estructura_egreso_id, monto, moneda, cuotas, fecha, detalle)
                VALUES (
                    r_rec.user_id, 'recurrente', 'card_expense', r_rec.recurrente_id,
                    r_rec.tarjeta_id, NULL,
                    r_rec.estructura_egreso_id,
                    COALESCE(r_rec.monto_base, 0),
                    CASE WHEN r_rec.es_usd THEN 'USD' ELSE v_moneda END,
                    1, v_hoy, 'recurring_expense');

                v_insertados := v_insertados + 1;
                CONTINUE;
            END IF;

            -- ================= RAMA BILLETERA (sin cambios) =================
            IF r_rec.modo = 'unica' THEN
                CONTINUE WHEN r_rec.fecha_unica IS DISTINCT FROM v_hoy;
            ELSIF r_rec.modo = 'semanal' THEN
                CONTINUE WHEN v_dow_hoy <> ALL (COALESCE(r_rec.dias_semana, '{}'::smallint[]));
            ELSIF r_rec.modo = 'anual' THEN
                CONTINUE WHEN NOT EXISTS (
                    SELECT 1 FROM unnest(COALESCE(r_rec.fechas_anio, '{}'::smallint[])) AS f(valor)
                     WHERE (f.valor / 100)::int = v_mes_hoy
                       AND LEAST((f.valor % 100)::int, v_ultimo_dia_mes) = EXTRACT(DAY FROM v_hoy)::int);
            ELSE
                CONTINUE WHEN NOT EXISTS (
                    SELECT 1 FROM unnest(COALESCE(r_rec.dias_mes,
                                                  ARRAY[r_rec.dia_del_mes]::smallint[])) AS d(valor)
                     WHERE LEAST(d.valor::int, v_ultimo_dia_mes) = EXTRACT(DAY FROM v_hoy)::int);
            END IF;

            CONTINUE WHEN EXISTS (
                SELECT 1 FROM public.p_caja_cuarentena c
                 WHERE c.recurrente_id = r_rec.recurrente_id
                   AND c.fecha = v_hoy);

            IF r_rec.tipo_variabilidad = 'fijo' THEN
                v_monto := r_rec.monto_base;
            ELSE
                SELECT COALESCE(SUM(valor_egreso) / 3.0, r_rec.monto_base)
                  INTO v_monto
                  FROM public.p_caja
                 WHERE user_id = r_rec.user_id
                   AND estructura_egreso_id = r_rec.estructura_egreso_id
                   AND fecha >= v_hoy - INTERVAL '3 months';
            END IF;
            v_monto := COALESCE(v_monto, r_rec.monto_base, 0);

            INSERT INTO public.p_caja_cuarentena (
                user_id, origen, tipo, recurrente_id, billetera_id,
                estructura_egreso_id, monto, fecha, detalle)
            VALUES (
                r_rec.user_id, 'recurrente', 'expense', r_rec.recurrente_id,
                r_rec.billetera_defecto_id,
                r_rec.estructura_egreso_id, v_monto, v_hoy, 'recurring_expense');

            v_insertados := v_insertados + 1;

        EXCEPTION WHEN OTHERS THEN
            v_fallidos := v_fallidos + 1;
            RAISE WARNING 'fn_generar_recurrentes_hoy: recurrente % omitido: % (%)',
                r_rec.recurrente_id, SQLERRM, SQLSTATE;
        END;
    END LOOP;

    IF v_vencidos > 0 THEN
        RAISE NOTICE 'fn_generar_recurrentes_hoy: % recurrentes vencidos pausados', v_vencidos;
    END IF;
    IF v_fallidos > 0 THEN
        RAISE WARNING 'fn_generar_recurrentes_hoy: % ocurrencias insertadas, % omitidos',
            v_insertados, v_fallidos;
    END IF;

    RETURN v_insertados;
END;
$function$
