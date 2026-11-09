-- Alta de sobre. Sólo el nombre es obligatorio; meta y fecha son opcionales.
-- El aporte inicial es todo o nada y descuenta la billetera en las dos
-- modalidades. En plan Free no se crean sobres.
-- PRD: DF-06, DF-07, DF-25, DF-31.

CREATE OR REPLACE FUNCTION public.fn_sobre_crear(p_nombre text, p_moneda text, p_monto_meta numeric DEFAULT NULL::numeric, p_fecha_objetivo date DEFAULT NULL::date, p_aporte_billetera_id bigint DEFAULT NULL::bigint, p_aporte_importe numeric DEFAULT NULL::numeric, p_aporte_modalidad text DEFAULT NULL::text, p_aporte_genera_rendimiento boolean DEFAULT false, p_icono text DEFAULT 'ðŸ’°'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_plan text;
    v_sobre_id bigint;
    v_orden integer;
    v_wallet public.p_billeteras;
    v_caja_id bigint;
BEGIN
    SELECT u.user_id, u.plan_tipo INTO v_user_id, v_plan
    FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF v_plan = 'free' THEN
        RAISE EXCEPTION '{"key": "error_sobre_plan_requires_premium", "params": {}}';
    END IF;

    IF p_nombre IS NULL OR length(btrim(p_nombre)) = 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_name_required", "params": {}}';
    END IF;
    IF p_moneda IS NULL OR length(btrim(p_moneda)) = 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_currency_required", "params": {}}';
    END IF;
    IF p_monto_meta IS NOT NULL AND p_monto_meta <= 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_meta_invalid", "params": {}}';
    END IF;

    -- El aporte inicial, si viene, se valida ANTES de crear nada (Â§16.9).
    IF p_aporte_billetera_id IS NOT NULL OR p_aporte_importe IS NOT NULL THEN
        IF p_aporte_billetera_id IS NULL OR p_aporte_importe IS NULL
           OR p_aporte_importe <= 0 OR p_aporte_modalidad IS NULL THEN
            RAISE EXCEPTION '{"key": "error_sobre_initial_aporte_invalid", "params": {}}';
        END IF;
        IF p_aporte_modalidad NOT IN ('real','virtual') THEN
            RAISE EXCEPTION '{"key": "error_sobre_modality_invalid", "params": {}}';
        END IF;
        IF p_aporte_genera_rendimiento AND p_aporte_modalidad <> 'real' THEN
            RAISE EXCEPTION '{"key": "error_sobre_yield_requires_real", "params": {}}';
        END IF;

        SELECT * INTO v_wallet FROM public.p_billeteras w
        WHERE w.billetera_id = p_aporte_billetera_id AND w.user_id = v_user_id;

        IF v_wallet.billetera_id IS NULL OR v_wallet.activa = false THEN
            RAISE EXCEPTION '{"key": "error_sobre_wallet_not_found", "params": {}}';
        END IF;
        IF COALESCE(v_wallet.moneda, 'ARS') <> p_moneda THEN
            RAISE EXCEPTION '{"key": "error_sobre_currency_mismatch", "params": {"sobre": "{{sobre}}", "billetera": "{{billetera}}"}}';
        END IF;

        -- El saldo de la billetera ya es el disponible: no se descuentan
        -- reservas previas.
        IF v_wallet.saldo_actual < p_aporte_importe THEN
            RAISE EXCEPTION '{"key": "error_sobre_wallet_insufficient", "params": {"billetera": "{{billetera}}"}}';
        END IF;
    END IF;

    SELECT COALESCE(MAX(b.orden), 0) + 1 INTO v_orden
    FROM public.p_sobres b WHERE b.user_id = v_user_id;

    INSERT INTO public.p_sobres (user_id, nombre, moneda, monto_meta, fecha_objetivo, orden, icono)
    VALUES (v_user_id, btrim(p_nombre), p_moneda, p_monto_meta, p_fecha_objetivo, v_orden, COALESCE(p_icono, 'ðŸ’°'))
    RETURNING sobre_id INTO v_sobre_id;

    IF p_aporte_billetera_id IS NOT NULL THEN
        v_caja_id := public.fn_sobre_pata_billetera(
            v_user_id, p_aporte_billetera_id, p_moneda, p_aporte_importe, true,
            'savings_envelope_aporte_real', v_sobre_id, btrim(p_nombre)
        );

        INSERT INTO public.p_sobre_movimientos (
            sobre_id, user_id, tipo, importe, moneda, billetera_id, modalidad,
            genera_rendimiento, caja_movimiento_id
        ) VALUES (
            v_sobre_id, v_user_id, 'aporte', p_aporte_importe, p_moneda,
            p_aporte_billetera_id, p_aporte_modalidad,
            COALESCE(p_aporte_genera_rendimiento, false), v_caja_id
        );
    END IF;

    RETURN v_sobre_id;
END;
$function$;
