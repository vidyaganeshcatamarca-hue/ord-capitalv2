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

    SELECT estructura_id INTO v_categoria_inversion_id
    FROM p_estructuras_egresos
    WHERE user_id = v_user_id AND nombre_cuenta = 'cat_investments' AND tipo_cupo = 'investment';

    IF v_categoria_inversion_id IS NULL THEN
        INSERT INTO p_estructuras_egresos (nombre_cuenta, descripcion, user_id, tipo_cupo, icono, color)
        VALUES ('cat_investments', 'desc_blocked_capital', v_user_id, 'investment', '📈', '#059669')
        RETURNING estructura_id INTO v_categoria_inversion_id;
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
