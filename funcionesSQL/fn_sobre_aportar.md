-- Aporte a un sobre. La plata sale de la billetera en LAS DOS modalidades:
-- la diferencia entre real y virtual la resuelve Conciliacion, no el saldo.
-- La billetera ya viene neta de lo apartado en otros sobres, asi que el
-- chequeo de saldo compara directo contra saldo_actual. En Free no se aporta.
-- PRD: DF-01, DF-03, DF-07, DF-08, DF-31.

CREATE OR REPLACE FUNCTION public.fn_sobre_aportar(p_sobre_id bigint, p_billetera_id bigint, p_importe numeric, p_modalidad text, p_genera_rendimiento boolean DEFAULT false, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_plan text;
    v_sobre public.p_sobres;
    v_wallet public.p_billeteras;
    v_movimiento_id bigint;
    v_caja_id bigint;
BEGIN
    SELECT u.user_id, u.plan_tipo INTO v_user_id, v_plan
    FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF v_plan = 'free' THEN
        RAISE EXCEPTION '{"key": "error_sobre_plan_requires_premium", "params": {}}';
    END IF;

    SELECT * INTO v_sobre FROM public.p_sobres b
    WHERE b.sobre_id = p_sobre_id AND b.user_id = v_user_id;
    IF v_sobre.sobre_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_not_found", "params": {}}';
    END IF;
    IF v_sobre.archivado_at IS NOT NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_archived", "params": {}}';
    END IF;

    IF p_importe IS NULL OR p_importe <= 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_amount_invalid", "params": {}}';
    END IF;
    IF p_modalidad IS NULL OR p_modalidad NOT IN ('real','virtual') THEN
        RAISE EXCEPTION '{"key": "error_sobre_modality_invalid", "params": {}}';
    END IF;
    IF p_genera_rendimiento AND p_modalidad <> 'real' THEN
        RAISE EXCEPTION '{"key": "error_sobre_yield_requires_real", "params": {}}';
    END IF;

    SELECT * INTO v_wallet FROM public.p_billeteras w
    WHERE w.billetera_id = p_billetera_id AND w.user_id = v_user_id;
    IF v_wallet.billetera_id IS NULL OR v_wallet.activa = false THEN
        RAISE EXCEPTION '{"key": "error_sobre_wallet_not_found", "params": {}}';
    END IF;
    IF COALESCE(v_wallet.moneda, 'ARS') <> v_sobre.moneda THEN
        RAISE EXCEPTION '{"key": "error_sobre_currency_mismatch", "params": {"sobre": "{{sobre}}", "billetera": "{{billetera}}"}}';
    END IF;

    -- La billetera ya viene neta de lo que estÃ¡ apartado en otros sobres (la
    -- regla es que su saldo ES el disponible), asÃ­ que no hay que descontar
    -- reservas previas: alcanza con comparar contra el saldo actual.
    IF v_wallet.saldo_actual < p_importe THEN
        RAISE EXCEPTION '{"key": "error_sobre_wallet_insufficient", "params": {"billetera": "{{billetera}}"}}';
    END IF;

    -- La plata sale de la billetera en LAS DOS modalidades: la diferencia entre
    -- real y virtual la resuelve la conciliaciÃ³n, no el saldo.
    v_caja_id := public.fn_sobre_pata_billetera(
        v_user_id, p_billetera_id, v_sobre.moneda, p_importe, true,
        'savings_envelope_aporte_real', p_sobre_id, v_sobre.nombre
    );

    INSERT INTO public.p_sobre_movimientos (
        sobre_id, user_id, tipo, importe, moneda, billetera_id, modalidad,
        genera_rendimiento, fecha, caja_movimiento_id
    ) VALUES (
        p_sobre_id, v_user_id, 'aporte', p_importe, v_sobre.moneda,
        p_billetera_id, p_modalidad, COALESCE(p_genera_rendimiento, false),
        COALESCE(p_fecha, CURRENT_DATE), v_caja_id
    )
    RETURNING movimiento_id INTO v_movimiento_id;

    UPDATE public.p_sobres SET actualizado_at = now() WHERE sobre_id = p_sobre_id;

    RETURN v_movimiento_id;
END;
$function$;
