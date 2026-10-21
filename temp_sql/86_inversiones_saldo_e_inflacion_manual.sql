-- ============================================================================
-- 86 — Inversiones: saldo suficiente, fuente de inflación manual y borrado
--      en cascada de la inversión (B2, B3/B4, B5, B7)
--
--   Autorizado por el dueño el 2026-10-21.
--
--   B2 — No se puede invertir más de lo que hay en la billetera.
--        La garantía real es el BACKEND: el front solo guía al usuario. El
--        trigger de saldo (tr_actualizar_saldo_p_caja_integral) recalcula el
--        saldo de la billetera a partir de p_caja, así que un movimiento de
--        egreso sin saldo deja la billetera en negativo. Hay que impedirlo
--        ANTES de insertar el movimiento.
--
--   B3/B4 — Fuentes de inflación: 'proxy_dolar' (por defecto), 'manual' y
--        'desactivado'. Se elimina 'api_automatica' (nunca estuvo
--        implementada: el selector la tenía deshabilitada con "Próximamente").
--        La fuente manual carga un valor anual que el usuario ingresa.
--
--   B5 — Guardar: si no hay cambios, el botón desaparece (cambia el front).
--
--   B7 — Al borrar el movimiento de creación de una inversión, la inversión
--        se anula también (si no, quedaba viva en la cartera con la plata
--        ya devuelta: doble vida de la plata).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B3/B4 — p_config_inflacion: columna para el valor manual.
--   p_inflacion_manual_anual_pct: el valor anual que el usuario ingresa
--   cuando elige la fuente 'manual'. NULL para las demás fuentes.
-- ----------------------------------------------------------------------------
ALTER TABLE public.p_config_inflacion
    ADD COLUMN IF NOT EXISTS p_inflacion_manual_anual_pct numeric;

COMMENT ON COLUMN public.p_config_inflacion.p_inflacion_manual_anual_pct IS
    'Inflación anual acumulada (%) que el usuario ingresa cuando la fuente es manual. NULL en las demás fuentes.';

-- ----------------------------------------------------------------------------
-- B3/B4 — Las fuentes validas cambian: 3 y solo 3.
--   Antes el CHECK permitia 'api_automatica' (que nunca estuvo implementada)
--   y no permitia 'manual' (que el dueño pidio). Se corrige el CHECK.
-- ----------------------------------------------------------------------------
ALTER TABLE public.p_config_inflacion
    DROP CONSTRAINT IF EXISTS p_config_inflacion_fuente_inflacion_check;

ALTER TABLE public.p_config_inflacion
    ADD CONSTRAINT p_config_inflacion_fuente_inflacion_check
    CHECK (fuente_inflacion IN ('proxy_dolar', 'manual', 'desactivado'));

-- ----------------------------------------------------------------------------
-- B3/B4 — fn_configurar_inflacion: ahora acepta el valor manual.
--   p_inflacion_manual_anual_pct: solo se usa con fuente 'manual'.
--   Fuentes validas: 'proxy_dolar' (por defecto), 'manual', 'desactivado'.
--   'api_automatica' se elimina: nunca estuvo implementada.
--
--   El valor manual es ANUAL ACUMULADO. Para el calculo del rendimiento real
--   se necesita la inflacion acumulada del periodo: se proyecta con la tasa
--   diaria implicita (1 + anual)^(dias/365) a partir de la fecha en que el
--   usuario la ingreso. Ver fn_inflacion_acumulada_periodo mas abajo.
-- ----------------------------------------------------------------------------
-- El overload viejo (2 parametros) es el que aceptaba 'api_automatica' y no
-- soporta la fuente manual: se elimina para que quede UNA sola firma y el
-- front no pueda pegarle a la equivocada.
DROP FUNCTION IF EXISTS public.fn_configurar_inflacion(text, text);

CREATE OR REPLACE FUNCTION public.fn_configurar_inflacion(
    p_pais text,
    p_fuente_inflacion text,
    p_inflacion_manual_anual_pct numeric DEFAULT NULL::numeric
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_inflacion_6m numeric := 0;
    v_inflacion_12m numeric := 0;
    v_variacion_mensual_pct numeric := 0;
    v_moneda_pais text;
    v_manual numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- Fuentes validas: proxy_dolar (por defecto), manual, desactivado.
    -- 'api_automatica' se elimino: nunca estuvo implementada.
    IF p_fuente_inflacion NOT IN ('proxy_dolar', 'manual', 'desactivado') THEN
        RAISE EXCEPTION '{"key": "error_inflation_source_invalid", "params": {}}';
    END IF;

    v_manual := NULL;
    IF p_fuente_inflacion = 'manual' THEN
        IF p_inflacion_manual_anual_pct IS NULL OR p_inflacion_manual_anual_pct <= 0 THEN
            RAISE EXCEPTION '{"key": "error_inflation_manual_value_required", "params": {}}';
        END IF;
        v_manual := p_inflacion_manual_anual_pct;
    END IF;

    IF p_fuente_inflacion = 'proxy_dolar' THEN
        -- Moneda local del pais desde el catalogo. Antes: CASE hardcodeado con ELSE 'ARS',
        -- que mandaba a un usuario de Espana a la cotizacion del peso argentino.
        SELECT p.moneda_local::text INTO v_moneda_pais
        FROM public.p_paises p
        WHERE p.codigo = p_pais AND p.soportado = true;

        IF v_moneda_pais IS NULL THEN
            RAISE EXCEPTION '{"key": "error_country_not_supported", "params": {}}';
        END IF;

        -- Fuente real: historico de cotizaciones.
        v_variacion_mensual_pct := COALESCE(
            public.fn_calcular_inflacion_mensual(
                v_moneda_pais,
                EXTRACT(YEAR  FROM CURRENT_DATE)::int,
                EXTRACT(MONTH FROM CURRENT_DATE)::int),
            0
        );

        IF v_variacion_mensual_pct > 0 THEN
            v_inflacion_6m  := (POWER(1 + (v_variacion_mensual_pct / 100), 6)  - 1) * 100;
            v_inflacion_12m := (POWER(1 + (v_variacion_mensual_pct / 100), 12) - 1) * 100;
        END IF;
    ELSIF p_fuente_inflacion = 'manual' THEN
        -- El usuario carga la inflacion anual acumulada hasta hoy. Se proyecta
        -- a 6m y 12m con la tasa diaria implicita, para que los dos campos
        -- tengan sentido (y no queden en 0).
        IF v_manual > 0 THEN
            v_inflacion_6m  := (POWER(1 + (v_manual / 100),  0.5) - 1) * 100;
            v_inflacion_12m := v_manual;
        END IF;
    END IF;

    INSERT INTO p_config_inflacion (
        user_id, pais, fuente_inflacion, inflacion_acumulada_6m, inflacion_acumulada_12m,
        p_inflacion_manual_anual_pct
    )
    VALUES (v_user_id, p_pais, p_fuente_inflacion, v_inflacion_6m, v_inflacion_12m, v_manual)
    ON CONFLICT (user_id) DO UPDATE SET
        pais = EXCLUDED.pais,
        fuente_inflacion = EXCLUDED.fuente_inflacion,
        inflacion_acumulada_6m = EXCLUDED.inflacion_acumulada_6m,
        inflacion_acumulada_12m = EXCLUDED.inflacion_acumulada_12m,
        p_inflacion_manual_anual_pct = EXCLUDED.p_inflacion_manual_anual_pct,
        actualizado_at = now();

    RETURN jsonb_build_object(
        'success_key', 'success_inflation_configured',
        'params', '{}'::jsonb,
        'fuente_inflacion', p_fuente_inflacion,
        'inflacion_6m', ROUND(v_inflacion_6m, 4),
        'inflacion_12m', ROUND(v_inflacion_12m, 4)
    );
END;
$function$;

-- ----------------------------------------------------------------------------
-- B3/B4 — fn_obtener_config_inflacion: devuelve tambien el valor manual.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_obtener_config_inflacion()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_config RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT * INTO v_config FROM public.p_config_inflacion WHERE user_id = v_user_id;

    IF v_config IS NULL THEN
        RETURN jsonb_build_object(
            'pais', NULL,
            'fuente_inflacion', 'proxy_dolar',
            'inflacion_6m', NULL,
            'inflacion_12m', NULL,
            'inflacion_manual_anual_pct', NULL,
            'configurado', false
        );
    END IF;

    RETURN jsonb_build_object(
        'pais', v_config.pais,
        'fuente_inflacion', COALESCE(v_config.fuente_inflacion, 'proxy_dolar'),
        'inflacion_6m', v_config.inflacion_acumulada_6m,
        'inflacion_12m', v_config.inflacion_acumulada_12m,
        'inflacion_manual_anual_pct', v_config.p_inflacion_manual_anual_pct,
        'configurado', true
    );
END;
$function$;
-- ----------------------------------------------------------------------------
-- B3b — fn_reporte_detalle_inversion: expone si la inflacion esta disponible y
--        cual es la fuente. El front asi puede mostrar "configura la inflacion"
--        solo cuando el usuario NO la ha desactivado a proposito.
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
    v_config_inflacion RECORD;
    v_valor_actual_teorico numeric;
    -- B3b (2026-10-21): el front necesita distinguir "el usuario desactivo la
    -- inflacion" de "todavia no la configuro": son mensajes distintos.
    v_inflacion_disponible boolean := false;
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

    v_valor_actual_teorico := CASE
        WHEN v_inversion.valor_mercado_actual IS NOT NULL THEN v_inversion.valor_mercado_actual
        WHEN v_inversion.tasa_anual_tna > 0 THEN
            v_inversion.monto_invertido_original + (v_inversion.monto_invertido_original * (v_inversion.tasa_anual_tna / 100) * (CURRENT_DATE - v_inversion.fecha_inicio) / 365)
        ELSE v_inversion.monto_invertido_original
    END;

    v_rendimiento_nominal := CASE
        WHEN v_inversion.monto_invertido_original > 0
        THEN ((v_valor_actual_teorico - v_inversion.monto_invertido_original) / v_inversion.monto_invertido_original) * 100
        ELSE 0
    END;

    BEGIN
        SELECT * INTO v_config_inflacion FROM p_config_inflacion WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
        v_config_inflacion := NULL;
    END;

    IF v_config_inflacion IS NOT NULL
       AND v_config_inflacion.fuente_inflacion IS NOT NULL
       AND v_config_inflacion.fuente_inflacion != 'desactivado'
       AND COALESCE(v_config_inflacion.inflacion_acumulada_6m, 0) > 0
    THEN
        v_rendimiento_real := ((1 + (v_rendimiento_nominal / 100)) / (1 + (v_config_inflacion.inflacion_acumulada_6m / 100)) - 1) * 100;
        v_inflacion_disponible := true;
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
        'fuente_inflacion', COALESCE(v_config_inflacion.fuente_inflacion, 'desactivado'),
        'historial', v_historial
    );
END;
$function$

