-- 92_inflacion_prorrateada_por_dias.sql
--
-- Migración: el RENDIMIENTO REAL se prorratea por los días de cada inversión.
--
-- Decisión del dueño (2026-10-24, verbatim):
--   "esta bien que lo trate como el año completo, ya que la carga manual, es la
--    inflacion anual hasta ese momento de carga."
--   "cada inversion con sus propios dias, claro"
--
-- Qué significa, en una línea: el valor manual
-- `p_inflacion_manual_anual_pct` YA ES UNA TASA ANUAL, así que NO se
-- anualiza nada acá y NO se toca `fn_configurar_inflacion`. Lo que cambia es
-- que la tasa anual (la que ya expone el bloque de inflación en la clave
-- 'inflacion_anualizada') se aplica SOLO por el tiempo que cada inversión
-- estuvo puesta: "cada inversión con sus propios días".
--
-- ----------------------------------------------------------------------------
-- ANTES (lo que está deployado en 90_inflacion_vigente_y_retiro_parcial.sql):
--
--   v_rendimiento_real := ((1 + (v_rendimiento_nominal / 100))
--                          / (1 + (v_inflacion_6m / 100)) - 1) * 100;
--
--   El real de TODAS las inversiones se comparaba contra UNA inflación de 6
--   meses fija, sin importar cuánto duró cada una. Una inversión de 45 días
--   pagaba 6 meses de inflación y una de 3 años también.
--
-- DESPUÉS (este archivo):
--
--   v_dias_tenencia     := GREATEST((CURRENT_DATE - v_inversion.fecha_inicio), 0)::numeric;
--   v_inflacion_periodo := (POWER(1 + (v_inflacion_anual / 100), v_dias_tenencia / 365.0) - 1) * 100;
--   v_rendimiento_real  := ((1 + (v_rendimiento_nominal / 100)) / (1 + (v_inflacion_periodo / 100)) - 1) * 100;
--
--   Ejemplo (inversión de 45 días, inflación anual 6%):
--     - ANTES: se le descontaba la inflación acumulada de 6 meses (3%), sin
--       importar que la inversión tuviera 45 días.
--     - DESPUÉS: la inflación del PERÍODO es la parte de esa tasa anual que
--       corresponde a los 45 días. El ejemplo que trae el dueño es 0,74%
--       (6% * 45/365, prorrateo simple). La fórmula COMPUESTA que se
--       despliega (POWER) da 0,72%:
--         (1 + 0,06)^(45/365) - 1 = 0,72%
--       La diferencia entre 0,74% y 0,72% es la capitalización dentro del
--       período; se anota acá para que el registro no difiera del SQL que se
--       despliega, que es el compuesto.
--     - El real de esa inversión pasa de estar descontando 3% a estar
--       descontando ~0,72%: la diferencia entre 6 meses fijos y 45 días reales.
--
-- ----------------------------------------------------------------------------
-- QUÉ REEMPLAZA ESTE ARCHIVO
--
-- Sólo las DOS funciones que calculaban el rendimiento real:
--
--   1) public.fn_reporte_detalle_inversion(p_inversion_id bigint)
--      → el real de UNA inversión, con LOS DÍAS de esa inversión.
--
--   2) public.fn_reporte_rendimiento_vs_inflacion()
--      → el real de la CARTERA. NO se promedian días: se calcula el real de
--        CADA inversión con sus propios días y después se pondera por el
--        capital convertido a moneda local (la misma conversión que ya usa la
--        función: `fn_valor_a_moneda_local`). Una inversión sin inflación
--        disponible NO participa del promedio ponderado (nunca se inventa 0).
--
-- El resto del cuerpo de cada función se copia tal cual estaba en el 90: este
-- archivo es un registro de despliegue, no una refactorización.
--
-- NO se ejecuta nada desde acá: este archivo no se aplicó contra ninguna base.

-- ----------------------------------------------------------------------------
-- 1) fn_reporte_rendimiento_vs_inflacion: el bloque de inflación sale del
--    helper vivo, y el real de la cartera se prorratea por días.
-- ----------------------------------------------------------------------------
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
    v_conv_actual numeric;
    v_conv_original numeric;
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
               COALESCE(SUM(i.monto_invertido_original), 0) AS total_original
        FROM p_inversiones i
        WHERE i.user_id = v_user_id AND i.estado = 'activa'
        GROUP BY COALESCE(i.moneda, 'ARS')
    LOOP
        v_conv_actual := NULL;
        v_conv_original := NULL;
        SELECT c.valor INTO v_conv_actual FROM fn_valor_a_moneda_local(v_fila.total_actual, v_fila.moneda, v_user_id) c;
        SELECT c.valor INTO v_conv_original FROM fn_valor_a_moneda_local(v_fila.total_original, v_fila.moneda, v_user_id) c;
        IF v_conv_actual IS NOT NULL THEN v_total_actual := v_total_actual + v_conv_actual; END IF;
        IF v_conv_original IS NOT NULL THEN v_total_original := v_total_original + v_conv_original; END IF;
    END LOOP;

    IF v_total_original = 0 THEN
        RETURN jsonb_build_object(
            'sin_inversiones', true,
            'moneda_local', v_moneda_local,
            'mensaje_key', 'msg_no_investments'
        );
    END IF;

    v_rendimiento_nominal := ((v_total_actual - v_total_original) / v_total_original) * 100;

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


-- ----------------------------------------------------------------------------
-- 2) fn_reporte_detalle_inversion: el real de UNA inversión, con los días de
--    ESA inversión.
--
--    Por qué: el detalle es el lugar donde el dueño mira una inversión
--    puntual. Cobrarle 6 meses de inflación a una inversión de 45 días (o
--    45 días a una de 3 años) era el bug: cada inversión tiene sus días.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_detalle_inversion(p_inversion_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_inversion RECORD;
    v_historial jsonb;
    v_rendimiento_nominal numeric;
    v_rendimiento_real numeric;
    v_valor_actual_teorico numeric;
    v_liquidado numeric := 0;
    -- Bloque de inflación calculado en vivo.
    v_infl jsonb := '{}'::jsonb;
    v_motivo text;
    v_fuente text;
    v_inflacion_disponible boolean := false;
    v_inflacion_6m numeric;
    -- Tasa ANUAL disponible (clave 'inflacion_anualizada' del bloque vivo).
    v_inflacion_anual numeric;
    -- Prorrateo por días de ESTA inversión.
    v_dias_tenencia numeric;
    v_inflacion_periodo numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT * INTO v_inversion
    FROM p_inversiones
    WHERE inversion_id = p_inversion_id AND user_id = v_user_id;

    IF v_inversion.inversion_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_investment_not_found", "params": {}}';
    END IF;

    v_liquidado := COALESCE(v_inversion.monto_liquidado, 0);

    v_valor_actual_teorico := CASE
        WHEN v_inversion.valor_mercado_actual IS NOT NULL THEN v_inversion.valor_mercado_actual
        WHEN v_inversion.tasa_anual_tna > 0 THEN
            v_inversion.monto_invertido_original + (v_inversion.monto_invertido_original * (v_inversion.tasa_anual_tna / 100) * (CURRENT_DATE - v_inversion.fecha_inicio) / 365)
        ELSE v_inversion.monto_invertido_original
    END;

    -- S16: el nominal se mide contra el capital ORIGINAL más lo ya retirado:
    -- lo que salió de la billetera fue un rescate, no una pérdida.
    v_rendimiento_nominal := CASE
        WHEN v_inversion.monto_invertido_original > 0
        THEN (((v_valor_actual_teorico + v_liquidado) - v_inversion.monto_invertido_original) / v_inversion.monto_invertido_original) * 100
        ELSE 0
    END;

    -- Inflación VIGENTE (calculada en lectura, no congelada).
    v_infl := public.fn_inflacion_vigente(v_user_id);
    v_motivo := v_infl ->> 'motivo';
    v_fuente := v_infl ->> 'fuente';
    v_inflacion_disponible := (v_motivo = 'ok');
    v_inflacion_6m := (v_infl ->> 'inflacion_6m')::numeric;
    -- La anualizada es la tasa ANUAL del bloque vivo. Si viniera nula (no hay
    -- ventana real para anualizar), se usa la acumulación de 12 meses, que ya
    -- ES una tasa anual: no se inventa ningún número.
    v_inflacion_anual := COALESCE(
        (v_infl ->> 'inflacion_anualizada')::numeric,
        (v_infl ->> 'inflacion_12m')::numeric
    );

    IF v_inflacion_disponible AND v_inflacion_anual IS NOT NULL
       AND v_inversion.fecha_inicio IS NOT NULL THEN
        -- Días de tenencia DE ESTA inversión.
        v_dias_tenencia := GREATEST((CURRENT_DATE - v_inversion.fecha_inicio), 0)::numeric;
        -- Inflación del PERÍODO que duró la inversión, a partir de la tasa
        -- ANUAL disponible (no se anualiza nada: la manual ya es anual).
        v_inflacion_periodo := (POWER(1 + (v_inflacion_anual / 100), v_dias_tenencia / 365.0) - 1) * 100;

        -- Real de ESTA inversión.
        v_rendimiento_real := ((1 + (v_rendimiento_nominal / 100)) / (1 + (v_inflacion_periodo / 100)) - 1) * 100;
    ELSE
        v_rendimiento_real := NULL;
        v_inflacion_disponible := false;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(mov)), '[]'::jsonb) INTO v_historial
    FROM (
        SELECT c.fecha,
               c.detalle,
               CASE
                   WHEN c.tipo = 'expense' THEN -c.valor_egreso
                   WHEN c.tipo = 'income' THEN c.valor_ingreso
                   ELSE 0
               END AS monto
        FROM p_caja c
        WHERE c.user_id = v_user_id
          AND c.metadata->>'inversion_id' = p_inversion_id::text
        ORDER BY c.fecha DESC
    ) mov;

    RETURN jsonb_build_object(
        'inversion_id', v_inversion.inversion_id,
        'nombre_activo', v_inversion.nombre_activo,
        'tipo_activo', CASE WHEN v_inversion.tasa_anual_tna > 0 THEN 'plazo_fijo' ELSE 'variable' END,
        'monto_invertido_original', v_inversion.monto_invertido_original,
        'monto_liquidado', v_liquidado,
        'valor_actual_teorico', ROUND(v_valor_actual_teorico, 2),
        'valor_mercado_actual', v_inversion.valor_mercado_actual,
        'tasa_anual_tna', v_inversion.tasa_anual_tna,
        'moneda', COALESCE(v_inversion.moneda, 'ARS'),
        'ultima_conciliacion', v_inversion.ultima_conciliacion,
        'dias_desde_conciliacion', (CURRENT_DATE - v_inversion.ultima_conciliacion)::int,
        'estado_semaforo_key', CASE
            WHEN (CURRENT_DATE - v_inversion.ultima_conciliacion) <= 30 THEN 'green'
            WHEN (CURRENT_DATE - v_inversion.ultima_conciliacion) <= 45 THEN 'yellow'
            ELSE 'red'
        END,
        'estado_inversion', v_inversion.estado,
        'rendimiento_nominal', ROUND(v_rendimiento_nominal, 2),
        'rendimiento_real', CASE WHEN v_rendimiento_real IS NOT NULL THEN ROUND(v_rendimiento_real, 2) ELSE NULL END,
        'inflacion_disponible', v_inflacion_disponible,
        'inflacion_6m', CASE WHEN v_inflacion_disponible THEN ROUND(v_inflacion_6m, 2) ELSE NULL END,
        'fuente_inflacion', COALESCE(v_fuente, 'desactivado'),
        'motivo_inflacion', v_motivo,
        'ventana_6m_meses', (v_infl ->> 'ventana_6m_meses')::numeric,
        'historial', v_historial
    );
END;
$function$;
