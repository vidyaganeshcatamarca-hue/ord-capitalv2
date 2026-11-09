-- Estado y cuotas del sobre. Los estados posibles son: cumplido, vencido,
-- ahorro libre (sin meta), proyecto (con meta y sin fecha), espera inicial,
-- y los tres semaforos de ritmo. Un ahorro libre no tiene barra; un proyecto
-- sin fecha tiene barra y porcentaje pero no cuota ni semaforo.
-- PRD: DF-13, replanteo DF-29.

CREATE OR REPLACE FUNCTION public.fn_sobre_plan(p_meta numeric, p_saldo numeric, p_saldo_base numeric, p_fecha date, p_inicio date)
 RETURNS TABLE(porcentaje_progreso numeric, monto_faltante numeric, dias_restantes integer, estado_key text, cuota_mensual numeric, cuota_quincenal numeric, cuota_semanal numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_hoy date := CURRENT_DATE;
    v_faltante numeric;
    v_dias integer;
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

    -- Precedencia de DF-13 / Â§6.3.
    IF p_meta IS NOT NULL AND p_saldo >= p_meta THEN
        estado_key := 'state_fulfilled';
    ELSIF p_fecha IS NOT NULL AND p_fecha < v_hoy THEN
        estado_key := 'state_overdue';
    ELSIF p_meta IS NULL THEN
        -- Ahorro libre: reserva sin objetivo ni plazo.
        estado_key := 'state_free_savings';
    ELSIF p_fecha IS NULL THEN
        -- Proyecto sin plazo: se mide por porcentaje, no por ritmo.
        estado_key := 'state_project';
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

    -- Cuota: sÃ³lo con meta y fecha futura y algo por ahorrar (DF-09/DF-10).
    -- El plazo se convierte de dias a periodos SIN redondear: 45 dias son 1,5
    -- meses. Lo que se redondea es la sugerencia, y sin decimales.
    IF p_meta IS NOT NULL AND p_fecha IS NOT NULL AND p_fecha > v_hoy AND v_faltante > 0 THEN
        v_dias := (p_fecha - v_hoy)::int;
        cuota_mensual := ROUND(v_faltante / (v_dias / 30.0), 0);
        cuota_quincenal := ROUND(v_faltante / (v_dias / 15.0), 0);
        cuota_semanal := ROUND(v_faltante / (v_dias / 7.0), 0);
    END IF;

    RETURN NEXT;
END;
$function$;
