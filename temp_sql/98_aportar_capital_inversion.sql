-- ============================================================================
-- 98 — Agregar capital a una inversión existente
--
--   Dueño, 2026-10-24 (S6): "Cada inversión me permite retirar dinero completo,
--   liquidándola o hacer retiros parciales. Pero en ningún lugar tengo la opción de
--   agregar dinero a una inversión. Y es una posibilidad correcta poder hacerlo, ya
--   que, por ejemplo, puedo comprar más bitcoins del mismo tipo. Y eso no debería
--   registrarse como una nueva inversión, sino que la podría poder agregar a una
--   inversión ya hecha."
--
--   Es el espejo de fn_liquidar_inversion: misma validación de usuario, inversión y
--   billetera de la misma moneda, y el movimiento de caja con la categoría de
--   inversiones (tipo_cupo = 'investment', buscada por tipo y no por nombre para que
--   renombrar la key de i18n no rompa el flujo — ver 84).
--
--   Qué NO hace, a propósito:
--     * No toca `fecha_inicio`: no es una inversión nueva, así que la antigüedad del
--       aporte original se mantiene. (El prorrateo de inflación por días queda medido
--       desde el inicio original; anotado como límite conocido.)
--     * No toca `valor_mercado_actual`: cuánto vale hoy la posición lo sabe el dueño y
--       lo carga con "Update value" después de comprar. Inventarlo acá sería peor.
--     * No toca `monto_liquidado`: los retiros anteriores siguen siendo retiros.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_aportar_inversion(
    p_inversion_id bigint,
    p_monto numeric,
    p_billetera_origen_id bigint
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_inversion RECORD;
    v_user_id bigint;
    v_categoria_inversion_id bigint;
    v_moneda_billetera text;
    v_capital_nuevo numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_monto IS NULL OR p_monto <= 0 THEN
        RAISE EXCEPTION '{"key": "error_amount_required", "params": {}}';
    END IF;

    SELECT * INTO v_inversion
    FROM public.p_inversiones
    WHERE inversion_id = p_inversion_id AND user_id = v_user_id;

    IF v_inversion.inversion_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_investment_not_found", "params": {}}';
    END IF;

    IF v_inversion.estado = 'finalizada' THEN
        RAISE EXCEPTION '{"key": "error_investment_already_liquidated", "params": {}}';
    END IF;

    SELECT moneda INTO v_moneda_billetera
    FROM public.p_billeteras
    WHERE billetera_id = p_billetera_origen_id AND user_id = v_user_id;

    IF v_moneda_billetera IS NULL THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
    END IF;

    IF btrim(upper(v_moneda_billetera)) <> btrim(upper(COALESCE(v_inversion.moneda, 'ARS'))) THEN
        RAISE EXCEPTION '{"key": "error_wallet_currency_mismatch", "params": {}}';
    END IF;

    SELECT estructura_id INTO v_categoria_inversion_id
    FROM public.p_estructuras_egresos
    WHERE user_id = v_user_id AND tipo_cupo = 'investment'
    ORDER BY estructura_id LIMIT 1;

    -- El dinero sale de la billetera y entra a la inversión: egreso en la billetera,
    -- con la categoría de inversiones, igual que el alta de una inversión nueva.
    INSERT INTO public.p_caja (
        user_id, tipo, billetera_origen_id, valor_egreso,
        estructura_egreso_id, fecha, detalle, metadata
    ) VALUES (
        v_user_id, 'expense', p_billetera_origen_id, p_monto,
        v_categoria_inversion_id, CURRENT_DATE,
        'investment_contribution: ' || v_inversion.nombre_activo,
        jsonb_build_object('inversion_id', p_inversion_id, 'es_aporte', true)
    );

    UPDATE public.p_inversiones
       SET monto_invertido_original = monto_invertido_original + p_monto
     WHERE inversion_id = p_inversion_id
    RETURNING monto_invertido_original INTO v_capital_nuevo;

    RETURN jsonb_build_object(
        'monto_aportado', p_monto,
        'capital_nuevo', v_capital_nuevo,
        'moneda', COALESCE(v_inversion.moneda, 'ARS'),
        'nombre_activo', v_inversion.nombre_activo
    );
END;
$function$;

-- Verificación (read-only):
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--    where proname = 'fn_aportar_inversion';
