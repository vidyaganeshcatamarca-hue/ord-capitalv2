-- ============================================================================
-- 84 — La categoría de Inversiones: key única, nombre propio y unicidad (S9)
--
--   El dueño: "Puede darse la posibilidad que al momento de crear la cuenta
--   Investment un usuario con idioma inglés ya la tenga creada. Entonces hay
--   que crearla con una key que directamente sea única y prever que si la
--   cuenta existe pueda tomar en ese único caso en la traducción un nombre que
--   no compita con Investment."
--
--   Decisiones tomadas por el dueño:
--     (a) Key nueva: 'cat_investments_portfolio' (la vieja 'cat_investments'
--         podia competir visualmente con una categoria personal del usuario
--         literalmente llamada "Investments" en ingles).
--     (b) Nombre en ingles: "Investment Portfolio" — propio, no compite.
--     (c) Unicidad garantizada en la BASE: indice unico parcial + upsert.
--
--   Este script:
--     1. Renombra las filas existentes (para que no queden con la key vieja).
--     2. Crea el indice unico parcial: una sola categoria de Inversiones por
--        usuario, garantizado por la base (no por el codigo de la app).
--     3. Limpia duplicados previos (hoy no hay, pero el indice no se puede
--        crear si existieran) quedandose con la mas antigua.
--     4. Reescribe fn_crear_inversion con INSERT ... ON CONFLICT DO NOTHING
--        + re-SELECT: dos llamadas concurrentes no pueden crear dos filas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Limpieza previa: si un usuario tuviera mas de una categoria de
--    Inversiones, se conserva la mas antigua (la que tiene movimientos) y se
--    borran las otras, migrando sus movimientos para no perder historial.
--    Hoy no hay duplicados, pero el indice unico no se puede crear si los
--    hubiera, y esta migracion es la que lo hace posible.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    v_conservar_id bigint;
    v_mover_destino bigint;
BEGIN
    FOR r IN
        SELECT user_id
        FROM public.p_estructuras_egresos
        WHERE COALESCE(tipo_cupo, '') = 'investment'
        GROUP BY user_id
        HAVING COUNT(*) > 1
    LOOP
        -- La que se conserva: la mas antigua; si tiene movimientos, esa.
        SELECT estructura_id INTO v_conservar_id
        FROM public.p_estructuras_egresos
        WHERE COALESCE(tipo_cupo, '') = 'investment' AND user_id = r.user_id
        ORDER BY (SELECT COUNT(*) FROM public.p_caja c WHERE c.estructura_egreso_id = p_estructuras_egresos.estructura_id) DESC,
                 estructura_id ASC
        LIMIT 1;

        FOR v_mover_destino IN
            SELECT estructura_id
            FROM public.p_estructuras_egresos
            WHERE COALESCE(tipo_cupo, '') = 'investment'
              AND user_id = r.user_id
              AND estructura_id <> v_conservar_id
        LOOP
            -- Los movimientos de la duplicada pasan a la que se conserva.
            UPDATE public.p_caja
            SET estructura_egreso_id = v_conservar_id
            WHERE estructura_egreso_id = v_mover_destino;

            DELETE FROM public.p_estructuras_egresos
            WHERE estructura_id = v_mover_destino;
        END LOOP;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2) Renombre de la key: las filas existentes pasan a la key unica.
--    (La fila que ya existe para el usuario que probo el modulo queda con la
--    key nueva, asi que su categoria muestra "Cartera de Inversiones" /
--    "Investment Portfolio" y no una key cruda ni un nombre que compita.)
-- ----------------------------------------------------------------------------
UPDATE public.p_estructuras_egresos
SET nombre_cuenta = 'cat_investments_portfolio'
WHERE nombre_cuenta = 'cat_investments'
  AND COALESCE(tipo_cupo, '') = 'investment';

-- ----------------------------------------------------------------------------
-- 3) Unicidad garantizada por la base: una sola categoria de Inversiones por
--    usuario. Es un indice PARCIAL: solo aplica a las filas tipo_cupo
--    'investment', asi que no toca el resto de las categorias.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_estructuras_inversion_unica
    ON public.p_estructuras_egresos (user_id)
    WHERE COALESCE(tipo_cupo, '') = 'investment';

-- ----------------------------------------------------------------------------
-- 4) fn_crear_inversion: usa la fila existente si ya esta, y la crea una sola
--    vez aunque dos llamadas lleguen juntas.
-- ----------------------------------------------------------------------------
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
-- ----------------------------------------------------------------------------
-- 5) fn_rescatar_inversion: la categoria se busca por tipo_cupo, no por nombre.
--    Vive solo en produccion (no esta en 82), asi que su correccion va aqui.
--    Sin esto, tras el renombre el rescate parcial dejaria el movimiento sin
--    categoria (la busqueda por 'cat_investments' devolveria NULL).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rescatar_inversion(p_inversion_id bigint, p_monto numeric, p_billetera_destino_id bigint, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_inversion RECORD;
    v_user_id bigint;
    v_categoria_inversion_id bigint;
    v_monto_restante numeric;
    v_movimiento_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_monto <= 0 THEN
        RAISE EXCEPTION '{"key": "error_investment_amount_zero", "params": {}}';
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

    v_monto_restante := COALESCE(v_inversion.monto_invertido_original, 0) - COALESCE(v_inversion.monto_liquidado, 0);
    IF p_monto > v_monto_restante THEN
        RAISE EXCEPTION '{"key": "error_investment_rescue_exceeds_balance", "params": {}}';
    END IF;

    -- Busqueda por tipo_cupo y no por nombre: el nombre es una key de i18n y
    -- puede cambiar sin que este flujo se rompa (ver 84).
    SELECT estructura_id INTO v_categoria_inversion_id
    FROM p_estructuras_egresos
    WHERE user_id = v_user_id AND tipo_cupo = 'investment'
    ORDER BY estructura_id LIMIT 1;

    INSERT INTO p_caja (
        user_id, tipo, billetera_origen_id, valor_ingreso,
        estructura_egreso_id, fecha, detalle, metadata
    ) VALUES (
        v_user_id, 'income', p_billetera_destino_id, p_monto,
        v_categoria_inversion_id, p_fecha,
        'rescate_inversion: ' || v_inversion.nombre_activo,
        jsonb_build_object('inversion_id', p_inversion_id, 'es_rescate_parcial', true)
    )
    RETURNING p_caja_id INTO v_movimiento_id;

    UPDATE p_inversiones
    SET monto_liquidado = COALESCE(monto_liquidado, 0) + p_monto,
        valor_mercado_actual = GREATEST(0, COALESCE(valor_mercado_actual, monto_invertido_original) - p_monto),
        estado = CASE
            WHEN (COALESCE(monto_liquidado, 0) + p_monto) >= monto_invertido_original THEN 'finalizada'
            ELSE estado
        END,
        fecha_liquidacion = CASE
            WHEN (COALESCE(monto_liquidado, 0) + p_monto) >= monto_invertido_original THEN p_fecha
            ELSE fecha_liquidacion
        END
    WHERE inversion_id = p_inversion_id;

    RETURN v_movimiento_id;
END;
$function$

