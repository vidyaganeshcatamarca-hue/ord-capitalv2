-- ============================================================================
-- 96 — El nominal general de la cartera descuenta los retiros parciales
--
--   Dueño, 2026-10-24 (S5): "la tarjeta de la cabecera está mostrando el nominal yield
--   general de todas las inversiones pero creo que está calculado mal está tomando en
--   cuenta los retiros parciales chequea que este campo tenga la fórmula correcta
--   fíjate la diferencia con el real yield".
--
--   Tenía razón. En la 92 el agregado hacía:
--       nominal = (total_actual - total_original) / total_original
--   mientras el nominal POR INVERSIÓN (misma 92, línea ~214) sí sumaba monto_liquidado:
--       ((valor + retirado) - capital) / capital
--   Resultado: Bitcoin con 500.000 de capital, 200.000 retirados y 350.000 de valor daba
--   -30% en la cabecera y +10% en su propio detalle.
--
--   El dinero retirado no se perdió: la inversión lo devolvió. Se suma SOLO para el
--   rendimiento. `total_actual` sigue siendo el valor de cartera que se muestra, así que
--   el monto grande de la cabecera no cambia.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_reporte_rendimiento_vs_inflacion()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_moneda_local text;
    v_total_actual numeric := 0;
    v_total_original numeric := 0;
    v_total_retirado numeric := 0;
    v_conv_actual numeric;
    v_conv_original numeric;
    v_conv_retirado numeric;
    v_rendimiento_nominal numeric := 0;
    v_inflacion_6m numeric := 0;
    v_rendimiento_real numeric := 0;
    v_inflacion_disponible boolean := false;
    v_mensaje_key text;
    v_fila RECORD;
    -- Bloque de inflación calculado en vivo.
    v_infl jsonb := '{}'::jsonb;
    v_motivo text;
    v_fuente text;
    -- Tasa ANUAL disponible (clave 'inflacion_anualizada' del bloque vivo).
    -- Con la fuente manual es el valor tipeado por el usuario, que YA es
    -- anual ("la carga manual es la inflacion anual hasta ese momento de
    -- carga"). Con el proxy dólar es la anualización de la ventana real.
    v_inflacion_anual numeric;
    -- Prorrateo por días, inversión por inversión.
    v_dias_tenencia numeric;
    v_inflacion_periodo numeric;
    v_nominal_inversion numeric;
    v_real_inversion numeric;
    v_peso numeric;
    v_suma_pesos numeric := 0;
    v_suma_real_ponderada numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT COALESCE(cfg.moneda_default, 'ARS') INTO v_moneda_local
    FROM public.p_config_region cfg WHERE cfg.user_id = v_user_id;
    v_moneda_local := COALESCE(v_moneda_local, 'ARS');

    -- Totales en MONEDA LOCAL: la inflación acumulada está expresada en la
    -- moneda local, así que el rendimiento solo es coherente convertido.
    -- Moneda sin cotización: queda fuera de ambos totales (nunca inventar).
    FOR v_fila IN
        SELECT COALESCE(i.moneda, 'ARS') AS moneda,
               COALESCE(SUM(
                   CASE
                       WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                       WHEN i.tasa_anual_tna > 0 THEN
                           i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                       ELSE i.monto_invertido_original
                   END
               ), 0) AS total_actual,
               COALESCE(SUM(i.monto_invertido_original), 0) AS total_original,
               COALESCE(SUM(COALESCE(i.monto_liquidado, 0)), 0) AS total_liquidado
        FROM p_inversiones i
        WHERE i.user_id = v_user_id AND i.estado = 'activa'
        GROUP BY COALESCE(i.moneda, 'ARS')
    LOOP
        v_conv_actual := NULL;
        v_conv_original := NULL;
        v_conv_retirado := NULL;
        SELECT c.valor INTO v_conv_actual FROM fn_valor_a_moneda_local(v_fila.total_actual, v_fila.moneda, v_user_id) c;
        SELECT c.valor INTO v_conv_original FROM fn_valor_a_moneda_local(v_fila.total_original, v_fila.moneda, v_user_id) c;
        SELECT c.valor INTO v_conv_retirado FROM fn_valor_a_moneda_local(v_fila.total_liquidado, v_fila.moneda, v_user_id) c;
        IF v_conv_actual IS NOT NULL THEN v_total_actual := v_total_actual + v_conv_actual; END IF;
        IF v_conv_original IS NOT NULL THEN v_total_original := v_total_original + v_conv_original; END IF;
        IF v_conv_retirado IS NOT NULL THEN v_total_retirado := v_total_retirado + v_conv_retirado; END IF;
    END LOOP;

    IF v_total_original = 0 THEN
        RETURN jsonb_build_object(
            'sin_inversiones', true,
            'moneda_local', v_moneda_local,
            'mensaje_key', 'msg_no_investments'
        );
    END IF;

    -- S5 (ronda 5, dueño): "la tarjeta de la cabecera está mostrando el nominal yield
    -- general de todas las inversiones pero creo que está calculado mal está tomando en
    -- cuenta los retiros parciales". El dinero retirado no se perdió: la inversión lo
    -- devolvió. Este agregado comparaba el valor actual contra el capital original sin
    -- sumar los retiros, y por eso Bitcoin daba -30% acá y +10% en su propio detalle.
    -- `total_actual` NO se toca: es el valor de cartera que se muestra en pantalla.
    v_rendimiento_nominal := ((v_total_actual + v_total_retirado - v_total_original) / v_total_original) * 100;

    -- Inflación VIGENTE (calculada en lectura, no congelada).
    v_infl := public.fn_inflacion_vigente(v_user_id);
    v_motivo := v_infl ->> 'motivo';
    v_fuente := v_infl ->> 'fuente';
    v_inflacion_disponible := (v_motivo = 'ok');
    -- La anualizada es la tasa ANUAL del bloque vivo. Si viniera nula (no hay
    -- ventana real para anualizar), se usa la acumulación de 12 meses, que ya
    -- ES una tasa anual: no se inventa ningún número.
    v_inflacion_anual := COALESCE(
        (v_infl ->> 'inflacion_anualizada')::numeric,
        (v_infl ->> 'inflacion_12m')::numeric
    );

    IF v_inflacion_disponible THEN
        v_inflacion_6m := COALESCE((v_infl ->> 'inflacion_6m')::numeric, 0);

        -- El real de la CARTERA: cada inversión con SUS días, y después un
        -- promedio PONDERADO POR VALOR (no un promedio de días: los días no se
        -- promedian, cada inversión usa los suyos).
        FOR v_fila IN
            SELECT i.fecha_inicio,
                   COALESCE(i.moneda, 'ARS') AS moneda,
                   i.tasa_anual_tna,
                   i.monto_invertido_original,
                   COALESCE(i.monto_liquidado, 0) AS monto_liquidado,
                   i.valor_mercado_actual
            FROM p_inversiones i
            WHERE i.user_id = v_user_id AND i.estado = 'activa'
        LOOP
            IF v_inflacion_anual IS NULL THEN
                -- Sin tasa anual no hay nada que prorratear: esta inversión
                -- NO participa del promedio ponderado (no se inventa un 0).
                CONTINUE;
            END IF;

            IF v_fila.fecha_inicio IS NULL THEN
                -- Sin fecha de inicio no hay período que prorratear: tampoco
                -- participa (no se inventa nada).
                CONTINUE;
            END IF;

            -- Días de tenencia DE ESTA inversión.
            v_dias_tenencia := GREATEST((CURRENT_DATE - v_fila.fecha_inicio), 0)::numeric;

            -- Inflación del PERÍODO que duró la inversión, a partir de la tasa
            -- ANUAL disponible.
            v_inflacion_periodo := (POWER(1 + (v_inflacion_anual / 100), v_dias_tenencia / 365.0) - 1) * 100;

            -- Nominal de ESTA inversión (mismo criterio que el detalle: el
            -- rescate parcial no es pérdida).
            v_nominal_inversion := CASE
                WHEN v_fila.monto_invertido_original > 0 THEN
                    (((CASE
                        WHEN v_fila.valor_mercado_actual IS NOT NULL THEN v_fila.valor_mercado_actual
                        WHEN v_fila.tasa_anual_tna > 0 THEN
                            v_fila.monto_invertido_original + (v_fila.monto_invertido_original * (v_fila.tasa_anual_tna / 100) * (CURRENT_DATE - v_fila.fecha_inicio) / 365)
                        ELSE v_fila.monto_invertido_original
                    END) + v_fila.monto_liquidado - v_fila.monto_invertido_original) / v_fila.monto_invertido_original) * 100
                ELSE 0
            END;

            -- Real de ESTA inversión, con la inflación de SU período.
            v_real_inversion := ((1 + (v_nominal_inversion / 100)) / (1 + (v_inflacion_periodo / 100)) - 1) * 100;

            -- Sin días (fecha de inicio inexistente) no hay período que
            -- prorratear: la inversión queda fuera (no se inventa nada).
            IF v_real_inversion IS NULL THEN
                CONTINUE;
            END IF;

            -- Peso: el capital invertido convertido a moneda local.
            --
            -- Por qué el capital y no el valor actual: el real de cada
            -- inversión es un rendimiento sobre el capital que estuvo
            -- expuesto a esa inflación. Ponderar por el valor actual
            -- sobreponderaría a las inversiones que más subieron y
            -- dejaría de ser coherente con el nominal de cartera, que se
            -- mide contra el capital original.
            --
            -- Con este peso, si todas las inversiones tuvieran la misma
            -- inflación, el promedio ponderado de los reales reproduce
            -- EXACTAMENTE el real de la cartera (Σ O·real / Σ O = (ΣA/ΣO − 1)
            -- / (1 + infl)), o sea: el número que se muestra al lado del
            -- nominal sigue siendo el mismo número, sólo que ahora cada
            -- inversión corrige por SU período.
            --
            -- Sin cotización la inversión queda fuera del promedio (nunca
            -- inventar).
            v_peso := NULL;
            SELECT c.valor INTO v_peso
            FROM fn_valor_a_moneda_local(v_fila.monto_invertido_original, v_fila.moneda, v_user_id) c;
            IF v_peso IS NULL OR v_peso <= 0 THEN
                CONTINUE;
            END IF;

            v_suma_pesos := v_suma_pesos + v_peso;
            v_suma_real_ponderada := v_suma_real_ponderada + (v_peso * v_real_inversion);
        END LOOP;

        IF v_suma_pesos > 0 THEN
            v_rendimiento_real := v_suma_real_ponderada / v_suma_pesos;
        ELSE
            v_rendimiento_real := NULL;
        END IF;
    END IF;

    IF NOT v_inflacion_disponible THEN
        -- Sin dato de mercado NO se pide configurar nada (ya está en proxy
        -- dólar por defecto): se informa que todavía no hay datos.
        IF v_motivo = 'sin_datos' THEN
            v_mensaje_key := 'msg_inflation_no_data';
        ELSE
            v_mensaje_key := 'msg_configure_inflation';
        END IF;
    ELSIF v_rendimiento_real IS NULL THEN
        -- Había inflación pero no hay nada con qué ponderar (ninguna
        -- inversión con tasa anual o sin cotización): no se inventa un real.
        v_mensaje_key := 'msg_inflation_no_data';
    ELSIF v_rendimiento_real > 0 THEN
        v_mensaje_key := 'msg_portfolio_beat_inflation';
    ELSE
        v_mensaje_key := 'msg_portfolio_lost_purchasing_power';
    END IF;

    RETURN jsonb_build_object(
        'sin_inversiones', false,
        'moneda_local', v_moneda_local,
        'total_actual', ROUND(v_total_actual, 2),
        'total_original', ROUND(v_total_original, 2),
        'total_liquidado', ROUND(v_total_retirado, 2),
        'rendimiento_nominal', ROUND(v_rendimiento_nominal, 2),
        'inflacion_disponible', v_inflacion_disponible,
        'inflacion_6m', CASE WHEN v_inflacion_disponible THEN ROUND(v_inflacion_6m, 2) ELSE NULL END,
        'rendimiento_real', CASE WHEN v_inflacion_disponible THEN ROUND(v_rendimiento_real, 2) ELSE NULL END,
        'fuente_inflacion', COALESCE(v_fuente, 'desactivado'),
        'motivo_inflacion', v_motivo,
        'mensaje_key', v_mensaje_key
    );
END;
$function$;
