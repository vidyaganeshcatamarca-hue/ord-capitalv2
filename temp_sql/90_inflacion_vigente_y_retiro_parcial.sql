-- ============================================================================
-- 90 — Inflación vigente en vivo + retiro parcial no es pérdida (S12/S15/S16/S17)
--
--   Autorizado por el dueño el 2026-10-22 (odd/tasks/inversiones-v2-correcciones.md).
--
--   S12/S17 — La inflación se CONGELABA al guardar la configuración
--   (fn_configurar_inflacion guardaba la variación del mes en curso y la
--   elevaba a la 6ª potencia; si ese mes no tenía dato guardaba 0 y
--   'inflacion_disponible' quedaba false para siempre). Por eso el cartel de
--   "configurá tu fuente" no se iba nunca. Acá la inflación se CALCULA EN CADA
--   LECTURA contra p_cotizaciones_historico y se informa la ventana real usada
--   (el histórico de ARS hoy llega a ~3 meses, no a 6).
--
--   S12 — Sin fila guardada, la fuente por defecto es 'proxy_dolar': el
--   usuario ya está configurado, solo puede faltar el dato.
--
--   S16 — Un retiro parcial no es una pérdida: el nominal ahora se calcula
--   sobre (valor actual + monto_liquidado) contra el capital original.
--
--   S15 — fn_liquidar_inversion no validaba nada: el front filtraba por
--   moneda, el backend no. Ahora se valida en el servidor.
--
--   Todo es CREATE OR REPLACE: los tipos de retorno no cambian, así que no
--   hace falta (ni se debe) eliminar la función. El archivo es idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) fn_inflacion_vigente: helper INTERNO que calcula la inflación vigente.
--
--   Por qué existe: la inflación guardada era un snapshot congelado y
--   rapidamente quedaba obsoleta (o en 0). Este helper la recalcula en el
--   momento de la lectura, devuelve el motivo por el que no hay dato y la
--   ventana real que se pudo cubrir, para que la UI pueda explicarlo en vez de
--   pedir una configuración que ya existe.
--
--   No se expone por PostgREST: se le REVOCA el execute a PUBLIC/anon/
--   authenticated (los otros SECURITY DEFINER la siguen invocando con los
--   privilegios del propietario).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_inflacion_vigente(p_user_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    -- Config guardada (puede no existir la fila).
    v_fuente_cfg text;
    v_pais_cfg text;
    v_manual numeric;
    v_stored_6m numeric;
    v_stored_12m numeric;
    -- Config regional (pais y moneda por defecto).
    v_pais_region text;
    v_moneda_default text;
    -- Resultado.
    v_fuente text := 'proxy_dolar';
    v_pais text;
    v_moneda_local text := 'ARS';
    v_inflacion_6m numeric;
    v_inflacion_12m numeric;
    v_ventana_6m numeric;
    v_ventana_12m numeric;
    -- Tasa anual equivalente, para poder decir "X% anual" en la pestaña.
    v_anualizada numeric;
    v_motivo text := 'ok';
    -- Datos de p_cotizaciones_historico.
    v_hoy numeric;
    v_hoy_fecha date;
    v_base numeric;
    v_base_fecha date;
BEGIN
    -- La fila de configuración es OPCIONAL: sin ella, la fuente por defecto
    -- es el proxy dólar (S12). Se lee con excepciones porque la tabla puede
    -- no existir todavía en una base nueva.
    BEGIN
        SELECT fuente_inflacion,
               pais,
               p_inflacion_manual_anual_pct,
               inflacion_acumulada_6m,
               inflacion_acumulada_12m
          INTO v_fuente_cfg, v_pais_cfg, v_manual, v_stored_6m, v_stored_12m
          FROM public.p_config_inflacion
         WHERE user_id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
        v_fuente_cfg := NULL;
        v_pais_cfg := NULL;
        v_manual := NULL;
        v_stored_6m := NULL;
        v_stored_12m := NULL;
    END;

    BEGIN
        SELECT pais_codigo, moneda_default
          INTO v_pais_region, v_moneda_default
          FROM public.p_config_region
         WHERE user_id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
        v_pais_region := NULL;
        v_moneda_default := NULL;
    END;

    -- Regla 1: sin fila guardada, la fuente es 'proxy_dolar'.
    v_fuente := COALESCE(v_fuente_cfg, 'proxy_dolar');

    -- Regla 2 (S14): el pais es SIEMPRE el de la configuracion regional, que es
    -- el que determina la moneda local. La fila de p_config_inflacion puede
    -- tener un pais viejo escrito por el flujo anterior (el usuario 1 tiene
    -- 'US' guardado y su region es 'AR'), y ese valor NO debe mandar: si mandara,
    -- el modulo calcularia la inflacion en USD mientras el resto de la app
    -- muestra pesos. El pais guardado queda solo como ultimo recurso para
    -- usuarios sin configuracion regional.
    v_pais := COALESCE(NULLIF(v_pais_region, ''), NULLIF(v_pais_cfg, ''));

    v_moneda_local := NULL;
    IF v_pais IS NOT NULL THEN
        -- codigo es char(2): se comparan sin espacios (btrim) y sin
        -- distinguir mayúsculas, para no depender de cómo se guardó el país.
        SELECT btrim(p.moneda_local::text)
          INTO v_moneda_local
          FROM public.p_paises p
         WHERE btrim(UPPER(p.codigo::text)) = btrim(UPPER(v_pais))
           AND p.soportado = true;
    END IF;
    v_moneda_local := COALESCE(v_moneda_local, btrim(v_moneda_default), 'ARS');

    IF v_fuente = 'desactivado' THEN
        -- Regla 3: el usuario lo apagó a propósito; no se le pide nada.
        v_motivo := 'desactivado';

    ELSIF v_fuente = 'manual' THEN
        -- Regla 4: el valor manual es ANUAL; la ventana de 6 meses se
        -- proyecta con la raíz cuadrada de la tasa anual.
        IF v_manual IS NOT NULL AND v_manual > 0 THEN
            v_inflacion_6m := (POWER(1 + (v_manual / 100), 0.5) - 1) * 100;
            v_inflacion_12m := v_manual;
            v_ventana_6m := 6;
            v_ventana_12m := 12;
            v_motivo := 'ok';
        ELSE
            v_motivo := 'manual_sin_valor';
        END IF;

    ELSE
        -- Regla 5: proxy dólar = variación ACUMULADA REAL de la moneda local
        -- contra el histórico de cotizaciones. Sin datos, no hay nada que
        -- configurar: simplemente todavía no hay cotización.
        BEGIN
        SELECT c.valor_por_usd, c.fecha
          INTO v_hoy, v_hoy_fecha
          FROM public.p_cotizaciones_historico c
         WHERE c.moneda_iso = v_moneda_local
           AND c.fecha <= CURRENT_DATE
         ORDER BY c.fecha DESC
         LIMIT 1;

        -- Base de 6 meses.
        SELECT c.valor_por_usd, c.fecha
          INTO v_base, v_base_fecha
          FROM public.p_cotizaciones_historico c
         WHERE c.moneda_iso = v_moneda_local
           AND c.fecha <= CURRENT_DATE - INTERVAL '6 months'
         ORDER BY c.fecha DESC
         LIMIT 1;

        IF v_base IS NULL THEN
            SELECT c.valor_por_usd, c.fecha
              INTO v_base, v_base_fecha
              FROM public.p_cotizaciones_historico c
             WHERE c.moneda_iso = v_moneda_local
             ORDER BY c.fecha ASC
             LIMIT 1;
        END IF;

        IF v_hoy IS NOT NULL AND v_base IS NOT NULL AND v_base <> 0
           AND v_base_fecha IS DISTINCT FROM v_hoy_fecha
        THEN
            v_inflacion_6m := ROUND(((v_hoy - v_base) / v_base) * 100, 2);
            v_ventana_6m := ROUND((CURRENT_DATE - v_base_fecha)::numeric / 30.44, 1);
        END IF;

        -- Base de 12 meses (mismo criterio que la de 6 meses).
        SELECT c.valor_por_usd, c.fecha
          INTO v_base, v_base_fecha
          FROM public.p_cotizaciones_historico c
         WHERE c.moneda_iso = v_moneda_local
           AND c.fecha <= CURRENT_DATE - INTERVAL '12 months'
         ORDER BY c.fecha DESC
         LIMIT 1;

        IF v_base IS NULL THEN
            SELECT c.valor_por_usd, c.fecha
              INTO v_base, v_base_fecha
              FROM public.p_cotizaciones_historico c
             WHERE c.moneda_iso = v_moneda_local
             ORDER BY c.fecha ASC
             LIMIT 1;
        END IF;

        IF v_hoy IS NOT NULL AND v_base IS NOT NULL AND v_base <> 0
           AND v_base_fecha IS DISTINCT FROM v_hoy_fecha
        THEN
            v_inflacion_12m := ROUND(((v_hoy - v_base) / v_base) * 100, 2);
            v_ventana_12m := ROUND((CURRENT_DATE - v_base_fecha)::numeric / 30.44, 1);
        END IF;

        -- Regla 6: no hay dato de cotización utilizable.
        IF v_inflacion_6m IS NULL THEN
            v_motivo := 'sin_datos';
        END IF;

        -- Regla 6b: una ventana de pocos días no es "inflación acumulada": es
        -- un movimiento de cotización suelto. Con menos de un mes de histórico
        -- se prefiere decir que todavía no hay dato (honesto) antes que mostrar
        -- un porcentaje que no significa lo que la etiqueta promete.
        IF v_ventana_6m IS NOT NULL AND v_ventana_6m < 1 THEN
            v_inflacion_6m := NULL;
            v_inflacion_12m := NULL;
            v_ventana_6m := NULL;
            v_ventana_12m := NULL;
            v_motivo := 'sin_datos';
        END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Si el histórico no está disponible, es lo mismo que no tener
            -- dato: se informa 'sin_datos' y nunca se rompe la pantalla.
            v_hoy := NULL;
            v_hoy_fecha := NULL;
            v_base := NULL;
            v_base_fecha := NULL;
            v_inflacion_6m := NULL;
            v_inflacion_12m := NULL;
            v_ventana_6m := NULL;
            v_ventana_12m := NULL;
            v_motivo := 'sin_datos';
        END;
    END IF;

    -- Regla 7 (compatibilidad): si el cálculo en vivo no da valor pero la fila
    -- guardada tiene uno, se usa el guardado. Así el usuario que ya tenía una
    -- inflación válida no ve el dato desaparecer. No aplica cuando la
    -- inflación está desactivada a propósito (motivo 'desactivado').
    IF v_motivo IN ('sin_datos', 'manual_sin_valor') AND COALESCE(v_stored_6m, 0) > 0 THEN
        v_inflacion_6m := v_stored_6m;
        IF v_inflacion_12m IS NULL AND COALESCE(v_stored_12m, 0) > 0 THEN
            v_inflacion_12m := v_stored_12m;
        END IF;
        v_motivo := 'ok';
    END IF;

    -- Tasa ANUAL equivalente. El dueño pidió ver "la inflación calculada" en la
    -- pestaña, expresada por año. Con manual ya viene anual; con proxy dólar se
    -- anualiza la variación acumulada de la ventana real:
    --   (1 + acumulada)^(12 / meses) - 1
    -- Es una proyección, y la UI lo dice: no se presenta como un dato medido.
    IF v_motivo = 'ok' AND v_inflacion_6m IS NOT NULL THEN
        IF v_fuente = 'manual' THEN
            v_anualizada := v_inflacion_12m;
        ELSIF v_ventana_6m IS NOT NULL AND v_ventana_6m > 0 THEN
            v_anualizada := ROUND(
                (POWER(1 + (v_inflacion_6m / 100), 12 / v_ventana_6m) - 1) * 100,
                2
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'fuente', v_fuente,
        'pais', v_pais,
        'moneda_local', v_moneda_local,
        'disponible', (v_motivo = 'ok'),
        'motivo', v_motivo,
        'inflacion_6m', ROUND(v_inflacion_6m, 2),
        'inflacion_12m', ROUND(v_inflacion_12m, 2),
        'inflacion_anualizada', v_anualizada,
        'ventana_6m_meses', v_ventana_6m,
        'ventana_12m_meses', v_ventana_12m
    );
END;
$function$;

-- El helper es interno: no se expone por PostgREST.
REVOKE ALL ON FUNCTION public.fn_inflacion_vigente(bigint) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2) fn_reporte_rendimiento_vs_inflacion: el bloque de inflación sale del
--    helper vivo.
--
--    Por qué: la función leía p_config_inflacion directo, o sea el snapshot
--    congelado; por eso mostraba 0% de rendimiento real o pedía configurar una
--    fuente que ya estaba configurada. Ahora el motivo viaja explícito para
--    que la UI distinga "no hay dato todavía" de "no lo configures".
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

    IF v_inflacion_disponible THEN
        v_inflacion_6m := COALESCE((v_infl ->> 'inflacion_6m')::numeric, 0);
        v_rendimiento_real := ((1 + (v_rendimiento_nominal / 100)) / (1 + (v_inflacion_6m / 100)) - 1) * 100;
    END IF;

    IF NOT v_inflacion_disponible THEN
        -- Sin dato de mercado NO se pide configurar nada (ya está en proxy
        -- dólar por defecto): se informa que todavía no hay datos.
        IF v_motivo = 'sin_datos' THEN
            v_mensaje_key := 'msg_inflation_no_data';
        ELSE
            v_mensaje_key := 'msg_configure_inflation';
        END IF;
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
-- 3) fn_reporte_detalle_inversion: expone lo retirado y recalcula el nominal.
--
--    Por qué: en un rescate parcial el valor actual baja porque el dueño se
--    llevó plata, no porque la inversión valiera menos; el nominal lo
--    comparaba contra el capital original y lo mostraba como pérdida.
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

    IF v_inflacion_disponible AND v_inflacion_6m IS NOT NULL THEN
        v_rendimiento_real := ((1 + (v_rendimiento_nominal / 100)) / (1 + (v_inflacion_6m / 100)) - 1) * 100;
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


-- ----------------------------------------------------------------------------
-- 4a) fn_reporte_cartera_inversiones: el nominal de la lista de la cartera
--     también tiene que ignorar el rescate parcial como pérdida (S16).
--
--     Por qué: acá se ve el -40% que se quejó el dueño: el valor actual ya
--     venía descontado por el retiro y el nominal lo comparaba contra el
--     capital original.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_cartera_inversiones()
 RETURNS TABLE(inversion_id bigint, nombre_activo text, tipo_activo text, monto_invertido_original numeric, valor_actual_teorico numeric, rendimiento_nominal numeric, rendimiento_real numeric, dias_desde_conciliacion integer, estado_semaforo_key text, estado_inversion text, tasa_anual_tna numeric, moneda text, fecha_inicio date, ultima_conciliacion date, monto_liquidado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT
        i.inversion_id,
        i.nombre_activo,
        CASE
            WHEN i.tasa_anual_tna > 0 THEN 'plazo_fijo'::text
            ELSE 'variable'::text
        END AS tipo_activo,
        i.monto_invertido_original,
        CASE
            WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
            WHEN i.tasa_anual_tna > 0 THEN
                i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
            ELSE i.monto_invertido_original
        END::numeric AS valor_actual_teorico,
        CASE
            WHEN i.monto_invertido_original > 0 THEN
                ROUND(
                    ((((CASE
                        WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                        WHEN i.tasa_anual_tna > 0 THEN
                            i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                        ELSE i.monto_invertido_original
                    END) + COALESCE(i.monto_liquidado, 0)) - i.monto_invertido_original) / i.monto_invertido_original) * 100, 2)
            ELSE 0
        END::numeric AS rendimiento_nominal,
        NULL::numeric AS rendimiento_real,
        (CURRENT_DATE - i.ultima_conciliacion)::int AS dias_desde_conciliacion,
        CASE
            WHEN (CURRENT_DATE - i.ultima_conciliacion) <= 30 THEN 'green'::text
            WHEN (CURRENT_DATE - i.ultima_conciliacion) <= 45 THEN 'yellow'::text
            ELSE 'red'::text
        END AS estado_semaforo_key,
        i.estado AS estado_inversion,
        i.tasa_anual_tna,
        COALESCE(i.moneda, 'ARS') AS moneda,
        i.fecha_inicio,
        i.ultima_conciliacion,
        COALESCE(i.monto_liquidado, 0)::numeric AS monto_liquidado
    FROM p_inversiones i
    WHERE i.user_id = v_user_id
      AND i.estado = 'activa'
    ORDER BY
        CASE
            WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
            WHEN i.tasa_anual_tna > 0 THEN
                i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
            ELSE i.monto_invertido_original
        END DESC;
END;
$function$;


-- ----------------------------------------------------------------------------
-- 4b) fn_reporte_historial_inversiones: mismo criterio de nominal, sin
--     cambiar la firma (ni el orden de las columnas).
--
--     Por qué: acá las inversiones ya están finalizadas, así que el valor
--     "actual" es el mismo capital retirado. Por eso NO se vuelve a sumar
--     monto_liquidado al valor de mercado (lo contaría dos veces): el nominal
--     es directamente (monto_liquidado - capital original) / capital original.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_historial_inversiones()
 RETURNS TABLE(inversion_id bigint, nombre_activo text, moneda text, monto_original numeric, monto_liquidado numeric, ganancia_perdida numeric, rendimiento_pct numeric, fecha_inicio date, fecha_liquidacion date, dias_mantenida integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT
        i.inversion_id,
        i.nombre_activo,
        COALESCE(i.moneda, 'ARS')::text AS moneda,
        i.monto_invertido_original AS monto_original,
        COALESCE(i.monto_liquidado, 0)::numeric AS monto_liquidado,
        (COALESCE(i.monto_liquidado, 0) - i.monto_invertido_original)::numeric,
        CASE
            WHEN i.monto_invertido_original > 0 THEN
                ROUND(((COALESCE(i.monto_liquidado, 0) - i.monto_invertido_original) / i.monto_invertido_original) * 100, 2)
            ELSE 0
        END::numeric,
        i.fecha_inicio,
        i.fecha_liquidacion,
        (i.fecha_liquidacion - i.fecha_inicio)::integer
    FROM p_inversiones i
    WHERE i.user_id = v_user_id AND i.estado = 'finalizada'
    ORDER BY i.fecha_liquidacion DESC;
END;
$function$;


-- ----------------------------------------------------------------------------
-- 5) fn_obtener_config_inflacion: lo guardado y lo vigente, lado a lado.
--
--    Por qué: la pantalla de inflación tiene que poder explicar con qué se
--    calculó (ventana real, motivo) y no solo devolver un número congelado.
--    'configurado' sigue significando "hay fila guardada": es un dato de la
--    configuración, no del cálculo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_obtener_config_inflacion()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_tiene_config boolean := false;
    v_pais_cfg text;
    v_fuente_cfg text;
    v_manual_cfg numeric;
    v_stored_6m numeric;
    v_stored_12m numeric;
    v_infl jsonb := '{}'::jsonb;
    v_inflacion_6m numeric;
    v_inflacion_12m numeric;
    v_motivo text;
    v_fuente text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    BEGIN
        SELECT pais,
               fuente_inflacion,
               p_inflacion_manual_anual_pct,
               inflacion_acumulada_6m,
               inflacion_acumulada_12m
          INTO v_pais_cfg, v_fuente_cfg, v_manual_cfg, v_stored_6m, v_stored_12m
          FROM public.p_config_inflacion
         WHERE user_id = v_user_id;
        v_tiene_config := FOUND;
    EXCEPTION WHEN OTHERS THEN
        v_tiene_config := false;
        v_pais_cfg := NULL;
        v_fuente_cfg := NULL;
        v_manual_cfg := NULL;
        v_stored_6m := NULL;
        v_stored_12m := NULL;
    END;

    -- Inflación vigente: lo que se ve hoy, con su motivo y su ventana.
    v_infl := public.fn_inflacion_vigente(v_user_id);
    v_motivo := v_infl ->> 'motivo';
    v_fuente := v_infl ->> 'fuente';
    v_inflacion_6m := (v_infl ->> 'inflacion_6m')::numeric;
    v_inflacion_12m := (v_infl ->> 'inflacion_12m')::numeric;

    -- Si el cálculo en vivo no da valor, se muestra el guardado (regla 7).
    IF v_inflacion_6m IS NULL AND v_tiene_config THEN
        v_inflacion_6m := v_stored_6m;
    END IF;
    IF v_inflacion_12m IS NULL AND v_tiene_config THEN
        v_inflacion_12m := v_stored_12m;
    END IF;

    IF NOT v_tiene_config THEN
        RETURN jsonb_build_object(
            'pais', NULL,
            'fuente_inflacion', COALESCE(v_fuente, 'proxy_dolar'),
            'inflacion_6m', v_inflacion_6m,
            'inflacion_12m', v_inflacion_12m,
            'inflacion_manual_anual_pct', NULL,
            'configurado', false,
            'disponible', (v_motivo = 'ok'),
            'motivo', v_motivo,
            'ventana_6m_meses', (v_infl ->> 'ventana_6m_meses')::numeric,
            'ventana_12m_meses', (v_infl ->> 'ventana_12m_meses')::numeric,
        'inflacion_anualizada', (v_infl ->> 'inflacion_anualizada')::numeric
        );
    END IF;

    RETURN jsonb_build_object(
        'pais', v_pais_cfg,
        'fuente_inflacion', COALESCE(v_fuente_cfg, COALESCE(v_fuente, 'proxy_dolar')),
        'inflacion_6m', v_inflacion_6m,
        'inflacion_12m', v_inflacion_12m,
        'inflacion_manual_anual_pct', v_manual_cfg,
        'configurado', v_tiene_config,
        'disponible', (v_motivo = 'ok'),
        'motivo', v_motivo,
        'ventana_6m_meses', (v_infl ->> 'ventana_6m_meses')::numeric,
        'ventana_12m_meses', (v_infl ->> 'ventana_12m_meses')::numeric,
        'inflacion_anualizada', (v_infl ->> 'inflacion_anualizada')::numeric
    );
END;
$function$;


-- ----------------------------------------------------------------------------
-- 6) fn_liquidar_inversion: la billetera de destino tiene que ser de la
--    misma moneda que la inversión.
--
--    Por qué: el front filtraba las billeteras por moneda, pero el backend
--    aceptaba cualquiera: un retiro a una billetera de otra moneda mezclaba
--    saldos que no se pueden sumar. La garantía tiene que estar en el servidor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_liquidar_inversion(p_inversion_id bigint, p_monto_total_retirado numeric, p_billetera_destino_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_inversion RECORD;
    v_ganancia_perdida numeric;
    v_categoria_inversion_id bigint;
    v_user_id bigint;
    v_ingreso_id bigint;
    v_ya_retirado numeric;
    v_por_acentrar numeric;
    v_moneda_billetera text;
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

    IF v_inversion.estado = 'finalizada' THEN
        RAISE EXCEPTION '{"key": "error_investment_already_liquidated", "params": {}}';
    END IF;

    -- S15: la billetera de destino tiene que ser del usuario y de la misma
    -- moneda que la inversión (comparación sin distinguir mayúsculas).
    SELECT moneda INTO v_moneda_billetera
    FROM public.p_billeteras
    WHERE billetera_id = p_billetera_destino_id AND user_id = v_user_id;

    IF v_moneda_billetera IS NULL THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
    END IF;

    IF btrim(upper(v_moneda_billetera)) <> btrim(upper(COALESCE(v_inversion.moneda, 'ARS'))) THEN
        RAISE EXCEPTION '{"key": "error_wallet_currency_mismatch", "params": {}}';
    END IF;

    -- El total que el usuario recebe no puede ser menor que lo ya retirado.
    v_ya_retirado := COALESCE(v_inversion.monto_liquidado, 0);
    IF p_monto_total_retirado < v_ya_retirado THEN
        RAISE EXCEPTION '{"key": "error_investment_rescue_exceeds_balance", "params": {}}';
    END IF;

    -- Busqueda por tipo_cupo y no por nombre: el nombre es una key de i18n y
    -- puede cambiar sin que este flujo se rompa (ver 84).
    SELECT estructura_id INTO v_categoria_inversion_id
    FROM p_estructuras_egresos
    WHERE user_id = v_user_id AND tipo_cupo = 'investment'
    ORDER BY estructura_id LIMIT 1;

    -- Parte del capital que NO se había retirado antes (el resto ya volvió
    -- a la billetera con los rescates parciales).
    v_por_acentrar := p_monto_total_retirado - v_ya_retirado;

    IF v_por_acentrar > 0 THEN
        INSERT INTO p_caja (
            user_id, tipo, billetera_origen_id, valor_ingreso,
            estructura_egreso_id, fecha, detalle, metadata
        ) VALUES (
            v_user_id, 'income', p_billetera_destino_id, v_por_acentrar,
            v_categoria_inversion_id, CURRENT_DATE,
            'liquidation_capital_recovery: ' || v_inversion.nombre_activo,
            jsonb_build_object('inversion_id', p_inversion_id, 'es_rescate', true)
        )
        RETURNING p_caja_id INTO v_ingreso_id;
    END IF;

    -- Ganancia/pérdida contra el capital pendiente (lo que esta liquidación
    -- realmente cierra), no contra el capital original ya recuperado.
    v_ganancia_perdida := v_por_acentrar - (v_inversion.monto_invertido_original - v_ya_retirado);

    IF v_ganancia_perdida > 0 THEN
        INSERT INTO p_caja (
            user_id, tipo, billetera_origen_id, valor_ingreso,
            estructura_egreso_id, fecha, detalle, metadata
        ) VALUES (
            v_user_id, 'income', p_billetera_destino_id, v_ganancia_perdida,
            v_categoria_inversion_id, CURRENT_DATE,
            'liquidation_gain: ' || v_inversion.nombre_activo,
            jsonb_build_object('inversion_id', p_inversion_id, 'es_ganancia', true)
        );
    ELSIF v_ganancia_perdida < 0 THEN
        INSERT INTO p_caja (
            user_id, tipo, billetera_origen_id, valor_egreso,
            estructura_egreso_id, fecha, detalle, metadata
        ) VALUES (
            v_user_id, 'expense', p_billetera_destino_id, ABS(v_ganancia_perdida),
            v_categoria_inversion_id, CURRENT_DATE,
            'liquidation_loss: ' || v_inversion.nombre_activo,
            jsonb_build_object('inversion_id', p_inversion_id, 'es_perdida', true)
        );
    END IF;

    UPDATE p_inversiones
    SET estado = 'finalizada',
        monto_liquidado = p_monto_total_retirado,
        fecha_liquidacion = CURRENT_DATE,
        valor_mercado_actual = p_monto_total_retirado
    WHERE inversion_id = p_inversion_id;

    RETURN jsonb_build_object(
        'ganancia_perdida', v_ganancia_perdida,
        'monto_total_retirado', p_monto_total_retirado,
        'monto_acreditado', v_por_acentrar,
        'ya_retirado', v_ya_retirado
    );
END;
$function$;
