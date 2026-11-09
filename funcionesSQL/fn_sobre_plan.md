-- Helper interno y puro: sin tablas, sin auth. Calcula progreso, faltante, días,
-- estado del semáforo y cuotas a partir de meta, saldo, saldo base, fecha e inicio.
-- PRD: DF-09/DF-10 (cuota dinámica mensual con equivalencias), DF-11 (plazo vencido),
-- DF-12/DF-13 (ritmo real vs. ideal, umbrales 85/60), DF-14 (replanificación),
-- DF-15 (período inicial: un mes calendario, o una semana si el plazo es menor).
-- No expuesto al cliente (EXECUTE revocado a anon/authenticated).

CREATE OR REPLACE FUNCTION public.fn_sobre_plan(p_meta numeric, p_saldo numeric, p_saldo_base numeric, p_fecha date, p_inicio date)
 RETURNS TABLE(porcentaje_progreso numeric, monto_faltante numeric, dias_restantes integer, estado_key text, cuota_mensual numeric, cuota_quincenal numeric, cuota_semanal numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_hoy date := CURRENT_DATE;
    v_faltante numeric;
    v_meses integer;
    v_cuota numeric;
    v_esperado numeric;
    v_avance numeric;
    v_espera date;
    v_total_dias integer;
    v_dias_transc integer;
BEGIN
    IF p_fecha IS NOT NULL THEN
        dias_restantes := (p_fecha - v_hoy)::int;
    END IF;

    IF p_meta IS NOT NULL THEN
        v_faltante := GREATEST(p_meta - p_saldo, 0);
        monto_faltante := v_faltante;
        porcentaje_progreso := ROUND((p_saldo / p_meta) * 100, 2);
    END IF;

    -- Precedencia de DF-13 / §6.3.
    IF p_meta IS NOT NULL AND p_saldo >= p_meta THEN
        estado_key := 'state_fulfilled';
    ELSIF p_fecha IS NOT NULL AND p_fecha < v_hoy THEN
        estado_key := 'state_overdue';
    ELSIF p_meta IS NULL OR p_fecha IS NULL THEN
        estado_key := 'state_no_plan';
    ELSE
        v_espera := (p_inicio + CASE
            WHEN p_fecha < (p_inicio + INTERVAL '1 month') THEN INTERVAL '7 days'
            ELSE INTERVAL '1 month'
        END)::date;

        IF v_hoy < v_espera THEN
            estado_key := 'state_plan_started';
        ELSE
            v_total_dias := (p_fecha - p_inicio)::int;
            v_dias_transc := (v_hoy - p_inicio)::int;
            v_esperado := p_saldo_base
                + (p_meta - p_saldo_base) * (v_dias_transc::numeric / NULLIF(v_total_dias, 0));

            IF v_esperado <= 0 THEN
                estado_key := 'state_green';
            ELSE
                v_avance := p_saldo / v_esperado;
                estado_key := CASE
                    WHEN v_avance >= 0.85 THEN 'state_green'
                    WHEN v_avance >= 0.60 THEN 'state_yellow'
                    ELSE 'state_red'
                END;
            END IF;
        END IF;
    END IF;

    -- Cuota: sólo con meta y fecha futura y algo por ahorrar (DF-09/DF-10).
    IF p_meta IS NOT NULL AND p_fecha IS NOT NULL AND p_fecha >= v_hoy AND v_faltante > 0 THEN
        v_meses := GREATEST(1,
            (EXTRACT(YEAR FROM p_fecha)::int - EXTRACT(YEAR FROM v_hoy)::int) * 12
            + (EXTRACT(MONTH FROM p_fecha)::int - EXTRACT(MONTH FROM v_hoy)::int)
            + CASE WHEN EXTRACT(DAY FROM p_fecha) > EXTRACT(DAY FROM v_hoy) THEN 1 ELSE 0 END
        );
        v_cuota := ROUND(CEIL((v_faltante / v_meses) * 100) / 100, 2);
        cuota_mensual := v_cuota;
        cuota_quincenal := ROUND(v_cuota / 2, 2);
        cuota_semanal := ROUND(v_cuota / 4.345, 2);
    END IF;

    RETURN NEXT;
END;
$function$;
