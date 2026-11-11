CREATE OR REPLACE FUNCTION public.fn_reporte_vencimientos_tarjetas()
 RETURNS TABLE(tarjeta_id bigint, nombre_tarjeta text, dia_vencimiento integer, dias_para_vencimiento integer, monto_a_pagar numeric, monto_ciclo_total numeric, estado_urgencia_key text, mensaje_key text, resumen_vencido boolean, saldo_a_favor numeric, monto_a_pagar_ars numeric, monto_a_pagar_usd numeric, monto_ciclo_total_ars numeric, monto_ciclo_total_usd numeric, saldo_a_favor_usd numeric, resumen_anterior_total_ars numeric, resumen_anterior_total_usd numeric, resumen_anterior_a_pagar_ars numeric, resumen_anterior_a_pagar_usd numeric, resumen_actual_total_ars numeric, resumen_actual_total_usd numeric, resumen_actual_a_pagar_ars numeric, resumen_actual_a_pagar_usd numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$



DECLARE
    v_user_id bigint;
    -- v_hoy sale de la zona horaria del usuario, no de CURRENT_DATE (UTC).
    v_hoy date;
    v_dia_hoy int;
    v_mes_actual date;
    v_zona text;
    v_cotizacion_usd numeric;
    r_tarjeta RECORD;
    v_proximo_vencimiento date;
    v_vencimiento_extendido date;
    v_min_fecha date;
    v_dias_restantes int;
    v_monto_total_ars numeric;
    v_monto_total_usd numeric;
    v_saldo_favor numeric;
    v_saldo_favor_usd numeric;
    v_monto_a_pagar_ars numeric;
    v_monto_a_pagar_usd numeric;
    -- Bug fix 2026-09-14: separar resumen vencido del resumen actual.
    v_resumen_anterior_total_ars numeric := 0;
    v_resumen_anterior_total_usd numeric := 0;
    v_resumen_anterior_a_pagar_ars numeric := 0;
    v_resumen_anterior_a_pagar_usd numeric := 0;
    v_resumen_actual_total_ars numeric := 0;
    v_resumen_actual_total_usd numeric := 0;
    v_resumen_actual_a_pagar_ars numeric := 0;
    v_resumen_actual_a_pagar_usd numeric := 0;
    v_saldo_favor_restante_ars numeric := 0;
    v_saldo_favor_restante_usd numeric := 0;
    v_monto_ciclo_total numeric;
    v_monto_a_pagar numeric;
    v_estado text;
    v_moneda_local text;
    v_mensaje text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS') INTO v_moneda_local;

    -- Bug 2026-11-11: CURRENT_DATE es la fecha UTC del servidor. A las 23:40 de
    -- Argentina ya es el día siguiente en UTC, así que el reporte adelantaba un
    -- mes y contaba un día de menos (29 en vez de 30).
    v_zona := public.fn_zona_horaria_pais(
        (SELECT pais_codigo FROM public.p_config_region WHERE user_id = v_user_id));
    v_hoy := (now() AT TIME ZONE v_zona)::date;
    v_dia_hoy := EXTRACT(DAY FROM v_hoy);
    v_mes_actual := date_trunc('month', v_hoy);

    SELECT COALESCE(
        (SELECT valor_por_usd FROM p_divisas WHERE nombre = COALESCE(
            (SELECT moneda_default FROM p_config_region WHERE user_id = v_user_id),
            'ARS') ORDER BY ultima_actualizacion DESC LIMIT 1),
        1.00
    ) INTO v_cotizacion_usd;

    FOR r_tarjeta IN
        SELECT t.tarjeta_id, t.nombre_tarjeta, t.dia_cierre, t.dia_vencimiento,
               COALESCE(t.saldo_a_favor, 0) AS saldo_favor,
               COALESCE(t.saldo_a_favor_usd, 0) AS saldo_favor_usd
        FROM p_tarjetas_credito t
        WHERE t.user_id = v_user_id AND t.dia_vencimiento IS NOT NULL
    LOOP
        -- CÃÂ¡lculo simple de prÃÂ³ximo vencimiento (revertido a la lÃÂ³gica original de
        -- tests/database_updates_fase3_vencimientos.sql lÃÂ­neas 181-185).
        -- El bug reportado: el clamp v_min_fecha + filtro date_trunc hacÃÂ­a que al pagar
        -- la cuota del mes actual, el reporte mostrara el siguiente resumen con la
        -- cuota del mes siguiente como "monto a pagar" (cascada). Restauramos la
        -- comparaciÃÂ³n directa de fechas, sin clamp y sin date_trunc.
        IF v_dia_hoy <= r_tarjeta.dia_vencimiento THEN
            v_proximo_vencimiento := v_mes_actual + ((r_tarjeta.dia_vencimiento - 1) * INTERVAL '1 day');
        ELSE
            v_proximo_vencimiento := (v_mes_actual + INTERVAL '1 month') + ((r_tarjeta.dia_vencimiento - 1) * INTERVAL '1 day');
        END IF;

        -- Bug 2026-11-11: si el resumen que vence en v_proximo_vencimiento ya está
        -- saldado, el próximo vencimiento es el del mes siguiente. Sin esta regla,
        -- el mismo día del vencimiento el reporte anunciaba "hoy, 0 días" sobre un
        -- resumen pagado una semana antes. Se recorta al último día del mes destino
        -- para no desbordar (día 31 -> febrero), igual que la pantalla.
        IF NOT EXISTS (
            SELECT 1 FROM p_cuotas_detalle cd
             WHERE cd.tarjeta_id = r_tarjeta.tarjeta_id
               AND cd.pagado = false
               AND cd.fecha_estimada_pago <= v_proximo_vencimiento
        ) THEN
            v_proximo_vencimiento := LEAST(
                (date_trunc('month', v_proximo_vencimiento) + INTERVAL '1 month')::date
                    + (r_tarjeta.dia_vencimiento - 1),
                (date_trunc('month', v_proximo_vencimiento) + INTERVAL '2 month')::date - 1
            );
        END IF;

        v_dias_restantes := (v_proximo_vencimiento - v_hoy)::int;

        -- Sumar cuotas por moneda con comparaciÃÂ³n directa de fechas (lÃÂ³gica original).
        -- Solo se incluyen las cuotas cuya fecha_estimada_pago <= v_proximo_vencimiento.
        -- Bug fix 2026-09-14 v2: el resumen anterior usa el mes del proximo vencimiento
            -- (ciclo del tarjeta) en lugar del mes calendario actual. Asi una cuota cuya
            -- fecha_estimada_pago cae en el mes en curso pero pertenece al ciclo cerrado
            -- del mes anterior (ej: Naranja X, dia_cierre=27, dia_vencimiento=10 -> la
            -- cuota del 10-sep pertenece al resumen que cerro el 27-ago y vence el 10-sep,
            -- no al resumen actual que vence el 10-oct) cuenta como resumen anterior.
            SELECT
                COALESCE(SUM(CASE WHEN cd.moneda = v_moneda_local THEN cd.monto_cuota ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0)
              INTO v_resumen_anterior_total_ars, v_resumen_anterior_total_usd
              FROM p_cuotas_detalle cd
              WHERE cd.tarjeta_id = r_tarjeta.tarjeta_id
                AND cd.pagado = false
                AND cd.fecha_estimada_pago < date_trunc('month', v_proximo_vencimiento)::date;

            -- Resumen actual: cuotas del mes del proximo vencimiento (inclusive).
            SELECT
                COALESCE(SUM(CASE WHEN cd.moneda = v_moneda_local THEN cd.monto_cuota ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0)
              INTO v_resumen_actual_total_ars, v_resumen_actual_total_usd
              FROM p_cuotas_detalle cd
              WHERE cd.tarjeta_id = r_tarjeta.tarjeta_id
                AND cd.pagado = false
                AND cd.fecha_estimada_pago >= date_trunc('month', v_proximo_vencimiento)::date
                AND cd.fecha_estimada_pago <= v_proximo_vencimiento;

            -- Totales legacy.
            v_monto_total_ars := v_resumen_anterior_total_ars + v_resumen_actual_total_ars;
            v_monto_total_usd := v_resumen_anterior_total_usd + v_resumen_actual_total_usd;

        v_saldo_favor := r_tarjeta.saldo_favor;
        v_saldo_favor_usd := r_tarjeta.saldo_favor_usd;

        -- Neto por moneda (despuÃÆÃÂ©s de favor por moneda)
        v_resumen_anterior_a_pagar_ars := GREATEST(v_resumen_anterior_total_ars - v_saldo_favor, 0);
        v_resumen_anterior_a_pagar_usd := GREATEST(v_resumen_anterior_total_usd - v_saldo_favor_usd, 0);
        v_saldo_favor_restante_ars := GREATEST(v_saldo_favor - v_resumen_anterior_total_ars, 0);
        v_saldo_favor_restante_usd := GREATEST(v_saldo_favor_usd - v_resumen_anterior_total_usd, 0);
        v_resumen_actual_a_pagar_ars := GREATEST(v_resumen_actual_total_ars - v_saldo_favor_restante_ars, 0);
        v_resumen_actual_a_pagar_usd := GREATEST(v_resumen_actual_total_usd - v_saldo_favor_restante_usd, 0);

        -- Neto por moneda (legacy).
        v_monto_a_pagar_ars := v_resumen_anterior_a_pagar_ars + v_resumen_actual_a_pagar_ars;
        v_monto_a_pagar_usd := v_resumen_anterior_a_pagar_usd + v_resumen_actual_a_pagar_usd;

        -- Legacy fields: ARS-equivalent (para no romper consumidores una release)
        v_monto_ciclo_total := v_monto_total_ars + (v_monto_total_usd * v_cotizacion_usd);
        v_monto_a_pagar := v_monto_a_pagar_ars + (v_monto_a_pagar_usd * v_cotizacion_usd);

        IF v_monto_total_ars > 0 OR v_monto_total_usd > 0 THEN
            resumen_vencido := EXISTS (
                SELECT 1 FROM p_cuotas_detalle cd
                WHERE cd.tarjeta_id = r_tarjeta.tarjeta_id
                  AND cd.pagado = false
                  AND cd.fecha_estimada_pago < v_hoy
            );

            IF resumen_vencido OR v_dias_restantes <= 3 THEN
                v_estado := 'critical';
                v_mensaje := 'msg_vencimiento_critico';
            ELSIF v_dias_restantes <= 7 THEN
                v_estado := 'urgent';
                v_mensaje := 'msg_vencimiento_urgente';
            ELSE
                v_estado := 'warning';
                v_mensaje := 'msg_vencimiento_precaucion';
            END IF;

            tarjeta_id := r_tarjeta.tarjeta_id;
            nombre_tarjeta := r_tarjeta.nombre_tarjeta;
            dia_vencimiento := r_tarjeta.dia_vencimiento;
            dias_para_vencimiento := v_dias_restantes;
            monto_a_pagar := v_monto_a_pagar;
            monto_ciclo_total := v_monto_ciclo_total;
            estado_urgencia_key := v_estado;
            mensaje_key := v_mensaje;
            resumen_vencido := resumen_vencido;
            saldo_a_favor := v_saldo_favor;
            monto_a_pagar_ars := v_monto_a_pagar_ars;
            monto_a_pagar_usd := v_monto_a_pagar_usd;
            monto_ciclo_total_ars := v_monto_total_ars;
            monto_ciclo_total_usd := v_monto_total_usd;
            saldo_a_favor_usd := v_saldo_favor_usd;
            -- Bug fix 2026-09-14: separar resumen vencido del actual.
            resumen_anterior_total_ars := v_resumen_anterior_total_ars;
            resumen_anterior_total_usd := v_resumen_anterior_total_usd;
            resumen_anterior_a_pagar_ars := v_resumen_anterior_a_pagar_ars;
            resumen_anterior_a_pagar_usd := v_resumen_anterior_a_pagar_usd;
            resumen_actual_total_ars := v_resumen_actual_total_ars;
            resumen_actual_total_usd := v_resumen_actual_total_usd;
            resumen_actual_a_pagar_ars := v_resumen_actual_a_pagar_ars;
            resumen_actual_a_pagar_usd := v_resumen_actual_a_pagar_usd;

            RETURN NEXT;
        END IF;
    END LOOP;
END;
$function$
