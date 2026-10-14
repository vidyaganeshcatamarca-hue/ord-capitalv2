

DROP FUNCTION IF EXISTS public.fn_crear_tarjeta_credito(text, text, integer, integer, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.fn_crear_tarjeta_credito(p_nombre_tarjeta text, p_banco text, p_dia_vencimiento integer, p_dia_cierre integer, p_limite_un_pago numeric, p_limite_cuotas numeric, p_color text DEFAULT '#6366F1'::text, p_recargo_dolar_pct numeric DEFAULT 30.00)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_tarjeta_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    INSERT INTO p_tarjetas_credito (user_id, nombre_tarjeta, banco, dia_vencimiento, dia_cierre, color, limite_un_pago, limite_cuotas, recargo_dolar_pct, moneda_iso)
    VALUES (v_user_id, p_nombre_tarjeta, p_banco, p_dia_vencimiento, p_dia_cierre, p_color, p_limite_un_pago, p_limite_cuotas, p_recargo_dolar_pct, COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS'))
    RETURNING tarjeta_id INTO v_tarjeta_id;

    RETURN v_tarjeta_id;
END;
$function$;


DROP FUNCTION IF EXISTS public.fn_registrar_gasto_tarjeta(bigint, numeric, integer, bigint, date, text, text, boolean, bigint, boolean);

CREATE OR REPLACE FUNCTION public.fn_registrar_gasto_tarjeta(p_tarjeta_id bigint, p_monto_total numeric, p_cuotas integer, p_estructura_egreso_id bigint, p_fecha date DEFAULT CURRENT_DATE, p_descripcion text DEFAULT NULL::text, p_detalle text DEFAULT NULL::text, p_es_compartido boolean DEFAULT false, p_proyecto_id bigint DEFAULT NULL::bigint, p_es_usd boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_caja_id bigint;
    v_monto_cuota numeric;
    v_i integer;
    v_mes_periodo date;
    v_fecha_estimada date;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_recargo_dolar_pct numeric;
    v_moneda_tarjeta text;
    v_moneda_local text;
    v_dia_compra int;
    v_mes_compra date;
    v_base_date date;
    v_cotizacion_usd numeric;
    v_moneda text;
    v_metadata jsonb := '{}'::jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT dia_cierre, dia_vencimiento, COALESCE(recargo_dolar_pct, 0.00), moneda_iso
      INTO v_dia_cierre, v_dia_vencimiento, v_recargo_dolar_pct, v_moneda_tarjeta
      FROM p_tarjetas_credito
      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

    v_dia_cierre := COALESCE(v_dia_cierre, 20);
    v_dia_vencimiento := COALESCE(v_dia_vencimiento, 10);

    -- Snapshot de cotizaciÃ³n y recargo SOLO para auditorÃ­a. Sin conversiÃ³n al comprar.
    IF p_es_usd THEN
        v_moneda := 'USD';
        SELECT COALESCE(
            (SELECT valor_por_usd FROM p_divisas WHERE nombre = 'USD' ORDER BY ultima_actualizacion DESC LIMIT 1),
            1.00
        ) INTO v_cotizacion_usd;
        v_metadata := jsonb_build_object(
            'es_compra_usd', true,
            'monto_usd', p_monto_total,
            'cotizacion_usd', v_cotizacion_usd,
            'recargo_dolar_pct', v_recargo_dolar_pct,
            'recargo_aplicado', false
        );
    ELSE
        v_moneda := COALESCE(v_moneda_tarjeta, (SELECT COALESCE(moneda_default, 'ARS') FROM public.p_config_region WHERE user_id = v_user_id), 'ARS');
    END IF;

    -- INSERT explÃ­cito de moneda y es_usd (antes faltaba es_usd en columnas).
    INSERT INTO p_caja (
        user_id, tipo, tarjeta_id, valor_egreso, valor_ingreso, moneda, es_usd, nombre_cuenta_historico,
        fecha, es_compartido, proyecto_id, estructura_egreso_id, pagado_por_user_id, detalle, cuotas_totales, metadata
    )
    VALUES (
        v_user_id, 'expense', p_tarjeta_id, p_monto_total, 0, v_moneda, p_es_usd, p_descripcion,
        p_fecha, p_es_compartido, p_proyecto_id, p_estructura_egreso_id,
        CASE WHEN p_es_compartido THEN v_user_id ELSE NULL END,
        p_detalle, p_cuotas, v_metadata
    )
    RETURNING p_caja_id INTO v_caja_id;

    -- Cuota en moneda nativa (sin conversiÃ³n al comprar).
    v_monto_cuota := p_monto_total / p_cuotas;

    v_dia_compra := EXTRACT(DAY FROM p_fecha);
    v_mes_compra := date_trunc('month', p_fecha);

    IF v_dia_compra <= v_dia_cierre THEN
        v_base_date := v_mes_compra;
    ELSE
        v_base_date := v_mes_compra + INTERVAL '1 month';
    END IF;

    IF v_dia_vencimiento <= v_dia_cierre THEN
        v_base_date := v_base_date + INTERVAL '1 month';
    END IF;

    FOR v_i IN 0..(p_cuotas - 1) LOOP
        v_fecha_estimada := (v_base_date + (v_i || ' months')::interval) + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        SELECT date_trunc('month', fecha_inicio)::date INTO v_mes_periodo
          FROM public.fn_obtener_fechas_ciclo_presupuesto(v_fecha_estimada);

        INSERT INTO p_cuotas_detalle (
            user_id, tarjeta_id, numero_cuota, monto_cuota, moneda, fecha_estimada_pago, pagado, p_caja_id
        ) VALUES (
            v_user_id, p_tarjeta_id, (v_i + 1), v_monto_cuota, v_moneda, v_fecha_estimada, false, v_caja_id
        );

        INSERT INTO p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
        VALUES (p_tarjeta_id, v_user_id, v_monto_cuota, v_mes_periodo)
        ON CONFLICT (tarjeta_id, mes_periodo, user_id)
        DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
    END LOOP;

    RETURN v_caja_id;
END;
$function$;


DROP FUNCTION IF EXISTS public.fn_reporte_vencimientos_tarjetas();

CREATE OR REPLACE FUNCTION public.fn_reporte_vencimientos_tarjetas()
 RETURNS TABLE(tarjeta_id bigint, nombre_tarjeta text, dia_vencimiento integer, dias_para_vencimiento integer, monto_a_pagar numeric, monto_ciclo_total numeric, estado_urgencia_key text, mensaje_key text, resumen_vencido boolean, saldo_a_favor numeric, monto_a_pagar_ars numeric, monto_a_pagar_usd numeric, monto_ciclo_total_ars numeric, monto_ciclo_total_usd numeric, saldo_a_favor_usd numeric, resumen_anterior_total_ars numeric, resumen_anterior_total_usd numeric, resumen_anterior_a_pagar_ars numeric, resumen_anterior_a_pagar_usd numeric, resumen_actual_total_ars numeric, resumen_actual_total_usd numeric, resumen_actual_a_pagar_ars numeric, resumen_actual_a_pagar_usd numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$



DECLARE
    v_user_id bigint;
    v_hoy date := CURRENT_DATE;
    v_dia_hoy int := EXTRACT(DAY FROM v_hoy);
    v_mes_actual date := date_trunc('month', CURRENT_DATE);
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
$function$;


DROP FUNCTION IF EXISTS public.fn_reporte_mapa_tarjetas();

CREATE OR REPLACE FUNCTION public.fn_reporte_mapa_tarjetas()
 RETURNS TABLE(tarjeta_id bigint, nombre_tarjeta text, limite_un_pago_total numeric, un_pago_disponible numeric, limite_cuotas_total numeric, cuotas_disponible numeric, estado_config text, dia_cierre integer, dia_vencimiento integer, banco text, color text, recargo_dolar_pct numeric, cotizacion_usd numeric, un_pago_consumido_ars numeric, un_pago_consumido_usd numeric, cuotas_futuras_consumido_ars numeric, cuotas_futuras_consumido_usd numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_hoy date := CURRENT_DATE;
    v_dia_hoy int := EXTRACT(DAY FROM CURRENT_DATE);
    v_mes_actual date := date_trunc('month', CURRENT_DATE);
    r_tarjeta RECORD;
    v_inicio_ciclo date;
    v_fin_ciclo date;
    v_vencimiento_ciclo date;
    v_cotizacion_usd numeric;
    v_consumo_un_pago_ars numeric;
    v_moneda_local text;
    v_consumo_un_pago_usd numeric;
    v_consumo_un_pago_total_ars_equiv numeric;
    v_consumo_cuotas_ars numeric;
    v_consumo_cuotas_usd numeric;
    v_consumo_cuotas_total_ars_equiv numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS') INTO v_moneda_local;

    SELECT COALESCE(
        (SELECT valor_por_usd FROM p_divisas WHERE nombre = COALESCE(
            (SELECT moneda_default FROM p_config_region WHERE user_id = v_user_id),
            'ARS') ORDER BY ultima_actualizacion DESC LIMIT 1),
        1.00
    ) INTO v_cotizacion_usd;

    FOR r_tarjeta IN
        SELECT t.tarjeta_id, t.nombre_tarjeta, t.dia_cierre, t.dia_vencimiento,
               t.banco, t.color, t.limite_un_pago, t.limite_cuotas, t.recargo_dolar_pct
        FROM p_tarjetas_credito t
        WHERE t.user_id = v_user_id AND t.activa = true
    LOOP
        IF COALESCE(r_tarjeta.limite_un_pago, 0) = 0 AND COALESCE(r_tarjeta.limite_cuotas, 0) = 0 THEN
            RETURN QUERY SELECT
                r_tarjeta.tarjeta_id, r_tarjeta.nombre_tarjeta,
                0::numeric, 0::numeric, 0::numeric, 0::numeric,
                'requires_configuration'::text,
                r_tarjeta.dia_cierre, r_tarjeta.dia_vencimiento, r_tarjeta.banco, r_tarjeta.color,
                COALESCE(r_tarjeta.recargo_dolar_pct, 0.00)::numeric,
                COALESCE(v_cotizacion_usd, 1.00)::numeric,
                0::numeric, 0::numeric, 0::numeric, 0::numeric;
            CONTINUE;
        END IF;

        IF v_dia_hoy <= r_tarjeta.dia_cierre THEN
            v_inicio_ciclo := (v_mes_actual - INTERVAL '1 month') + (r_tarjeta.dia_cierre * INTERVAL '1 day');
            v_fin_ciclo := v_mes_actual + ((r_tarjeta.dia_cierre - 1) * INTERVAL '1 day');
        ELSE
            v_inicio_ciclo := v_mes_actual + (r_tarjeta.dia_cierre * INTERVAL '1 day');
            v_fin_ciclo := (v_mes_actual + INTERVAL '1 month') + ((r_tarjeta.dia_cierre - 1) * INTERVAL '1 day');
        END IF;

        IF r_tarjeta.dia_vencimiento <= r_tarjeta.dia_cierre THEN
            v_vencimiento_ciclo := (date_trunc('month', v_fin_ciclo) + INTERVAL '1 month') + ((r_tarjeta.dia_vencimiento - 1) * INTERVAL '1 day');
        ELSE
            v_vencimiento_ciclo := date_trunc('month', v_fin_ciclo) + ((r_tarjeta.dia_vencimiento - 1) * INTERVAL '1 day');
        END IF;

        SELECT
            COALESCE(SUM(CASE WHEN cd.moneda = v_moneda_local THEN cd.monto_cuota ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0)
          INTO v_consumo_un_pago_ars, v_consumo_un_pago_usd
          FROM p_cuotas_detalle cd
          WHERE cd.tarjeta_id = r_tarjeta.tarjeta_id AND cd.pagado = false
            AND cd.fecha_estimada_pago <= v_vencimiento_ciclo;
        v_consumo_un_pago_total_ars_equiv := v_consumo_un_pago_ars + (v_consumo_un_pago_usd * v_cotizacion_usd);

        SELECT
            COALESCE(SUM(CASE WHEN cd.moneda = v_moneda_local THEN cd.monto_cuota ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0)
          INTO v_consumo_cuotas_ars, v_consumo_cuotas_usd
          FROM p_cuotas_detalle cd
          WHERE cd.tarjeta_id = r_tarjeta.tarjeta_id AND cd.pagado = false
            AND cd.fecha_estimada_pago > v_vencimiento_ciclo;
        v_consumo_cuotas_total_ars_equiv := v_consumo_cuotas_ars + (v_consumo_cuotas_usd * v_cotizacion_usd);

        RETURN QUERY SELECT
            r_tarjeta.tarjeta_id, r_tarjeta.nombre_tarjeta, r_tarjeta.limite_un_pago,
            (r_tarjeta.limite_un_pago - v_consumo_un_pago_total_ars_equiv),
            r_tarjeta.limite_cuotas,
            (r_tarjeta.limite_cuotas - v_consumo_cuotas_total_ars_equiv),
            'ok'::text,
            r_tarjeta.dia_cierre, r_tarjeta.dia_vencimiento, r_tarjeta.banco, r_tarjeta.color,
            COALESCE(r_tarjeta.recargo_dolar_pct, 0.00)::numeric,
            v_cotizacion_usd,
            v_consumo_un_pago_ars, v_consumo_un_pago_usd,
            v_consumo_cuotas_ars, v_consumo_cuotas_usd;
    END LOOP;
END;
$function$;


DROP FUNCTION IF EXISTS public.fn_registrar_pago_tarjeta_multi(bigint, date, jsonb, bigint[], numeric, numeric, boolean, numeric, text);

CREATE OR REPLACE FUNCTION public.fn_registrar_pago_tarjeta_multi(p_tarjeta_id bigint, p_fecha_pago date, p_pagos jsonb, p_cuotas_adelantar bigint[] DEFAULT NULL::bigint[], p_resumen_real numeric DEFAULT NULL::numeric, p_cotizacion_usd numeric DEFAULT NULL::numeric, p_no_acreditar_favor boolean DEFAULT false, p_monto_a_favor_explicito numeric DEFAULT NULL::numeric, p_objetivo text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$


DECLARE
    v_user_id bigint;
    v_caja_id bigint;
    v_primer_caja_id bigint;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_recargo_dolar_pct numeric;
    v_cotizacion_usd numeric;
    v_sobrante_total numeric;
    v_cuota_adelantada_id bigint;
    v_cuota_adelantada_monto numeric;
    v_cuota_adelantada_moneda text;
    v_total_adelantado_ars numeric := 0;
    v_total_adelantado_usd numeric := 0;
    v_cuotas_adelantadas_log jsonb := '[]'::jsonb;
    v_linea jsonb;
    v_pago jsonb;
    v_billetera_id bigint;
    v_monto numeric;
    v_target text;
    v_moneda_pago text;
    v_moneda_local text;
    v_moneda_target text;
    v_monto_target numeric;
    v_saldo_billetera numeric;
    v_total_pagado numeric := 0;
    v_total_favor_ars numeric := 0;
    v_total_favor_usd numeric := 0;
    v_pagos_aplicados jsonb := '[]'::jsonb;
    v_seen_billeteras jsonb := '{}'::jsonb;
    v_dup boolean;
    v_wallet_key text;
    v_saldo_favor_inicial_ars numeric := 0;
    v_saldo_favor_inicial_usd numeric := 0;
    v_saldo_favor_actual_ars numeric := 0;
    v_saldo_favor_actual_usd numeric := 0;
    v_favor_disponible_equiv numeric := 0;
    v_deficit numeric := 0;
    v_tomar_ars numeric := 0;
    v_tomar_usd numeric := 0;
    v_total_mes_calculado_ars numeric := 0;
    v_total_mes_calculado_usd numeric := 0;
    v_prox_venc date;
    v_objetivo_desde date := NULL;
    v_objetivo_hasta date := NULL;
    v_favor_acreditado numeric := 0;
    v_cubierto_res numeric := 0;
    v_favor_extra_res numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS') INTO v_moneda_local;

    SELECT dia_cierre, dia_vencimiento,
           COALESCE(saldo_a_favor, 0), COALESCE(saldo_a_favor_usd, 0)
      INTO v_dia_cierre, v_dia_vencimiento,
           v_saldo_favor_inicial_ars, v_saldo_favor_inicial_usd
      FROM p_tarjetas_credito
      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

    v_recargo_dolar_pct := 0;

    IF p_cotizacion_usd IS NOT NULL THEN
        v_cotizacion_usd := p_cotizacion_usd;
    ELSE
        SELECT COALESCE(
            (SELECT valor_por_usd FROM p_divisas WHERE nombre = COALESCE(
                (SELECT moneda_default FROM p_config_region WHERE user_id = v_user_id),
                'ARS') ORDER BY ultima_actualizacion DESC LIMIT 1),
            1.00)
          INTO v_cotizacion_usd;
    END IF;

    IF p_resumen_real IS NOT NULL AND p_resumen_real < 0 THEN
        RAISE EXCEPTION '{"key": "error_resumen_real_invalido", "params": {}}';
    END IF;

    -- Objetivo de pago (opcional): 'anterior' | 'actual' | NULL.
    -- NULL = comportamiento legacy (liquida todas las cuotas hasta el ciclo en curso).
    -- Con objetivo, el pago se aplica SOLO a las cuotas del resumen elegido,
    -- con la misma logica de proximo vencimiento que fn_reporte_vencimientos_tarjetas
    -- (mes de la fecha de pago + dia_vencimiento). Una sola fuente de verdad para
    -- los limites del ciclo entre reporte y pago.
    IF p_objetivo IS NOT NULL AND p_objetivo NOT IN ('anterior', 'actual') THEN
        RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
    END IF;

    IF p_objetivo IS NOT NULL THEN
        IF EXTRACT(DAY FROM p_fecha_pago) <= v_dia_vencimiento THEN
            v_prox_venc := date_trunc('month', p_fecha_pago) + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        ELSE
            v_prox_venc := (date_trunc('month', p_fecha_pago) + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        END IF;
        IF p_objetivo = 'anterior' THEN
            v_objetivo_hasta := date_trunc('month', v_prox_venc)::date - 1;
        ELSE
            v_objetivo_desde := date_trunc('month', v_prox_venc)::date;
            v_objetivo_hasta := v_prox_venc::date;
        END IF;
        -- El objetivo elegido debe tener al menos una cuota pendiente.
        IF NOT EXISTS (
            SELECT 1 FROM p_cuotas_detalle
            WHERE tarjeta_id = p_tarjeta_id AND pagado = false
              AND (v_objetivo_desde IS NULL OR fecha_estimada_pago >= v_objetivo_desde)
              AND (v_objetivo_hasta IS NULL OR fecha_estimada_pago <= v_objetivo_hasta)
        ) THEN
            RAISE EXCEPTION '{"key": "error_resumen_sin_cuotas_pendientes", "params": {}}';
        END IF;
    END IF;

    FOR v_linea IN
        SELECT jsonb_array_elements(p_pagos)
    LOOP
        v_billetera_id := NULLIF(v_linea->>'billetera_id', '')::bigint;
        v_monto := NULLIF(v_linea->>'monto', '')::numeric;
        v_target := NULLIF(v_linea->>'target_moneda_cuota', '');
        v_moneda_pago := NULL;
        v_saldo_billetera := 0;

        IF v_monto IS NULL OR v_monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
        END IF;

        IF v_billetera_id IS NULL THEN
            v_moneda_pago := v_linea->>'moneda';
            IF v_moneda_pago IS NULL OR v_moneda_pago NOT IN (v_moneda_local, 'USD') THEN
                RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
            END IF;
        ELSE
            SELECT moneda, COALESCE(saldo_actual, 0)
              INTO v_moneda_pago, v_saldo_billetera
              FROM p_billeteras
              WHERE billetera_id = v_billetera_id AND user_id = v_user_id
                AND activa = true AND es_fondo_prevision = false;
            IF v_moneda_pago IS NULL THEN
                RAISE EXCEPTION '{"key": "error_wallet_not_operative", "params": {}}';
            END IF;

            v_wallet_key := v_billetera_id::text;
            v_dup := (v_seen_billeteras ? v_wallet_key);
            IF v_dup THEN
                RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
            END IF;
            v_seen_billeteras := v_seen_billeteras || jsonb_build_object(v_wallet_key, true);
        END IF;

        v_moneda_target := COALESCE(v_target, v_moneda_pago);
        IF v_moneda_target NOT IN (v_moneda_local, 'USD') THEN
            RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
        END IF;

        v_monto_target := v_monto;
        IF v_moneda_pago = v_moneda_local AND v_moneda_target = 'USD' THEN
            v_monto_target := v_monto / v_cotizacion_usd;
        ELSIF v_moneda_pago = 'USD' AND v_moneda_target = v_moneda_local THEN
            v_monto_target := v_monto * v_cotizacion_usd;
        ELSIF v_moneda_pago != v_moneda_target THEN
            RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
        END IF;

        v_total_pagado := v_total_pagado + v_monto;

        IF v_billetera_id IS NOT NULL AND v_monto > v_saldo_billetera + 0.009 THEN
            RAISE EXCEPTION '{"key": "error_wallet_saldo_insuficiente", "params": {}}';
        END IF;

        IF v_billetera_id IS NULL THEN
            IF v_moneda_pago = v_moneda_local THEN
                v_total_favor_ars := v_total_favor_ars + v_monto;
            ELSE
                v_total_favor_usd := v_total_favor_usd + v_monto;
            END IF;
        END IF;

        v_pagos_aplicados := v_pagos_aplicados || jsonb_build_object(
            'monto_origen', v_monto,
            'moneda_origen', v_moneda_pago,
            'monto_target', v_monto_target,
            'moneda_target', v_moneda_target,
            'recargo_aplicado', false,
            'billetera_id', v_billetera_id
        );
    END LOOP;

    -- Permitir array vacÃÂ­o SOLO si hay saldo a favor (Bug 6).
    IF v_total_pagado = 0 AND jsonb_array_length(p_pagos) > 0 THEN
        RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
    END IF;
    IF v_total_pagado = 0 AND v_saldo_favor_inicial_ars <= 0 AND v_saldo_favor_inicial_usd <= 0 THEN
        RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
    END IF;

    -- Calcular el total del ciclo actual (necesario para Bug 6 cuando p_pagos vacÃÂ­o).
    SELECT
        COALESCE(SUM(CASE WHEN moneda = v_moneda_local THEN monto_cuota ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN monto_cuota ELSE 0 END), 0)
      INTO v_total_mes_calculado_ars, v_total_mes_calculado_usd
      FROM p_cuotas_detalle
      WHERE tarjeta_id = p_tarjeta_id AND pagado = false
        AND (v_objetivo_desde IS NULL OR fecha_estimada_pago >= v_objetivo_desde)
        AND (v_objetivo_hasta IS NULL OR fecha_estimada_pago <= v_objetivo_hasta);

    -- Bug 6: si p_pagos vacÃÂ­o y hay saldo a favor, crear fila raÃÂ­z en p_caja
    -- ANTES del LOOP para que el LOOP no la pise. Pero el LOOP resetea.
    -- SoluciÃÂ³n: el INSERT raÃÂ­z va DESPUÃâ°S del LOOP, solo si v_primer_caja_id quedÃÂ³ NULL.

    IF v_total_favor_ars > 0 THEN
        UPDATE p_tarjetas_credito
          SET saldo_a_favor = COALESCE(saldo_a_favor, 0) - v_total_favor_ars
          WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
    END IF;
    IF v_total_favor_usd > 0 THEN
        UPDATE p_tarjetas_credito
          SET saldo_a_favor_usd = COALESCE(saldo_a_favor_usd, 0) - v_total_favor_usd
          WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
    END IF;

    -- INSERT en p_caja: una fila por lÃÂ­nea, con parent_pago_caja_id apuntando al root.
    v_primer_caja_id := NULL;
    FOR v_pago IN
        SELECT jsonb_array_elements(v_pagos_aplicados)
    LOOP
        v_billetera_id := NULLIF(v_pago->>'billetera_id', '')::bigint;
        v_monto := (v_pago->>'monto_origen')::numeric;
        v_moneda_pago := v_pago->>'moneda_origen';

        IF v_primer_caja_id IS NULL THEN
            IF v_billetera_id IS NULL THEN
                INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id, moneda, parent_pago_caja_id, resumen_real)
                  VALUES (v_user_id, 'pago_tarjeta', NULL, v_monto, p_fecha_pago, 'card_summary_payment_favor', p_tarjeta_id, v_moneda_pago, NULL, p_resumen_real)
                  RETURNING p_caja_id INTO v_caja_id;
            ELSE
                INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id, moneda, parent_pago_caja_id, resumen_real)
                  VALUES (v_user_id, 'pago_tarjeta', v_billetera_id, v_monto, p_fecha_pago, 'card_summary_payment_multi', p_tarjeta_id, v_moneda_pago, NULL, p_resumen_real)
                  RETURNING p_caja_id INTO v_caja_id;
            END IF;
            v_primer_caja_id := v_caja_id;
        ELSE
            IF v_billetera_id IS NULL THEN
                INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id, moneda, parent_pago_caja_id, resumen_real)
                   VALUES (v_user_id, 'pago_tarjeta', NULL, v_monto, p_fecha_pago, 'card_summary_payment_split', p_tarjeta_id, v_moneda_pago, v_primer_caja_id, p_resumen_real);
            ELSE
                INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id, moneda, parent_pago_caja_id, resumen_real)
                  VALUES (v_user_id, 'pago_tarjeta', v_billetera_id, v_monto, p_fecha_pago, 'card_summary_payment_split', p_tarjeta_id, v_moneda_pago, v_primer_caja_id, p_resumen_real);
            END IF;
        END IF;
    END LOOP;

    -- Bug 6: si p_pagos vacÃÂ­o y no se creÃÂ³ fila raÃÂ­z, crear una aquÃÂ­
    -- (necesaria para p_pagos_tarjeta_log.p_caja_id NOT NULL).
    IF v_primer_caja_id IS NULL AND (v_saldo_favor_inicial_ars > 0 OR v_saldo_favor_inicial_usd > 0) THEN
        IF v_saldo_favor_inicial_ars > 0 THEN
            v_monto := LEAST(v_saldo_favor_inicial_ars, v_total_mes_calculado_ars + v_total_mes_calculado_usd * v_cotizacion_usd);
            v_moneda_pago := v_moneda_local;
        ELSE
            v_monto := LEAST(v_saldo_favor_inicial_usd, v_total_mes_calculado_usd + v_total_mes_calculado_ars / GREATEST(v_cotizacion_usd, 0.0001));
            v_moneda_pago := 'USD';
        END IF;
        INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id, moneda, resumen_real)
          VALUES (v_user_id, 'pago_tarjeta', NULL, GREATEST(v_monto, 0), p_fecha_pago, 'card_summary_payment_favor', p_tarjeta_id, v_moneda_pago, p_resumen_real)
          RETURNING p_caja_id INTO v_primer_caja_id;
    END IF;

    v_sobrante_total := fn_liquidar_ciclo_tarjeta_multi(
        p_tarjeta_id, v_user_id, p_fecha_pago, v_primer_caja_id,
        v_pagos_aplicados, v_cotizacion_usd, 0,
        v_objetivo_desde, v_objetivo_hasta
    );

    -- Fix resumen real 2026-09-15: cuando el banco debito mas que la ventana de
    -- cuotas de la app (p_resumen_real > liquidado), el objetivo de cubrimiento
    -- pasa a ser el resumen real declarado. El favor cubre la diferencia hasta
    -- donde alcance, igual que el gap-fill de la ventana; recien el excedente
    -- por ENCIMA del resumen real es sobrante acreditable.
    IF p_resumen_real IS NOT NULL AND p_resumen_real > 0.01 THEN
        -- Pozo puesto por el usuario: lineas de pago (monto_target) + gap-fill de
        -- favor (aporte del log). NO usar sobrante+liquidado: el sobrante se clampea
        -- a 0 cuando hay refinanciado y sobreestimaria lo cubierto.
        SELECT COALESCE(SUM((elem->>'monto_target')::numeric) FILTER (WHERE (elem->>'moneda_target') = v_moneda_local), 0)
             + COALESCE(SUM((elem->>'monto_target')::numeric) FILTER (WHERE (elem->>'moneda_target') = 'USD'), 0) * v_cotizacion_usd
          INTO v_cubierto_res
          FROM jsonb_array_elements(v_pagos_aplicados) AS jt(elem);
        SELECT v_cubierto_res + COALESCE(aporte_saldo, 0) + COALESCE(aporte_saldo_usd, 0) * v_cotizacion_usd
          INTO v_cubierto_res
          FROM p_pagos_tarjeta_log
         WHERE p_caja_id = v_primer_caja_id;
        DECLARE
            v_falta_banco numeric;
            v_tomar_ars_res numeric;
            v_tomar_usd_res numeric;
        BEGIN
            IF p_resumen_real > v_cubierto_res + 0.009 THEN
                v_falta_banco := p_resumen_real - v_cubierto_res;
                SELECT COALESCE(saldo_a_favor, 0), COALESCE(saldo_a_favor_usd, 0)
                  INTO v_saldo_favor_actual_ars, v_saldo_favor_actual_usd
                  FROM p_tarjetas_credito
                 WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
                v_tomar_ars_res := LEAST(v_saldo_favor_actual_ars, v_falta_banco);
                v_tomar_usd_res := 0;
                IF v_falta_banco > v_tomar_ars_res AND v_saldo_favor_actual_usd > 0 AND v_cotizacion_usd > 0 THEN
                    v_tomar_usd_res := LEAST(v_saldo_favor_actual_usd, (v_falta_banco - v_tomar_ars_res) / v_cotizacion_usd);
                END IF;
                IF v_tomar_ars_res > 0 THEN
                    UPDATE p_tarjetas_credito
                      SET saldo_a_favor = COALESCE(saldo_a_favor, 0) - v_tomar_ars_res
                      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
                END IF;
                IF COALESCE(v_tomar_usd_res, 0) > 0 THEN
                    UPDATE p_tarjetas_credito
                      SET saldo_a_favor_usd = COALESCE(saldo_a_favor_usd, 0) - v_tomar_usd_res
                      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
                END IF;
                v_favor_extra_res := v_tomar_ars_res + COALESCE(v_tomar_usd_res, 0) * v_cotizacion_usd;
                v_favor_acreditado := v_favor_acreditado - v_favor_extra_res;
            END IF;
        END;
    END IF;

    -- Sumar el saldo a favor disponible como respaldo para adelantar cuotas.
    -- El ciclo ARS/USD puede haberse liquidado sin consumir todo el favor previo,
    -- pero el favor sigue disponible para cancelar cuotas adelantadas.
    -- Coincide con el calculo del frontend (totalPagar + favorNum - cicloBruto).
    SELECT COALESCE(saldo_a_favor, 0), COALESCE(saldo_a_favor_usd, 0)
      INTO v_saldo_favor_actual_ars, v_saldo_favor_actual_usd
      FROM p_tarjetas_credito
      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

    v_favor_disponible_equiv := v_saldo_favor_actual_ars
        + (v_saldo_favor_actual_usd * v_cotizacion_usd);

    -- Restaurar logica de adelantar cuotas: validar, liquidar y registrar en log.
    IF p_cuotas_adelantar IS NOT NULL AND array_length(p_cuotas_adelantar, 1) > 0 THEN
        IF EXISTS (
            SELECT 1
            FROM unnest(p_cuotas_adelantar) AS sel(cuota_id)
            LEFT JOIN p_cuotas_detalle cd
                   ON cd.cuota_id = sel.cuota_id
                  AND cd.user_id = v_user_id
                  AND cd.tarjeta_id = p_tarjeta_id
                  AND cd.pagado = false
            WHERE cd.cuota_id IS NULL
        ) THEN
            RAISE EXCEPTION '{"key": "error_cuota_adelanto_invalida", "params": {}}';
        END IF;

        FOR v_cuota_adelantada_id IN
            SELECT DISTINCT ON (cd.cuota_id) cd.cuota_id
              FROM unnest(p_cuotas_adelantar) AS sel(cuota_id)
              JOIN p_cuotas_detalle cd ON cd.cuota_id = sel.cuota_id
             WHERE cd.user_id = v_user_id
               AND cd.tarjeta_id = p_tarjeta_id
               AND cd.pagado = false
             ORDER BY cd.cuota_id, cd.fecha_estimada_pago ASC
        LOOP
            SELECT monto_cuota, moneda
              INTO v_cuota_adelantada_monto, v_cuota_adelantada_moneda
              FROM p_cuotas_detalle
             WHERE cuota_id = v_cuota_adelantada_id;

            IF v_cuota_adelantada_moneda = 'USD' THEN
                v_cuota_adelantada_monto := v_cuota_adelantada_monto * v_cotizacion_usd;
            END IF;

            IF v_cuota_adelantada_monto > v_sobrante_total + v_favor_disponible_equiv + 0.009 THEN
                RAISE EXCEPTION '{"key": "error_sobrante_insuficiente_cuota", "params": {}}';
            END IF;

            UPDATE p_cuotas_detalle
               SET pagado = true,
                   p_caja_id = v_primer_caja_id
             WHERE cuota_id = v_cuota_adelantada_id;

            v_sobrante_total := v_sobrante_total - v_cuota_adelantada_monto;

            IF v_cuota_adelantada_moneda = 'ARS' THEN
                v_total_adelantado_ars := v_total_adelantado_ars + v_cuota_adelantada_monto;
            ELSE
                v_total_adelantado_usd := v_total_adelantado_usd + (v_cuota_adelantada_monto / v_cotizacion_usd);
            END IF;

            v_cuotas_adelantadas_log := v_cuotas_adelantadas_log || jsonb_build_object(
                'cuota_id', v_cuota_adelantada_id,
                'monto', (SELECT monto_cuota FROM p_cuotas_detalle WHERE cuota_id = v_cuota_adelantada_id),
                'moneda', v_cuota_adelantada_moneda
            );
        END LOOP;

        IF v_total_adelantado_ars > 0 OR v_total_adelantado_usd > 0 THEN
            UPDATE p_pagos_tarjeta_log
               SET cuotas_adelantadas = v_cuotas_adelantadas_log,
                   total_adelantado_ars = v_total_adelantado_ars,
                   total_adelantado_usd = v_total_adelantado_usd
             WHERE p_caja_id = v_primer_caja_id;
        END IF;
    END IF;

    -- Debitar del saldo a favor lo que se consumio para adelantar cuotas
    -- (lo que excedio el sobrante del pago). v_sobrante_total quedo negativo
    -- porque el check incluyo el favor disponible y luego el LOOP decremento sin limite.
    IF v_sobrante_total < 0 AND (v_total_adelantado_ars > 0 OR v_total_adelantado_usd > 0) THEN
        v_deficit := -v_sobrante_total;
        v_tomar_ars := LEAST(v_saldo_favor_actual_ars, v_deficit);
        v_tomar_usd := 0;
        IF v_deficit > v_tomar_ars AND v_saldo_favor_actual_usd > 0 AND v_cotizacion_usd > 0 THEN
            v_tomar_usd := LEAST(v_saldo_favor_actual_usd, (v_deficit - v_tomar_ars) / v_cotizacion_usd);
        END IF;
        -- Trackear el debito de favor para que la reversion lo restaure.
        v_favor_acreditado := v_favor_acreditado - (v_tomar_ars + COALESCE(v_tomar_usd, 0) * v_cotizacion_usd);
        IF v_tomar_ars > 0 THEN
            UPDATE p_tarjetas_credito
              SET saldo_a_favor = COALESCE(saldo_a_favor, 0) - v_tomar_ars
              WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
        END IF;
        IF v_tomar_usd > 0 THEN
            UPDATE p_tarjetas_credito
              SET saldo_a_favor_usd = COALESCE(saldo_a_favor_usd, 0) - v_tomar_usd
              WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
        END IF;
        v_sobrante_total := 0;
    END IF;

    -- Sobrante remanente tras adelantar cuotas: acreditarlo a saldo_a_favor.
    -- Si p_monto_a_favor_explicito esta seteado, usar ESE monto (el front calculo
    -- el excedente real con su modelo de patrimonio vs resumen real / ciclo).
    -- Si no, comportamiento legacy: acreditar v_sobrante_total, salvo que el front
    -- haya pedido p_no_acreditar_favor = TRUE (caso Diferencia Tarjeta).
    IF p_resumen_real IS NOT NULL AND p_resumen_real > 0.01 AND NOT p_no_acreditar_favor THEN
        -- Con resumen real declarado, el unico excedente acreditable es lo pagado
        -- por ENCIMA del resumen del banco (pozo + aporte + favor extra - resumen
        -- real). Sin esto, pagar la diferencia del banco hoy acreditaba el sobrante
        -- de la ventana como favor y ademas registraba la Diferencia Tarjeta
        -- (doble conteo de la misma plata).
        DECLARE
            v_credito_res numeric := GREATEST(
                v_cubierto_res - p_resumen_real
                - (v_total_adelantado_ars + v_total_adelantado_usd * v_cotizacion_usd), 0);
        BEGIN
            IF v_credito_res > 0.01 THEN
                UPDATE p_tarjetas_credito
                  SET saldo_a_favor = COALESCE(saldo_a_favor, 0) + v_credito_res
                  WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
                v_favor_acreditado := v_favor_acreditado + v_credito_res;
            END IF;
        END;
    ELSIF p_monto_a_favor_explicito IS NOT NULL AND p_monto_a_favor_explicito > 0.01 THEN
        UPDATE p_tarjetas_credito
          SET saldo_a_favor = COALESCE(saldo_a_favor, 0) + p_monto_a_favor_explicito
          WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
        v_favor_acreditado := v_favor_acreditado + p_monto_a_favor_explicito;
    ELSIF v_sobrante_total > 0 AND NOT p_no_acreditar_favor THEN
        UPDATE p_tarjetas_credito
          SET saldo_a_favor = COALESCE(saldo_a_favor, 0) + v_sobrante_total
          WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
        v_favor_acreditado := v_favor_acreditado + v_sobrante_total;
    END IF;

    -- Persistir el NETO de favor acreditado/debitado por este pago para que
    -- la reversion (fn_t_limpiar_dependencias_caja) lo descuenta exactamente.
    UPDATE p_pagos_tarjeta_log
       SET favor_acreditado = v_favor_acreditado
     WHERE p_caja_id = v_primer_caja_id;

    -- Trazabilidad: si el user declaro resumen real, comparar lo que el banco
    -- debito contra lo que la app cubrio realmente. Si la app cubrio menos,
    -- crear una Diferencia Tarjeta (gasto) por el delta, vinculada al pago
    -- raiz para que borrar el pago tambien borre la Diferencia.
    -- Excluir cuando p_no_acreditar_favor = TRUE (modo legacy donde el front
    -- ya crea el ajuste por su cuenta con fn_registrar_ajuste_diferencia_tarjeta).
    IF p_resumen_real IS NOT NULL AND v_primer_caja_id IS NOT NULL AND NOT p_no_acreditar_favor THEN
        DECLARE
            v_consumo_real_ars numeric := 0;
            v_diferencia_banco_ars numeric := 0;
            v_cat_card_diff_id bigint;
        BEGIN
            -- Leer del log lo que la app realmente cubrio del ciclo: liquidado (cuotas
            -- pagadas en el ciclo) + refinanciado (giro a proximo ciclo). Ambos en ARS
            -- equivalentes (refinanciado ya es suma ARS+USD*cotizacion).
            SELECT
                COALESCE(liquidado, 0)
                    + COALESCE(refinanciado_ars, 0)
                    + COALESCE(refinanciado_usd, 0) * v_cotizacion_usd
              INTO v_consumo_real_ars
              FROM p_pagos_tarjeta_log
             WHERE p_caja_id = v_primer_caja_id;

            v_diferencia_banco_ars := p_resumen_real - v_consumo_real_ars;

            -- Si el banco debito mas de lo que la app cubrio, registrar Diferencia Tarjeta
            -- como gasto en la cuenta de sistema 'Diferencia Tarjeta' (cat_card_diff).
            IF v_diferencia_banco_ars > 0.01 THEN
                SELECT estructura_id INTO v_cat_card_diff_id
                  FROM p_estructuras_egresos
                 WHERE user_id = v_user_id AND nombre_cuenta = 'cat_card_diff'
                 LIMIT 1;

                -- Fix 2026-09-15: auto-crear la cuenta de sistema si no existe
                -- (misma convencion que fn_registrar_ajuste_diferencia_tarjeta).
                -- Sin esto, usuarios sin la estructura saltaban el ajuste en silencio.
                IF v_cat_card_diff_id IS NULL THEN
                    INSERT INTO p_estructuras_egresos (user_id, nombre_cuenta, tipo_cupo, descripcion, icono, color)
                    VALUES (v_user_id, 'cat_card_diff', 'need',
                            'Diferencias entre resumen de tarjeta y valor del banco', '💳', '#8B5CF6')
                    RETURNING estructura_id INTO v_cat_card_diff_id;
                END IF;

                IF v_cat_card_diff_id IS NOT NULL THEN
                    INSERT INTO p_caja (
                        user_id, tipo, billetera_origen_id, valor_egreso, fecha,
                        detalle, tarjeta_id, estructura_egreso_id, moneda,
                        parent_pago_caja_id, resumen_real
                    ) VALUES (
                        v_user_id, 'adjustment', NULL, v_diferencia_banco_ars, p_fecha_pago,
                        'adjustment_card_diff', p_tarjeta_id, v_cat_card_diff_id, 'ARS',
                        v_primer_caja_id, p_resumen_real
                    );
                END IF;
            END IF;
        END;
    END IF;

    RETURN v_primer_caja_id;
END;
$function$;


DROP FUNCTION IF EXISTS public.fn_liquidar_ciclo_tarjeta_multi(bigint, bigint, date, bigint, jsonb, numeric, numeric, date, date);

CREATE OR REPLACE FUNCTION public.fn_liquidar_ciclo_tarjeta_multi(p_tarjeta_id bigint, p_user_id bigint, p_fecha_pago date, p_pago_caja_id bigint, p_pagos_aplicados jsonb, p_cotizacion_usd numeric, p_recargo_dolar_pct numeric, p_cuotas_desde date DEFAULT NULL::date, p_cuotas_hasta date DEFAULT NULL::date)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$


DECLARE
    v_moneda_local text;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_mes_actual date := date_trunc('month', p_fecha_pago);
    v_fin_ciclo_actual date;
    v_vencimiento_ciclo_actual date;
    v_min_fecha date;
    v_prox_vencimiento date;
    v_mes_periodo date;
    v_saldo_favor_ars numeric := 0;
    v_saldo_favor_usd numeric := 0;
    v_pool_ars numeric := 0;
    v_pool_usd numeric := 0;
    v_total_mes_ars numeric := 0;
    v_total_mes_usd numeric := 0;
    v_aporte_saldo_ars numeric := 0;
    v_aporte_saldo_usd numeric := 0;
    v_sobrante_ars numeric := 0;
    v_sobrante_usd numeric := 0;
    v_refinanciado_ars numeric := 0;
    v_refinanciado_usd numeric := 0;
    v_cuotas_ids_ars bigint[] := '{}';
    v_cuotas_ids_usd bigint[] := '{}';
    v_cuota_refi_ars_id bigint;
    v_cuota_refi_usd_id bigint;
    v_total_pagado_gross numeric := 0;
    r_cuota RECORD;
    v_pago jsonb;
    v_sobrante_total numeric := 0;
BEGIN

    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = p_user_id), 'ARS') INTO v_moneda_local;
    SELECT dia_cierre, dia_vencimiento, COALESCE(saldo_a_favor, 0), COALESCE(saldo_a_favor_usd, 0)
      INTO v_dia_cierre, v_dia_vencimiento, v_saldo_favor_ars, v_saldo_favor_usd
      FROM p_tarjetas_credito
      WHERE tarjeta_id = p_tarjeta_id;

    v_dia_cierre := COALESCE(v_dia_cierre, 20);
    v_dia_vencimiento := COALESCE(v_dia_vencimiento, 10);

    IF v_dia_vencimiento > v_dia_cierre THEN
        IF EXTRACT(DAY FROM p_fecha_pago) <= v_dia_cierre THEN
            v_fin_ciclo_actual := v_mes_actual + ((v_dia_cierre - 1) * INTERVAL '1 day');
        ELSE
            v_fin_ciclo_actual := (v_mes_actual + INTERVAL '1 month') + ((v_dia_cierre - 1) * INTERVAL '1 day');
        END IF;
    ELSE
        IF EXTRACT(DAY FROM p_fecha_pago) <= v_dia_cierre THEN
            v_fin_ciclo_actual := (v_mes_actual - INTERVAL '1 month') + ((v_dia_cierre - 1) * INTERVAL '1 day');
        ELSE
            v_fin_ciclo_actual := v_mes_actual + ((v_dia_cierre - 1) * INTERVAL '1 day');
        END IF;
    END IF;

    IF v_dia_vencimiento <= v_dia_cierre THEN
        v_vencimiento_ciclo_actual := (date_trunc('month', v_fin_ciclo_actual) + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
    ELSE
        v_vencimiento_ciclo_actual := date_trunc('month', v_fin_ciclo_actual) + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
    END IF;

    SELECT MIN(p_cuotas_detalle.fecha_estimada_pago) INTO v_min_fecha
      FROM p_cuotas_detalle
      WHERE p_cuotas_detalle.tarjeta_id = p_tarjeta_id AND p_cuotas_detalle.pagado = false;

    IF v_min_fecha IS NOT NULL AND v_min_fecha > v_vencimiento_ciclo_actual THEN
        v_vencimiento_ciclo_actual := v_min_fecha;
    END IF;

    SELECT
        COALESCE(SUM((elem->>'monto_target')::numeric) FILTER (WHERE (elem->>'moneda_target') = v_moneda_local), 0),
        COALESCE(SUM((elem->>'monto_target')::numeric) FILTER (WHERE (elem->>'moneda_target') = 'USD'), 0)
      INTO v_pool_ars, v_pool_usd
      FROM jsonb_array_elements(p_pagos_aplicados) AS x(elem);

    FOR r_cuota IN
        SELECT cuota_id, monto_cuota, fecha_estimada_pago, moneda
          FROM p_cuotas_detalle
          WHERE tarjeta_id = p_tarjeta_id
            AND pagado = false
            -- Ventana explicita (p_objetivo) reemplaza el tope legacy del ciclo;
            -- sin ventana, se mantiene el comportamiento original.
            AND (p_cuotas_desde IS NOT NULL OR date_trunc('month', fecha_estimada_pago) <= date_trunc('month', v_vencimiento_ciclo_actual))
            AND (p_cuotas_desde IS NULL OR fecha_estimada_pago >= p_cuotas_desde)
            AND (p_cuotas_hasta IS NULL OR fecha_estimada_pago <= p_cuotas_hasta)
          ORDER BY fecha_estimada_pago ASC
    LOOP
        IF r_cuota.moneda = v_moneda_local THEN
            UPDATE p_cuotas_detalle
              SET pagado = true  -- fix 2026-09-15: conservar caja_id original (vinculo con la compra)
              WHERE cuota_id = r_cuota.cuota_id;
            v_total_mes_ars := v_total_mes_ars + r_cuota.monto_cuota;
            v_cuotas_ids_ars := array_append(v_cuotas_ids_ars, r_cuota.cuota_id);

            SELECT date_trunc('month',
                CASE
                    WHEN EXTRACT(DAY FROM r_cuota.fecha_estimada_pago) >= COALESCE(cfg.dia_ancla_ciclo, 1)
                    THEN date_trunc('month', r_cuota.fecha_estimada_pago) + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                    ELSE (date_trunc('month', r_cuota.fecha_estimada_pago) - INTERVAL '1 month') + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                END
            )::date INTO v_mes_periodo
              FROM p_presupuestos_config cfg WHERE cfg.user_id = p_user_id;

            UPDATE p_compromisos_tarjeta SET pagado = true
              WHERE tarjeta_id = p_tarjeta_id AND user_id = p_user_id
                AND mes_periodo = v_mes_periodo AND pagado = false;
        ELSIF r_cuota.moneda = 'USD' THEN
            UPDATE p_cuotas_detalle
              SET pagado = true  -- fix 2026-09-15: conservar caja_id original (vinculo con la compra)
              WHERE cuota_id = r_cuota.cuota_id;
            v_total_mes_usd := v_total_mes_usd + r_cuota.monto_cuota;
            v_cuotas_ids_usd := array_append(v_cuotas_ids_usd, r_cuota.cuota_id);

            SELECT date_trunc('month',
                CASE
                    WHEN EXTRACT(DAY FROM r_cuota.fecha_estimada_pago) >= COALESCE(cfg.dia_ancla_ciclo, 1)
                    THEN date_trunc('month', r_cuota.fecha_estimada_pago) + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                    ELSE (date_trunc('month', r_cuota.fecha_estimada_pago) - INTERVAL '1 month') + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                END
            )::date INTO v_mes_periodo
              FROM p_presupuestos_config cfg WHERE cfg.user_id = p_user_id;

            UPDATE p_compromisos_tarjeta SET pagado = true
              WHERE tarjeta_id = p_tarjeta_id AND user_id = p_user_id
                AND mes_periodo = v_mes_periodo AND pagado = false;
        END IF;
    END LOOP;

    -- Auto-aporte desde saldo_a_favor: cuando el pool de billeteras + favor explÃÂ­cito no alcanza.
    -- El RPC principal ya debitÃÂ³ el favor explÃÂ­cito; el helper puede aportar ADEMÃÂS desde
    -- saldo_a_favor si queda shortfall.
    IF v_total_mes_ars > 0 AND v_saldo_favor_ars > 0 THEN
        -- Gap fix 2026-09-15: el aporte llena SOLO la diferencia que falta
        -- (total - pool). Si el pool ya cubre el ciclo, el favor no se consume.
        v_aporte_saldo_ars := LEAST(v_saldo_favor_ars, GREATEST(v_total_mes_ars - v_pool_ars, 0));
        UPDATE p_tarjetas_credito
          SET saldo_a_favor = COALESCE(saldo_a_favor, 0) - v_aporte_saldo_ars
          WHERE tarjeta_id = p_tarjeta_id;
        v_pool_ars := v_pool_ars + v_aporte_saldo_ars;
    END IF;

    IF v_total_mes_usd > 0 AND v_saldo_favor_usd > 0 THEN
        v_aporte_saldo_usd := LEAST(v_saldo_favor_usd, GREATEST(v_total_mes_usd - v_pool_usd, 0));
        UPDATE p_tarjetas_credito
          SET saldo_a_favor_usd = COALESCE(saldo_a_favor_usd, 0) - v_aporte_saldo_usd
          WHERE tarjeta_id = p_tarjeta_id;
        v_pool_usd := v_pool_usd + v_aporte_saldo_usd;
    END IF;

    v_sobrante_ars := GREATEST(v_pool_ars - v_total_mes_ars, 0);
    v_sobrante_usd := GREATEST(v_pool_usd - v_total_mes_usd, 0);
    v_refinanciado_ars := GREATEST(v_total_mes_ars - v_pool_ars, 0);
    v_refinanciado_usd := GREATEST(v_total_mes_usd - v_pool_usd, 0);

    IF v_refinanciado_ars > 0 THEN
        IF v_dia_vencimiento <= v_dia_cierre THEN
            v_prox_vencimiento := (date_trunc('month', v_fin_ciclo_actual + INTERVAL '1 month') + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        ELSE
            v_prox_vencimiento := date_trunc('month', v_fin_ciclo_actual + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        END IF;

        INSERT INTO p_cuotas_detalle (user_id, tarjeta_id, numero_cuota, monto_cuota, moneda, fecha_estimada_pago, pagado)
          VALUES (p_user_id, p_tarjeta_id, 1, v_refinanciado_ars, v_moneda_local, v_prox_vencimiento, false)
          RETURNING cuota_id INTO v_cuota_refi_ars_id;

        SELECT date_trunc('month',
            CASE
                WHEN EXTRACT(DAY FROM v_prox_vencimiento) >= COALESCE(cfg.dia_ancla_ciclo, 1)
                THEN date_trunc('month', v_prox_vencimiento) + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                ELSE (date_trunc('month', v_prox_vencimiento) - INTERVAL '1 month') + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
            END
        )::date INTO v_mes_periodo
          FROM p_presupuestos_config cfg WHERE cfg.user_id = p_user_id;

        IF v_mes_periodo IS NULL THEN v_mes_periodo := date_trunc('month', v_prox_vencimiento)::date; END IF;

        INSERT INTO p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
          VALUES (p_tarjeta_id, p_user_id, v_refinanciado_ars, v_mes_periodo)
          ON CONFLICT (tarjeta_id, mes_periodo, user_id)
          DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
    END IF;

    IF v_refinanciado_usd > 0 THEN
        IF v_dia_vencimiento <= v_dia_cierre THEN
            v_prox_vencimiento := (date_trunc('month', v_fin_ciclo_actual + INTERVAL '1 month') + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        ELSE
            v_prox_vencimiento := date_trunc('month', v_fin_ciclo_actual + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        END IF;

        INSERT INTO p_cuotas_detalle (user_id, tarjeta_id, numero_cuota, monto_cuota, moneda, fecha_estimada_pago, pagado)
          VALUES (p_user_id, p_tarjeta_id, 1, v_refinanciado_usd, 'USD', v_prox_vencimiento, false)
          RETURNING cuota_id INTO v_cuota_refi_usd_id;

        SELECT date_trunc('month',
            CASE
                WHEN EXTRACT(DAY FROM v_prox_vencimiento) >= COALESCE(cfg.dia_ancla_ciclo, 1)
                THEN date_trunc('month', v_prox_vencimiento) + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                ELSE (date_trunc('month', v_prox_vencimiento) - INTERVAL '1 month') + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
            END
        )::date INTO v_mes_periodo
          FROM p_presupuestos_config cfg WHERE cfg.user_id = p_user_id;

        IF v_mes_periodo IS NULL THEN v_mes_periodo := date_trunc('month', v_prox_vencimiento)::date; END IF;

        INSERT INTO p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
          VALUES (p_tarjeta_id, p_user_id, v_refinanciado_usd, v_mes_periodo)
          ON CONFLICT (tarjeta_id, mes_periodo, user_id)
          DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
    END IF;

    -- Fix 2026-09-15: la acreditacion del sobrante a saldo_a_favor se hace UNA UNICA
-- VEZ en fn_registrar_pago_tarjeta_multi (al final, ya resuelto el adelanto de
-- cuotas). El credito interno que existia aqui duplicaba el sobrante y creaba
-- saldo a favor de la nada (bug de doble acreditacion detectado en tests).

    -- v_sobrante_total representa el excedente total (sumando ARS y USD convertido)
-- que el pago dejó libre para aplazar cuotas o devolver a billetera. Siempre es
-- positivo en esta fase; se devuelve tal cual (no se aplica el filtro de favor
-- explícito, eliminado en bugfix 2026-09-14 porque bloqueaba wallet-only overpayments).
v_sobrante_total := v_sobrante_ars + (v_sobrante_usd * p_cotizacion_usd);

    v_total_pagado_gross := (SELECT COALESCE(SUM((elem->>'monto_origen')::numeric), 0)
        FROM jsonb_array_elements(p_pagos_aplicados) AS arr(elem)
        WHERE (elem->>'moneda_origen') = v_moneda_local)
        + ((SELECT COALESCE(SUM((elem->>'monto_origen')::numeric), 0)
            FROM jsonb_array_elements(p_pagos_aplicados) AS arr(elem)
            WHERE (elem->>'moneda_origen') = 'USD') * p_cotizacion_usd);

    -- Audit log con campos per-moneda (Fase 5)
    INSERT INTO p_pagos_tarjeta_log (
        p_caja_id, user_id, tarjeta_id, monto_total,
        monto_total_ars, monto_total_usd,
        liquidado, aporte_saldo, refinanciado,
        cotizacion_usd, recargo_dolar_pct, pagos_aplicados,
        cuota_refi_id, cuotas_ids,
        aporte_saldo_usd, refinanciado_ars, refinanciado_usd,
        cuota_refi_id_ars, cuota_refi_id_usd
    ) VALUES (
        p_pago_caja_id, p_user_id, p_tarjeta_id,
        v_total_pagado_gross,
        v_total_mes_ars, v_total_mes_usd,
        v_total_mes_ars,
        v_aporte_saldo_ars,
        (v_refinanciado_ars + v_refinanciado_usd),
        p_cotizacion_usd, p_recargo_dolar_pct, p_pagos_aplicados,
        COALESCE(v_cuota_refi_ars_id, v_cuota_refi_usd_id),
        v_cuotas_ids_ars || v_cuotas_ids_usd,
        v_aporte_saldo_usd,
        v_refinanciado_ars,
        v_refinanciado_usd,
        v_cuota_refi_ars_id,
        v_cuota_refi_usd_id
    )
    ON CONFLICT (p_caja_id) DO UPDATE SET
        monto_total = EXCLUDED.monto_total,
        monto_total_ars = EXCLUDED.monto_total_ars,
        monto_total_usd = EXCLUDED.monto_total_usd,
        liquidado = EXCLUDED.liquidado,
        aporte_saldo = EXCLUDED.aporte_saldo,
        refinanciado = EXCLUDED.refinanciado,
        cotizacion_usd = EXCLUDED.cotizacion_usd,
        recargo_dolar_pct = EXCLUDED.recargo_dolar_pct,
        pagos_aplicados = EXCLUDED.pagos_aplicados,
        cuota_refi_id = EXCLUDED.cuota_refi_id,
        cuotas_ids = EXCLUDED.cuotas_ids,
        aporte_saldo_usd = EXCLUDED.aporte_saldo_usd,
        refinanciado_ars = EXCLUDED.refinanciado_ars,
        refinanciado_usd = EXCLUDED.refinanciado_usd,
        cuota_refi_id_ars = EXCLUDED.cuota_refi_id_ars,
        cuota_refi_id_usd = EXCLUDED.cuota_refi_id_usd;

    RETURN v_sobrante_total;
END;
$function$;


DROP FUNCTION IF EXISTS public.fn_cargar_movimientos_voz(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.fn_cargar_movimientos_voz(p_job_id uuid, p_movements jsonb)
 RETURNS TABLE(voice_movement_index integer, pendiente_id bigint, ok boolean, error_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_moneda_local text;
    v_user_id bigint;
    v_movement jsonb;
    v_index int;
    v_pending_id bigint;
    v_ok boolean;
    v_error_key text;

    v_tipo text;
    v_amount numeric;
    v_destination_amount numeric;
    v_expense_category_id bigint;
    v_source_wallet_id bigint;
    v_destination_wallet_id bigint;
    v_card_id bigint;
    v_income_source_id bigint;
    v_currency text;
    v_installments int;
    v_date date;
    v_note text;

    v_cat_exists boolean;
    v_wallet_exists boolean;
    v_dest_wallet_exists boolean;
    v_card_exists boolean;
    v_income_exists boolean;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_movements IS NULL OR jsonb_typeof(p_movements) <> 'array' THEN
        RAISE EXCEPTION '{"key": "error_invalid_request", "params": {"field": "p_movements"}}';
    END IF;

    v_index := 0;
    FOR v_movement IN SELECT * FROM jsonb_array_elements(p_movements)
    LOOP
        v_pending_id := NULL;
        v_ok := false;
        v_error_key := NULL;

        BEGIN
            v_tipo := v_movement->>'type';
            v_amount := (v_movement->>'amount')::numeric;
            v_destination_amount := NULLIF(v_movement->>'destination_amount', '')::numeric;

            v_expense_category_id := NULLIF(v_movement->>'expense_category_id', '')::bigint;
            v_source_wallet_id := NULLIF(v_movement->>'source_wallet_id', '')::bigint;
            v_destination_wallet_id := NULLIF(v_movement->>'destination_wallet_id', '')::bigint;
            v_card_id := NULLIF(v_movement->>'card_id', '')::bigint;
            v_income_source_id := NULLIF(v_movement->>'income_source_id', '')::bigint;

            v_currency := NULLIF(v_movement->>'currency', '');
            v_installments := NULLIF(v_movement->>'installments', '')::int;
            v_date := NULLIF(v_movement->>'date', '')::date;
            v_note := NULLIF(v_movement->>'note', '');

            -- Normalizacion: valores que violarian CHECKs se vuelven NULL
            -- (la cuarentena existe para datos incompletos; el usuario edita).
            IF v_destination_amount IS NOT NULL AND v_destination_amount <= 0 THEN
                v_destination_amount := NULL;
            END IF;
            IF v_installments IS NOT NULL AND v_installments <= 0 THEN
                v_installments := NULL;
            END IF;
            v_currency := UPPER(TRIM(COALESCE(v_currency, '')));
            IF v_currency = '' OR v_currency NOT IN (v_moneda_local, 'USD') THEN
                v_currency := NULL;
            END IF;

            IF v_tipo NOT IN ('expense', 'income', 'transfer', 'card_expense') THEN
                v_error_key := 'error_voice_invalid_type';
                INSERT INTO p_caja_cuarentena (
                    user_id, origen, tipo, estado, monto, fecha, detalle,
                    billetera_id, billetera_destino_id, tarjeta_id,
                    estructura_egreso_id, cuenta_ingreso_id,
                    moneda, cuotas, destination_amount,
                    metadata
                )
                VALUES (
                    v_user_id, 'voz', v_tipo, 'pendiente', COALESCE(v_amount, 0),
                    COALESCE(v_date, CURRENT_DATE), v_note,
                    v_source_wallet_id, v_destination_wallet_id, v_card_id,
                    v_expense_category_id, v_income_source_id,
                    v_currency, v_installments, v_destination_amount,
                    jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'parse_error', v_error_key)
                )
                RETURNING p_caja_cuarentena.pendiente_id INTO v_pending_id;

                RETURN QUERY SELECT v_index, v_pending_id, false, v_error_key;
                v_index := v_index + 1;
                CONTINUE;
            END IF;

            IF v_amount IS NULL OR v_amount <= 0 THEN
                v_error_key := 'error_voice_invalid_amount';
                INSERT INTO p_caja_cuarentena (
                    user_id, origen, tipo, estado, monto, fecha, detalle,
                    billetera_id, billetera_destino_id, tarjeta_id,
                    estructura_egreso_id, cuenta_ingreso_id,
                    moneda, cuotas, destination_amount,
                    metadata
                )
                VALUES (
                    v_user_id, 'voz', v_tipo, 'pendiente', COALESCE(v_amount, 0),
                    COALESCE(v_date, CURRENT_DATE), v_note,
                    v_source_wallet_id, v_destination_wallet_id, v_card_id,
                    v_expense_category_id, v_income_source_id,
                    v_currency, v_installments, v_destination_amount,
                    jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'parse_error', v_error_key)
                )
                RETURNING p_caja_cuarentena.pendiente_id INTO v_pending_id;

                RETURN QUERY SELECT v_index, v_pending_id, false, v_error_key;
                v_index := v_index + 1;
                CONTINUE;
            END IF;

            v_cat_exists := false;
            IF v_expense_category_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM p_estructuras_egresos
                    WHERE estructura_id = v_expense_category_id AND user_id = v_user_id
                ) INTO v_cat_exists;
                IF NOT v_cat_exists THEN v_expense_category_id := NULL; END IF;
            END IF;

            v_wallet_exists := false;
            IF v_source_wallet_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM p_billeteras
                    WHERE billetera_id = v_source_wallet_id AND user_id = v_user_id
                ) INTO v_wallet_exists;
                IF NOT v_wallet_exists THEN v_source_wallet_id := NULL; END IF;
            END IF;

            v_dest_wallet_exists := false;
            IF v_destination_wallet_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM p_billeteras
                    WHERE billetera_id = v_destination_wallet_id AND user_id = v_user_id
                ) INTO v_dest_wallet_exists;
                IF NOT v_dest_wallet_exists THEN v_destination_wallet_id := NULL; END IF;
            END IF;

            v_card_exists := false;
            IF v_card_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM p_tarjetas_credito
                    WHERE tarjeta_id = v_card_id AND user_id = v_user_id
                ) INTO v_card_exists;
                IF NOT v_card_exists THEN v_card_id := NULL; END IF;
            END IF;

            v_income_exists := false;
            IF v_income_source_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM p_ingresos
                    WHERE producto_id = v_income_source_id AND user_id = v_user_id
                ) INTO v_income_exists;
                IF NOT v_income_exists THEN v_income_source_id := NULL; END IF;
            END IF;

            IF v_tipo = 'card_expense' AND v_installments IS NULL THEN
                v_installments := 1;
            END IF;

            INSERT INTO p_caja_cuarentena (
                user_id, origen, tipo, estado, monto, fecha, detalle,
                billetera_id, billetera_destino_id, tarjeta_id,
                estructura_egreso_id, cuenta_ingreso_id,
                moneda, cuotas, destination_amount,
                metadata
            )
            VALUES (
                v_user_id, 'voz', v_tipo, 'pendiente', v_amount,
                COALESCE(v_date, CURRENT_DATE), v_note,
                v_source_wallet_id, v_destination_wallet_id, v_card_id,
                v_expense_category_id, v_income_source_id,
                v_currency, v_installments, v_destination_amount,
                jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'ambiguous_matches', v_movement->'ambiguous_matches')
            )
            RETURNING p_caja_cuarentena.pendiente_id INTO v_pending_id;

            v_ok := true;
            v_error_key := NULL;

        EXCEPTION WHEN OTHERS THEN
            v_ok := false;
            v_error_key := 'error_voice_parse_failed';
            v_pending_id := NULL;
            -- El movimiento NO se pierde: cae como item incompleto editable
            -- (tipo NULL, monto 0, fecha de hoy, el movimiento crudo en metadata).
            BEGIN
                INSERT INTO p_caja_cuarentena (
                    user_id, origen, tipo, estado, monto, fecha, detalle, metadata
                )
                VALUES (
                    v_user_id, 'voz', NULL, 'pendiente', 0, CURRENT_DATE, v_note,
                    jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'parse_error', v_error_key, 'raw_movement', v_movement)
                )
                RETURNING p_caja_cuarentena.pendiente_id INTO v_pending_id;
            EXCEPTION WHEN OTHERS THEN
                v_pending_id := NULL;
            END;
        END;

        RETURN QUERY SELECT v_index, v_pending_id, v_ok, v_error_key;
        v_index := v_index + 1;
    END LOOP;
END;
$function$;


DROP FUNCTION IF EXISTS public.fn_registrar_movimiento_caja(text, bigint, bigint, numeric, numeric, text, date, boolean, bigint, bigint, bigint, text, numeric);

CREATE OR REPLACE FUNCTION public.fn_registrar_movimiento_caja(p_tipo text, p_billetera_origen_id bigint, p_billetera_destino_id bigint DEFAULT NULL::bigint, p_valor_ingreso numeric DEFAULT 0, p_valor_egreso numeric DEFAULT 0, p_descripcion text DEFAULT NULL::text, p_fecha date DEFAULT CURRENT_DATE, p_es_compartido boolean DEFAULT false, p_estructura_egreso_id bigint DEFAULT NULL::bigint, p_proyecto_id bigint DEFAULT NULL::bigint, p_cuenta_ingreso_id bigint DEFAULT NULL::bigint, p_detalle text DEFAULT NULL::text, p_destination_amount numeric DEFAULT NULL::numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_moneda_local text;
    v_user_id bigint;
    v_caja_id int8;
    v_es_fondo boolean;
    v_origen record;
    v_destino record;
    v_monto numeric;
    v_destino_moneda text;
    v_titulo_key text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- ── Resolver billetera de origen (obligatoria para todo tipo) ──
    SELECT billetera_id, user_id, activa, moneda, es_fondo_prevision, saldo_actual
    INTO v_origen
    FROM public.p_billeteras
    WHERE billetera_id = p_billetera_origen_id;

    IF v_origen.billetera_id IS NULL OR v_origen.user_id <> v_user_id THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
    END IF;

    IF v_origen.activa = false THEN
        RAISE EXCEPTION '{"key": "error_wallet_inactive", "params": {}}';
    END IF;

    -- ── Validación específica por tipo ──
    IF p_tipo = 'expense' THEN
        IF v_origen.es_fondo_prevision = TRUE THEN
            RAISE EXCEPTION '{"key": "error_wallet_is_savings_fund", "params": {}}';
        END IF;

        v_monto := p_valor_egreso;
        IF v_monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;
        IF v_origen.saldo_actual < v_monto THEN
            RAISE EXCEPTION '{"key": "error_transfer_insufficient_balance", "params": {}}';
        END IF;
    ELSIF p_tipo = 'income' THEN
        v_monto := p_valor_ingreso;
        IF v_monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;
    ELSIF p_tipo = 'transfer' THEN
        v_monto := p_valor_egreso;
        IF v_monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;

        IF p_billetera_destino_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_destination_required", "params": {}}';
        END IF;

        IF p_billetera_destino_id = p_billetera_origen_id THEN
            RAISE EXCEPTION '{"key": "error_transfer_same_wallet", "params": {}}';
        END IF;

        SELECT billetera_id, user_id, activa, moneda, es_fondo_prevision
        INTO v_destino
        FROM public.p_billeteras
        WHERE billetera_id = p_billetera_destino_id;

        IF v_destino.billetera_id IS NULL OR v_destino.user_id <> v_user_id THEN
            RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
        END IF;

        IF v_destino.activa = false THEN
            RAISE EXCEPTION '{"key": "error_wallet_inactive", "params": {}}';
        END IF;

        -- Bloqueo de fila del origen para evitar carrera entre dos
        -- transferencias concurrentes que gasten el mismo saldo.
        PERFORM 1
        FROM public.p_billeteras
        WHERE billetera_id = p_billetera_origen_id
        FOR UPDATE;

        IF v_origen.saldo_actual < v_monto THEN
            RAISE EXCEPTION '{"key": "error_transfer_insufficient_balance", "params": {}}';
        END IF;

        -- ── Cuarentena pattern (fn_aprobar_cuarentena_v2): ARS <-> USD and any
        -- other cross-currency pair cannot move as one row; the move is a
        -- double insert split by currency with an explicit destination amount.
        IF v_origen.moneda <> v_destino.moneda THEN
            IF p_destination_amount IS NULL OR p_destination_amount <= 0 THEN
                RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "destination_amount"}}';
            END IF;

            -- The i18n TITLE key lives in detalle exactly like the cuarentena
            -- approval does (report leg titles read COALESCE(detalle, key)).
            -- The user note is preserved in metadata.nota.
            v_titulo_key := CASE
                WHEN v_destino.moneda = 'USD' AND v_origen.moneda = v_moneda_local THEN 'transfer_compra_dolares'
                WHEN v_origen.moneda = 'USD' AND v_destino.moneda = v_moneda_local THEN 'transfer_venta_dolares'
                ELSE 'transfer_entre_cuentas'
            END;

            INSERT INTO public.p_caja (
                user_id, tipo, billetera_origen_id,
                valor_egreso, valor_ingreso, nombre_cuenta_historico, fecha,
                es_compartido, proyecto_id, estructura_egreso_id, cuenta_ingreso_id,
                pagado_por_user_id, detalle, metadata, moneda, es_usd
            )
            VALUES (
                v_user_id, 'expense', v_origen.billetera_id,
                v_monto, 0, p_descripcion, p_fecha,
                p_es_compartido, p_proyecto_id, p_estructura_egreso_id, p_cuenta_ingreso_id,
                CASE WHEN p_es_compartido THEN v_user_id ELSE NULL END,
                v_titulo_key, jsonb_build_object('transfer_double_insert', true, 'nota', p_detalle),
                v_origen.moneda, (v_origen.moneda = 'USD')
            )
            RETURNING p_caja_id INTO v_caja_id;

            INSERT INTO public.p_caja (
                user_id, tipo, billetera_origen_id,
                valor_egreso, valor_ingreso, nombre_cuenta_historico, fecha,
                detalle, metadata, moneda, es_usd
            )
            VALUES (
                v_user_id, 'income', v_destino.billetera_id,
                0, p_destination_amount, p_descripcion, p_fecha,
                v_titulo_key, jsonb_build_object('transfer_double_insert', true, 'nota', p_detalle),
                v_destino.moneda, (v_destino.moneda = 'USD')
            );

            RETURN v_caja_id;
        END IF;
    ELSE
        RAISE EXCEPTION '{"key": "error_invalid_movement_type", "params": {}}';
    END IF;

    -- ── Insertar movimiento (los triggers actualizan los saldos) ──
    INSERT INTO p_caja (
        user_id, tipo, billetera_origen_id, billetera_destino_id,
        valor_ingreso, valor_egreso, nombre_cuenta_historico, fecha,
        es_compartido, proyecto_id, estructura_egreso_id, cuenta_ingreso_id,
        pagado_por_user_id, detalle
    )
    VALUES (
        v_user_id, p_tipo, p_billetera_origen_id, p_billetera_destino_id,
        p_valor_ingreso, p_valor_egreso, p_descripcion, p_fecha,
        p_es_compartido, p_proyecto_id, p_estructura_egreso_id, p_cuenta_ingreso_id,
        CASE WHEN p_es_compartido THEN v_user_id ELSE NULL END,
        p_detalle
    )
    RETURNING p_caja_id INTO v_caja_id;

    RETURN v_caja_id;
END;
$function$;


DROP FUNCTION IF EXISTS public.fn_gestionar_deuda(text, bigint, text, text, numeric, numeric, numeric, numeric, date, text);

CREATE OR REPLACE FUNCTION public.fn_gestionar_deuda(p_operacion text, p_prestamo_id bigint DEFAULT NULL::bigint, p_nombre_prestamo text DEFAULT NULL::text, p_tipo_deuda text DEFAULT NULL::text, p_saldo_actual numeric DEFAULT NULL::numeric, p_monto_original numeric DEFAULT NULL::numeric, p_tasa_anual_tna numeric DEFAULT NULL::numeric, p_cuota_mensual numeric DEFAULT NULL::numeric, p_proximo_vencimiento date DEFAULT NULL::date, p_moneda_iso text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_new_prestamo_id bigint;
    v_saldo numeric;
    v_monto numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_operacion = 'crear' THEN
        IF p_nombre_prestamo IS NULL OR p_saldo_actual IS NULL THEN
            RAISE EXCEPTION '{"key": "error_missing_required_fields", "params": {}}';
        END IF;

        v_monto := COALESCE(p_monto_original, p_saldo_actual, 0);
        v_saldo := COALESCE(p_saldo_actual, v_monto, 0);

        INSERT INTO public.p_prestamos (
            user_id,
            entidad_nombre,
            nombre_prestamo,
            tipo_entidad,
            tipo_deuda,
            tipo_flujo,
            monto_total_deuda,
            monto_original,
            monto_pagado_acumulado,
            saldo_actual,
            tasa_anual_tna,
            cuota_mensual,
            proximo_vencimiento,
            moneda_iso,
            estado
        ) VALUES (
            v_user_id,
            p_nombre_prestamo,
            p_nombre_prestamo,
            COALESCE(p_tipo_deuda, 'banco'),
            COALESCE(p_tipo_deuda, 'banco'),
            'debo',
            v_monto,
            v_monto,
            v_monto - v_saldo,
            v_saldo,
            COALESCE(p_tasa_anual_tna, 0),
            COALESCE(p_cuota_mensual, 0),
            p_proximo_vencimiento,
            COALESCE(p_moneda_iso, (SELECT COALESCE(moneda_default, 'ARS') FROM public.p_config_region WHERE user_id = (SELECT user_id FROM public.usuarios WHERE auth_id = auth.uid())), 'ARS'),
            'activo'
        )
        RETURNING prestamo_id INTO v_new_prestamo_id;

        -- Crear config de bola de nieve si no existe (para persistir estrategia)
        INSERT INTO public.p_config_bola_nieve (user_id, estrategia_activa, fecha_inicio_plan)
        VALUES (v_user_id, 'math', CURRENT_DATE)
        ON CONFLICT (user_id) DO NOTHING;

        RETURN v_new_prestamo_id;

    ELSIF p_operacion = 'editar' THEN
        IF p_prestamo_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        UPDATE public.p_prestamos SET
            entidad_nombre = COALESCE(p_nombre_prestamo, entidad_nombre),
            nombre_prestamo = COALESCE(p_nombre_prestamo, nombre_prestamo),
            tipo_entidad = COALESCE(p_tipo_deuda, tipo_entidad),
            tipo_deuda = COALESCE(p_tipo_deuda, tipo_deuda),
            monto_total_deuda = COALESCE(p_monto_original, monto_total_deuda),
            monto_original = COALESCE(p_monto_original, monto_original),
            saldo_actual = COALESCE(p_saldo_actual, saldo_actual),
            monto_pagado_acumulado = COALESCE(p_monto_original, monto_original) - COALESCE(p_saldo_actual, saldo_actual),
            tasa_anual_tna = COALESCE(p_tasa_anual_tna, tasa_anual_tna),
            cuota_mensual = COALESCE(p_cuota_mensual, cuota_mensual),
            proximo_vencimiento = COALESCE(p_proximo_vencimiento, proximo_vencimiento),
            moneda_iso = COALESCE(p_moneda_iso, moneda_iso)
        WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        RETURN p_prestamo_id;

    ELSIF p_operacion = 'archivar' THEN
        IF p_prestamo_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        UPDATE public.p_prestamos SET estado = 'archivado'
        WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        RETURN p_prestamo_id;

    ELSIF p_operacion = 'activar' THEN
        IF p_prestamo_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        UPDATE public.p_prestamos SET estado = 'activo'
        WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        RETURN p_prestamo_id;

    ELSE
        RAISE EXCEPTION '{"key": "error_invalid_operation", "params": {"operation": "%"}}', p_operacion;
    END IF;
END;
$function$;


DROP FUNCTION IF EXISTS public.fn_reporte_patrimonio_neto_consolidado();

CREATE OR REPLACE FUNCTION public.fn_reporte_patrimonio_neto_consolidado()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_cotizacion_usd numeric;
    v_moneda_local text;

    v_billeteras_ars numeric := 0;
    v_billeteras_usd numeric := 0;
    v_inversiones_ars numeric := 0;
    v_inversiones_usd numeric := 0;
    v_sobres_ars numeric := 0;
    v_sobres_usd numeric := 0;

    v_deudas numeric := 0;

    v_activo_total_ars numeric;
    v_pasivo_total_ars numeric;
    v_patrimonio_neto_ars numeric;
    v_patrimonio_neto_usd numeric;

    v_evolucion_12m jsonb := '[]'::jsonb;
    v_patrimonio_mes numeric;
    v_mes date;
    v_ingresos_mes numeric;
    v_egresos_mes numeric;
    v_ipc_mes numeric;
    v_patrimonio_acumulado numeric;

    v_patrimonio_hace_12m numeric;
    v_variacion_nominal numeric;
    v_inflacion_12m numeric;
    v_variacion_real numeric;
    v_mes_record date;
    v_patrimonio_record numeric;

    i int;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS') INTO v_moneda_local;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    -- La cotizacion que sirve es la del dolar EN LA MONEDA LOCAL del usuario, no la fila 'USD'
    -- (que vale 1 por definicion). Antes se leia 'USD' y los saldos en dolares se sumaban 1:1.
    SELECT r.moneda_default::text INTO v_moneda_local
    FROM p_config_region r WHERE r.user_id = v_user_id;

    SELECT p.valor_por_usd INTO v_cotizacion_usd
    FROM p_divisas p
    WHERE p.nombre = COALESCE(v_moneda_local, 'USD')
    ORDER BY p.ultima_actualizacion DESC LIMIT 1;
    v_cotizacion_usd := COALESCE(v_cotizacion_usd, 1.00);

    SELECT
        COALESCE(SUM(CASE WHEN moneda = v_moneda_local THEN saldo_actual ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN saldo_actual ELSE 0 END), 0)
    INTO v_billeteras_ars, v_billeteras_usd
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false;

    SELECT
        COALESCE(SUM(CASE WHEN moneda = v_moneda_local THEN saldo_actual ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN saldo_actual ELSE 0 END), 0)
    INTO v_sobres_ars, v_sobres_usd
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = true;

    SELECT
        COALESCE(SUM(CASE WHEN moneda = v_moneda_local THEN
            CASE WHEN tasa_anual_tna > 0 THEN
                monto_invertido_original + (monto_invertido_original * (tasa_anual_tna / 100) * (CURRENT_DATE - fecha_inicio) / 365)
            ELSE COALESCE(valor_mercado_actual, monto_invertido_original) END
        ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN
            CASE WHEN tasa_anual_tna > 0 THEN
                monto_invertido_original + (monto_invertido_original * (tasa_anual_tna / 100) * (CURRENT_DATE - fecha_inicio) / 365)
            ELSE COALESCE(valor_mercado_actual, monto_invertido_original) END
        ELSE 0 END), 0)
    INTO v_inversiones_ars, v_inversiones_usd
    FROM p_inversiones
    WHERE user_id = v_user_id AND estado = 'activa';

    SELECT COALESCE(SUM(monto_total_deuda - monto_pagado_acumulado), 0) INTO v_deudas
    FROM p_prestamos
    WHERE user_id = v_user_id AND tipo_flujo = 'debo' AND estado != 'cancelado';

    v_activo_total_ars := v_billeteras_ars + v_sobres_ars + v_inversiones_ars +
                          ((v_billeteras_usd + v_sobres_usd + v_inversiones_usd) * v_cotizacion_usd);
    v_pasivo_total_ars := v_deudas;
    v_patrimonio_neto_ars := v_activo_total_ars - v_pasivo_total_ars;
    v_patrimonio_neto_usd := CASE WHEN v_cotizacion_usd > 0 THEN v_patrimonio_neto_ars / v_cotizacion_usd ELSE 0 END;

    v_patrimonio_acumulado := v_patrimonio_neto_ars;
    v_patrimonio_record := v_patrimonio_neto_ars;
    v_mes_record := CURRENT_DATE;

    FOR i IN 1..12 LOOP
        v_mes := date_trunc('month', CURRENT_DATE - (i || ' months')::interval);

        SELECT
            COALESCE(SUM(CASE WHEN tipo = 'income' THEN valor_ingreso ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN tipo = 'expense' THEN valor_egreso ELSE 0 END), 0)
        INTO v_ingresos_mes, v_egresos_mes
        FROM p_caja
        WHERE user_id = v_user_id
          AND fecha >= v_mes
          AND fecha < v_mes + INTERVAL '1 month';

        v_patrimonio_acumulado := v_patrimonio_acumulado - v_ingresos_mes + v_egresos_mes;

        SELECT COALESCE(valor_ipc, 0) INTO v_ipc_mes
        FROM p_indices_precios
        WHERE anio = EXTRACT(YEAR FROM v_mes) AND mes = EXTRACT(MONTH FROM v_mes);

        IF v_ipc_mes IS NULL THEN v_ipc_mes := 0; END IF;

        v_evolucion_12m := jsonb_build_array(jsonb_build_object(
            'mes', to_char(v_mes, 'YYYY-MM'),
            'patrimonio_ars', ROUND(v_patrimonio_acumulado, 2),
            'inflacion_mensual', v_ipc_mes
        )) || v_evolucion_12m;

        IF v_patrimonio_acumulado > v_patrimonio_record THEN
            v_patrimonio_record := v_patrimonio_acumulado;
            v_mes_record := v_mes;
        END IF;
    END LOOP;

    v_patrimonio_hace_12m := (v_evolucion_12m->0->>'patrimonio_ars')::numeric;

    IF v_patrimonio_hace_12m > 0 THEN
        v_variacion_nominal := ((v_patrimonio_neto_ars - v_patrimonio_hace_12m) / ABS(v_patrimonio_hace_12m)) * 100;
    ELSE
        v_variacion_nominal := 0;
    END IF;

    SELECT COALESCE((EXP(SUM(LN(1 + (valor_ipc / 100)))) - 1) * 100, 0)
    INTO v_inflacion_12m
    FROM p_indices_precios
    WHERE to_date(anio::text || '-' || mes::text || '-01', 'YYYY-MM-DD') >= CURRENT_DATE - INTERVAL '12 months';

    IF v_inflacion_12m > 0 OR v_variacion_nominal != 0 THEN
        v_variacion_real := ((1 + v_variacion_nominal/100) / (1 + v_inflacion_12m/100) - 1) * 100;
    ELSE
        v_variacion_real := 0;
    END IF;

    RETURN jsonb_build_object(
        'actual', jsonb_build_object(
            'patrimonio_neto_ars', ROUND(v_patrimonio_neto_ars, 2),
            'patrimonio_neto_usd', ROUND(v_patrimonio_neto_usd, 2),
            'cotizacion_usd', v_cotizacion_usd,
            'activo_total_ars', ROUND(v_activo_total_ars, 2),
            'pasivo_total_ars', ROUND(v_pasivo_total_ars, 2)
        ),
        'desglose_activos', jsonb_build_object(
            'billeteras', jsonb_build_object('ars', v_billeteras_ars, 'usd', v_billeteras_usd),
            'inversiones', jsonb_build_object('ars', v_inversiones_ars, 'usd', v_inversiones_usd),
            'sobres', jsonb_build_object('ars', v_sobres_ars, 'usd', v_sobres_usd)
        ),
        'evolucion', jsonb_build_object(
            'variacion_nominal_12m', ROUND(v_variacion_nominal, 2),
            'inflacion_acumulada_12m', ROUND(v_inflacion_12m, 2),
            'variacion_real_12m', ROUND(v_variacion_real, 2),
            'veredicto', CASE
                WHEN v_variacion_real > 5 THEN 'wealth_gained'
                WHEN v_variacion_real >= -2 THEN 'wealth_matched'
                ELSE 'wealth_lost'
            END,
            'mensaje_key', CASE
                WHEN v_variacion_real > 5 THEN 'msg_wealth_gained'
                WHEN v_variacion_real >= -2 THEN 'msg_wealth_matched'
                ELSE 'msg_wealth_lost'
            END,
            'mes_record', to_char(v_mes_record, 'YYYY-MM'),
            'patrimonio_record_ars', ROUND(v_patrimonio_record, 2),
            'historial_12m', v_evolucion_12m
        )
    );
END;
$function$;
