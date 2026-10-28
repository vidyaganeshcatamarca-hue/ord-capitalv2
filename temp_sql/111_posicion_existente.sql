-- 111 — Carga inicial de una posición que ya existía (sin billetera)
--
-- Problema: hoy toda inversión nace de una billetera real. Si el usuario ya
-- tenía la posición antes de instalar la app, el alta le exige una billetera con
-- saldo suficiente y además le escribe un egreso en p_caja que nunca ocurrió.
--
-- fn_crear_inversion YA declaraba p_billetera_origen_id DEFAULT NULL y el INSERT
-- en p_caja está dentro de IF p_billetera_origen_id IS NOT NULL. Lo que faltaba:
--   1. poder fijar fecha_inicio (hoy: CURRENT_DATE hardcodeado), sin la cual la
--      inflación prorrateada y el rendimiento real mienten;
--   2. que el valor actual sea explícito (el capital es igual al valor: S3), así
--      que la posición NO devenga por TNA — si devengara, un plazo fijo de 2021
--      con valor 100.000 se convertiría en 220.000 (S6);
--   3. una salida para borrarla: sin movimiento no hay cómo, porque el borrado
--      de inversiones hoy es el borrado del movimiento investment_prefix: (S7).
--
-- Cambios:
--   A) DROP + CREATE de fn_crear_inversion con p_fecha_inicio (7 argumentos).
--      El DROP evita el overload de 6 argumentos: con ambas firmas vivas,
--      PostgREST no puede resolver una llamada que omite el último parámetro
--      ("Could not choose the best candidate function").
--   B) fn_eliminar_inversion: solo borra filas sin movimientos asociados.
--
-- Sin cambios de datos: ninguna fila existente se toca.

-- ----------------------------------------------------------------------------
-- A) fn_crear_inversion
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_crear_inversion(text, numeric, numeric, bigint, text, text);

CREATE OR REPLACE FUNCTION public.fn_crear_inversion(
    p_nombre_activo text,
    p_monto numeric,
    p_tasa_anual_tna numeric DEFAULT 0,
    p_billetera_origen_id bigint DEFAULT NULL::bigint,
    p_moneda text DEFAULT 'ARS'::text,
    p_tipo_activo text DEFAULT 'plazo_fijo'::text,
    p_fecha_inicio date DEFAULT NULL::date
)
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
    -- Modo preexistente: la posición se carga, no se compra (S1).
    v_es_existente boolean := (p_billetera_origen_id IS NULL);
    v_fecha_inicio date;
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

    -- La TNA obligatoria en plazo fijo aplica SOLO al alta desde billetera: ahí
    -- el valor no se conoce y hay que proyectarlo. Una posición preexistente
    -- trae su valor actual explícito y no devenga (S6).
    IF p_tipo_activo = 'plazo_fijo' AND p_tasa_anual_tna <= 0 AND NOT v_es_existente THEN
        RAISE EXCEPTION '{"key": "error_investment_fixed_term_requires_tna", "params": {}}';
    END IF;

    IF p_tipo_activo IN ('cripto','cedear','acciones','otro') AND p_tasa_anual_tna > 0 THEN
        RAISE EXCEPTION '{"key": "error_investment_variable_must_have_zero_tna", "params": {}}';
    END IF;

    -- Fecha de inicio: en el modo preexistente la elige el usuario (S4) y no
    -- puede ser futura. En el modo desde billetera sigue siendo la de hoy.
    IF v_es_existente THEN
        v_fecha_inicio := COALESCE(p_fecha_inicio, CURRENT_DATE);
        IF v_fecha_inicio > CURRENT_DATE THEN
            RAISE EXCEPTION '{"key": "error_investment_start_date_future", "params": {}}';
        END IF;
    ELSE
        v_fecha_inicio := CURRENT_DATE;
    END IF;

    -- La categoria de Inversiones es unica por usuario (idx_estructuras_inversion_unica).
    -- El nombre usa la key unica 'cat_investments_portfolio' para no competir con
    -- una categoria personal del usuario llamada "Investments" en ingles.
    SELECT estructura_id INTO v_categoria_inversion_id
    FROM p_estructuras_egresos
    WHERE user_id = v_user_id AND nombre_cuenta = 'cat_investments_portfolio' AND tipo_cupo = 'investment';

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
            LIMIT 1;
        END IF;
    END IF;

    INSERT INTO p_inversiones (
        user_id, billetera_origen_id, nombre_activo, monto_invertido_original,
        tasa_anual_tna, fecha_inicio, estado, moneda, valor_mercado_actual,
        ultima_conciliacion
    ) VALUES (
        v_user_id, p_billetera_origen_id, p_nombre_activo, p_monto,
        CASE WHEN v_es_existente THEN 0 ELSE p_tasa_anual_tna END,
        v_fecha_inicio, 'activa', p_moneda,
        -- Preexistente: capital = valor actual (S3), siempre explícito, sin
        -- devengue (S6). Desde billetera: se mantiene el comportamiento previo
        -- (plazo fijo proyecta por TNA, el resto arranca en el monto).
        CASE
            WHEN v_es_existente THEN p_monto
            WHEN p_tipo_activo = 'plazo_fijo' THEN NULL
            ELSE p_monto
        END,
        CURRENT_DATE
    )
    RETURNING inversion_id INTO v_inversion_id;

    -- Sin billetera no hay egreso: no se escribe en p_caja, no aparece en
    -- History y no se toca ningún saldo (S1).
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

-- ----------------------------------------------------------------------------
-- B) fn_eliminar_inversion
--    Una posición preexistente no tiene movimiento investment_prefix:, así que
--    el borrado actual (eliminar el movimiento) no existe para ella. Esta
--    función borra la fila SOLO si no hay ningún movimiento que la respalde: si
--    los hay, el camino correcto sigue siendo borrar los movimientos, porque
--    cada uno revierte su operación (migración 105).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_eliminar_inversion(p_inversion_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_inversion RECORD;
    v_movimientos integer;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT inversion_id, monto_liquidado INTO v_inversion
    FROM public.p_inversiones
    WHERE inversion_id = p_inversion_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_investment_not_found", "params": {}}';
    END IF;

    -- Todos los movimientos de inversión guardan el id en metadata: el alta
    -- (investment_prefix), el aporte (investment_contribution), el rescate y la
    -- liquidación (es_rescate / es_ganancia / es_perdida).
    SELECT count(*) INTO v_movimientos
    FROM public.p_caja
    WHERE user_id = v_user_id
      AND (metadata ->> 'inversion_id') = p_inversion_id::text;

    IF v_movimientos > 0 OR COALESCE(v_inversion.monto_liquidado, 0) > 0 THEN
        RAISE EXCEPTION '{"key": "error_investment_has_movements", "params": {}}';
    END IF;

    DELETE FROM public.p_inversiones
    WHERE inversion_id = p_inversion_id AND user_id = v_user_id;

    RETURN true;
END;
$function$;
