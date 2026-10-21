-- ============================================================================
-- 82 — Tanda "Inversiones v1 puesta a punto" (odd/tasks/inversiones-v1-puesta-punto.md)
-- Deploy: T1..T5. Requiere autorización explícita del dueño antes de ejecutar
-- contra producción (convención temp_sql). Ejecutar con:
--   node temp_sql/82_deploy_real.mjs
-- Cada sección es una unidad de trabajo independiente (T1..T5, un commit por tarea).
-- Base: definiciones actuales en temp_sql/81_inversiones_rpc_defs.txt.
-- ============================================================================

-- ============================================================================
-- T1 — fn_crear_inversion: semáforo verde al nacer + devengo de PF vivo
--   * INSERT setea ultima_conciliacion = CURRENT_DATE: una inversión recién
--     creada ya no muestra semáforo rojo ("desactualizada, 0 días").
--   * valor_mercado_actual: NULL para plazo_fijo → los reportes devengan por
--     la fórmula TNA×días/365 mientras no haya conciliación manual (antes
--     nacía congelada en p_monto y el devengo nunca aplicaba). Los tipos
--     variables (cripto/cedear/acciones/otro) siguen naciendo en capital.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_crear_inversion(p_nombre_activo text, p_monto numeric, p_tasa_anual_tna numeric DEFAULT 0, p_billetera_origen_id bigint DEFAULT NULL::bigint, p_moneda text DEFAULT 'ARS'::text, p_tipo_activo text DEFAULT 'plazo_fijo'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_inversion_id bigint;
    v_categoria_inversion_id bigint;
    v_caja_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_monto <= 0 THEN
        RAISE EXCEPTION '{"key": "error_investment_amount_zero", "params": {}}';
    END IF;

    IF p_tipo_activo NOT IN ('plazo_fijo', 'cripto', 'cedear', 'acciones', 'otro') THEN
        RAISE EXCEPTION '{"key": "error_investment_type_invalid", "params": {}}';
    END IF;

    IF p_tipo_activo = 'plazo_fijo' AND p_tasa_anual_tna <= 0 THEN
        RAISE EXCEPTION '{"key": "error_investment_fixed_term_requires_tna", "params": {}}';
    END IF;

    IF p_tipo_activo IN ('cripto','cedear','acciones','otro') AND p_tasa_anual_tna > 0 THEN
        RAISE EXCEPTION '{"key": "error_investment_variable_must_have_zero_tna", "params": {}}';
    END IF;

    -- La categoria de Inversiones se busca por tipo_cupo, NO por nombre: el
    -- nombre es una key de i18n que puede cambiar (84 la paso a
    -- 'cat_investments_portfolio') y una busqueda por nombre dejaria los
    -- movimientos sin categoria.
    SELECT estructura_id INTO v_categoria_inversion_id
    FROM p_estructuras_egresos
    WHERE user_id = v_user_id AND tipo_cupo = 'investment'
    ORDER BY estructura_id LIMIT 1;

    IF v_categoria_inversion_id IS NULL THEN
        INSERT INTO p_estructuras_egresos (nombre_cuenta, descripcion, user_id, tipo_cupo, icono, color)
        VALUES ('cat_investments_portfolio', 'desc_blocked_capital', v_user_id, 'investment', '📈', '#059669')
        ON CONFLICT (user_id) WHERE COALESCE(tipo_cupo, '') = 'investment' DO NOTHING
        RETURNING estructura_id INTO v_categoria_inversion_id;

        -- Si otra llamada concurrente gano la carrera, se usa la fila que quedo.
        IF v_categoria_inversion_id IS NULL THEN
            SELECT estructura_id INTO v_categoria_inversion_id
            FROM p_estructuras_egresos
            WHERE user_id = v_user_id AND tipo_cupo = 'investment'
            ORDER BY estructura_id LIMIT 1;
        END IF;
    END IF;

    INSERT INTO p_inversiones (
        user_id, billetera_origen_id, nombre_activo, monto_invertido_original,
        tasa_anual_tna, fecha_inicio, estado, moneda, valor_mercado_actual,
        ultima_conciliacion
    ) VALUES (
        v_user_id, p_billetera_origen_id, p_nombre_activo, p_monto,
        p_tasa_anual_tna, CURRENT_DATE, 'activa', p_moneda,
        CASE WHEN p_tipo_activo = 'plazo_fijo' THEN NULL ELSE p_monto END,
        CURRENT_DATE
    )
    RETURNING inversion_id INTO v_inversion_id;

    IF p_billetera_origen_id IS NOT NULL THEN
        INSERT INTO p_caja (
            user_id, tipo, billetera_origen_id, valor_egreso,
            estructura_egreso_id, fecha, detalle, metadata
        ) VALUES (
            v_user_id, 'expense', p_billetera_origen_id, p_monto,
            v_categoria_inversion_id, CURRENT_DATE,
            'investment_prefix: ' || p_nombre_activo,
            jsonb_build_object('inversion_id', v_inversion_id, 'tipo_activo', p_tipo_activo)
        )
        RETURNING p_caja_id INTO v_caja_id;
    END IF;

    RETURN v_inversion_id;
END;
$function$;
-- ============================================================================
-- T2 — reportes de cartera e historial: contratos que el frontend espera
--   * fn_reporte_cartera_inversiones: filtra estado='activa' (las liquidadas
--     ya viven en el Historial; antes duplicaban la vista) y devuelve
--     monto_liquidado (el rescate parcial calculaba saldo restante con 0).
--   * fn_reporte_historial_inversiones: devuelve moneda (el track record
--     formateaba todo como ARS).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_reporte_cartera_inversiones()
 RETURNS TABLE(inversion_id bigint, nombre_activo text, tipo_activo text, monto_invertido_original numeric, valor_actual_teorico numeric, rendimiento_nominal numeric, rendimiento_real numeric, dias_desde_conciliacion integer, estado_semaforo_key text, estado_inversion text, tasa_anual_tna numeric, moneda text, fecha_inicio date, ultima_conciliacion date, monto_liquidado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

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
                    (((CASE
                        WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                        WHEN i.tasa_anual_tna > 0 THEN
                            i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                        ELSE i.monto_invertido_original
                    END) - i.monto_invertido_original) / i.monto_invertido_original) * 100, 2)
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
        i.monto_liquidado,
        (i.monto_liquidado - i.monto_invertido_original)::numeric,
        CASE
            WHEN i.monto_invertido_original > 0 THEN
                ROUND(((i.monto_liquidado - i.monto_invertido_original) / i.monto_invertido_original) * 100, 2)
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
-- ============================================================================
-- T3 — patrimonio multimoneda + rendimiento/distribución en moneda local (S2/S3)
--   * fn_reporte_patrimonio_inversiones: NUEVO CONTRATO jsonb:
--       {moneda_local, total_moneda_local, totales_por_moneda[], monedas_sin_cotizacion[]}
--     Solo inversiones activas (las liquidadas ya devolvieron el dinero a la
--     billetera). Conversión por fn_valor_a_moneda_local (pivote p_divisas,
--     nunca inventa: moneda sin cotización queda fuera del total local y
--     listada en monedas_sin_cotizacion). Sin ARS/USD hardcodeados.
--     ATENCIÓN: el front VIEJO llama con p_cotizacion_usd y espera
--     total_pesos/total_dolares → deployar SQL y frontend juntos.
--   * fn_reporte_rendimiento_vs_inflacion: agrega convertido a moneda local
--     (antes sumaba monedas mezcladas; el % era ficción con 2+ monedas).
--   * fn_reporte_distribucion_activos: valor_total y porcentaje en moneda
--     local + columna moneda_local para que el front formatee bien.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_reporte_patrimonio_inversiones()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_moneda_local text;
    v_total_local numeric := 0;
    v_convertido numeric;
    v_totales jsonb := '[]'::jsonb;
    v_sin_cotizacion text[] := ARRAY[]::text[];
    r RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- Moneda local del país confirmado; sin configuración regional, ARS (histórico).
    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_moneda_local
    FROM public.p_config_region r WHERE r.user_id = v_user_id;
    v_moneda_local := COALESCE(v_moneda_local, 'ARS');

    FOR r IN
        SELECT COALESCE(i.moneda, 'ARS') AS moneda,
               COALESCE(SUM(
                   CASE
                       WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                       WHEN i.tasa_anual_tna > 0 THEN
                           i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                       ELSE i.monto_invertido_original
                   END
               ), 0) AS total
        FROM p_inversiones i
        WHERE i.user_id = v_user_id AND i.estado = 'activa'
        GROUP BY COALESCE(i.moneda, 'ARS')
        ORDER BY (COALESCE(i.moneda, 'ARS') = v_moneda_local) DESC, COALESCE(i.moneda, 'ARS')
    LOOP
        v_totales := v_totales || jsonb_build_object('moneda', r.moneda, 'total', r.total);
        v_convertido := NULL;
        IF r.total <> 0 THEN
            SELECT c.valor INTO v_convertido FROM fn_valor_a_moneda_local(r.total, r.moneda, v_user_id) c;
            IF v_convertido IS NOT NULL THEN
                v_total_local := v_total_local + v_convertido;
            ELSE
                v_sin_cotizacion := v_sin_cotizacion || r.moneda;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'moneda_local', v_moneda_local,
        'total_moneda_local', ROUND(v_total_local, 2),
        'totales_por_moneda', v_totales,
        'monedas_sin_cotizacion', to_jsonb(v_sin_cotizacion)
    );
END;
$function$;

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
    v_config_inflacion RECORD;
    v_inflacion_disponible boolean := false;
    v_mensaje_key text;
    r RECORD;
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
    FOR r IN
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
        SELECT c.valor INTO v_conv_actual FROM fn_valor_a_moneda_local(r.total_actual, r.moneda, v_user_id) c;
        SELECT c.valor INTO v_conv_original FROM fn_valor_a_moneda_local(r.total_original, r.moneda, v_user_id) c;
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
        v_inflacion_disponible := true;
        v_inflacion_6m := v_config_inflacion.inflacion_acumulada_6m;
        v_rendimiento_real := ((1 + (v_rendimiento_nominal / 100)) / (1 + (v_inflacion_6m / 100)) - 1) * 100;
    END IF;

    IF NOT v_inflacion_disponible THEN
        v_mensaje_key := 'msg_configure_inflation';
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
        'fuente_inflacion', COALESCE(v_config_inflacion.fuente_inflacion, 'desactivado'),
        'mensaje_key', v_mensaje_key
    );
END;
$function$;

-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_distribucion_activos()
 RETURNS TABLE(tipo_activo text, cantidad integer, valor_total numeric, porcentaje_valor numeric, moneda_local text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_moneda_local text;
    v_total_general numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_moneda_local
    FROM public.p_config_region r WHERE r.user_id = v_user_id;
    v_moneda_local := COALESCE(v_moneda_local, 'ARS');

    -- Valor de cada inversión convertido a moneda local (pivote p_divisas);
    -- moneda sin cotización aporta NULL y queda fuera del total (nunca inventar).
    SELECT COALESCE(SUM(
        (SELECT c.valor FROM fn_valor_a_moneda_local(
            CASE
                WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                WHEN i.tasa_anual_tna > 0 THEN
                    i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                ELSE i.monto_invertido_original
            END,
            COALESCE(i.moneda, 'ARS'), v_user_id) c)
    ), 0) INTO v_total_general
    FROM p_inversiones i
    WHERE i.user_id = v_user_id AND i.estado = 'activa';

    RETURN QUERY
    SELECT
        CASE WHEN i.tasa_anual_tna > 0 THEN 'plazo_fijo'::text ELSE 'variable'::text END AS tipo_activo,
        COUNT(*)::int AS cantidad,
        COALESCE(SUM(
            (SELECT c.valor FROM fn_valor_a_moneda_local(
                CASE
                    WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                    WHEN i.tasa_anual_tna > 0 THEN
                        i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                    ELSE i.monto_invertido_original
                END,
                COALESCE(i.moneda, 'ARS'), v_user_id) c)
        ), 0)::numeric AS valor_total,
        CASE
            WHEN v_total_general > 0
            THEN ROUND((SUM(
                (SELECT c.valor FROM fn_valor_a_moneda_local(
                    CASE
                        WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                        WHEN i.tasa_anual_tna > 0 THEN
                            i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                        ELSE i.monto_invertido_original
                    END,
                    COALESCE(i.moneda, 'ARS'), v_user_id) c)
            ) / v_total_general) * 100, 2)
            ELSE 0
        END::numeric AS porcentaje_valor,
        v_moneda_local AS moneda_local
    FROM p_inversiones i
    WHERE i.user_id = v_user_id AND i.estado = 'activa'
    GROUP BY (CASE WHEN i.tasa_anual_tna > 0 THEN 'plazo_fijo'::text ELSE 'variable'::text END), v_moneda_local
    ORDER BY valor_total DESC;
END;
$function$;-- ============================================================================
-- T4 — fn_liquidar_inversion: sin re-acreditar el capital ya rescatado (S6.5)
--   El bug: la liquidación total acreditaba SIEMPRE el capital original
--   completo en p_caja, aunque la inversión ya tuviera rescates parciales
--   (monto_liquidado). El rescate parcial había devuelto ese dinero antes →
--   el saldo de la billetera quedaba inflado (doble conteo de capital).
--   El fix: el movimiento de liquidación acredita SOLO lo que no se había
--   retirado antes (p_monto_total_retirado - monto_liquidado), y la ganancia/
--   pérdida se calcula contra el capital original menos lo ya rescatado.
--   Contrato del modal (front): el usuario ingressa el capital TOTAL que
--   recibe (modal_liquidate_capital_helper) — de ahí que el total siga siendo
--   el mismo parámetro, pero el movimiento contable no se duplique.
-- ============================================================================
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
$function$;-- ============================================================================
-- T5 — fn_obtener_config_inflacion: LECTURA de la config del usuario (S6.8)
--   El tab "Inflación" no precargaba nada: siempre mostraba AR/proxy_dolar
--   aunque el dueño hubiera guardado otra cosa (no existía RPC de lectura).
--   Contrato: {pais, fuente_inflacion, inflacion_6m, inflacion_12m, configurado}
--   Sin config previa → configurado=false y los defaults de la UI.
--   Sin escritura, sin efectos secundarios: es un GET.
-- ============================================================================
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
            'configurado', false
        );
    END IF;

    RETURN jsonb_build_object(
        'pais', v_config.pais,
        'fuente_inflacion', COALESCE(v_config.fuente_inflacion, 'proxy_dolar'),
        'inflacion_6m', v_config.inflacion_acumulada_6m,
        'inflacion_12m', v_config.inflacion_acumulada_12m,
        'configurado', true
    );
END;
$function$;