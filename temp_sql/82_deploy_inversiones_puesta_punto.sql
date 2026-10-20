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