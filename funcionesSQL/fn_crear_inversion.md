CREATE OR REPLACE FUNCTION public.fn_crear_inversion(p_nombre_activo text, p_monto numeric, p_tasa_anual_tna numeric DEFAULT 0, p_billetera_origen_id bigint DEFAULT NULL::bigint, p_moneda text DEFAULT 'ARS'::text, p_tipo_activo text DEFAULT 'plazo_fijo'::text, p_fecha_inicio date DEFAULT NULL::date)
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
        -- Un día de tolerancia: el max del input y el "hoy" del cliente son
        -- locales, y un usuario adelantado respecto de UTC manda como hoy el
        -- día que el servidor todavía ve como mañana. Sin esto, toda alta
        -- hecha de noche desde Europa o Asia se rechaza sin que el usuario
        -- pueda hacer nada.
        IF v_fecha_inicio > CURRENT_DATE + 1 THEN
            RAISE EXCEPTION '{"key": "error_investment_start_date_future", "params": {}}';
        END IF;
        -- Ya aceptada, se acota al día del servidor: si quedara en el futuro,
        -- los días de tenencia serían negativos y la inflación prorrateada
        -- (92, 96) restaría en vez de sumar.
        v_fecha_inicio := LEAST(v_fecha_inicio, CURRENT_DATE);
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

    -- Validar tipo_activo
    IF p_tipo_activo NOT IN ('plazo_fijo', 'cripto', 'cedear', 'acciones', 'otro') THEN
        RAISE EXCEPTION '{"key": "error_investment_type_invalid", "params": {}}';
    END IF;

    -- Plazo fijo debe tener TNA > 0; variables deben tener TNA = 0
    IF p_tipo_activo = 'plazo_fijo' AND p_tasa_anual_tna <= 0 THEN
        RAISE EXCEPTION '{"key": "error_investment_fixed_term_requires_tna", "params": {}}';
    END IF;
    IF p_tipo_activo IN ('cripto','cedear','acciones','otro') AND p_tasa_anual_tna > 0 THEN
        RAISE EXCEPTION '{"key": "error_investment_variable_must_have_zero_tna", "params": {}}';
    END IF;

    -- Crear o buscar categoría de inversiones
    SELECT estructura_id INTO v_categoria_inversion_id
    FROM p_estructuras_egresos
    WHERE user_id = v_user_id AND nombre_cuenta = 'cat_investments' AND tipo_cupo = 'investment';

    IF v_categoria_inversion_id IS NULL THEN
        INSERT INTO p_estructuras_egresos (nombre_cuenta, descripcion, user_id, tipo_cupo, icono, color)
        VALUES ('cat_investments', 'desc_blocked_capital', v_user_id, 'investment', '📈', '#059669')
        RETURNING estructura_id INTO v_categoria_inversion_id;
    END IF;

    -- Crear inversión (esquema real: nombre_activo, monto_invertido_original, estado='activa')
    INSERT INTO p_inversiones (
        user_id, billetera_origen_id, nombre_activo, monto_invertido_original,
        tasa_anual_tna, fecha_inicio, estado, moneda, valor_mercado_actual
    ) VALUES (
        v_user_id, p_billetera_origen_id, p_nombre_activo, p_monto,
        p_tasa_anual_tna, CURRENT_DATE, 'activa', p_moneda, p_monto
    )
    RETURNING inversion_id INTO v_inversion_id;

    -- Egreso virtual en p_caja (metadata guarda referencia para auditoría)
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
$function$
