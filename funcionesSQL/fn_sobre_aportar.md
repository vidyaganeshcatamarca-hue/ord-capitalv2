-- Aporte a un sobre. La modalidad real/virtual se decide en CADA movimiento.
-- En reserva virtual se exige que el dinero siga en la billetera; en reserva real el
-- dinero ya salió, así que no se descuenta dos veces. En Free no se aporta.
-- PRD: DF-01, DF-03, DF-07, DF-08 (superar la meta sólo advierte), DF-31.

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
    v_ya_reservado numeric;
    v_movimiento_id bigint;
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

    IF p_modalidad = 'virtual' THEN
        SELECT COALESCE(SUM(CASE WHEN m.tipo = 'rescate' THEN -m.importe ELSE m.importe END), 0)
        INTO v_ya_reservado
        FROM public.p_sobre_movimientos m
        WHERE m.billetera_id = p_billetera_id
          AND m.modalidad = 'virtual'
          AND m.moneda = v_sobre.moneda;

        IF v_wallet.saldo_actual - v_ya_reservado < p_importe THEN
            RAISE EXCEPTION '{"key": "error_sobre_wallet_insufficient", "params": {"billetera": "{{billetera}}"}}';
        END IF;
    END IF;

    INSERT INTO public.p_sobre_movimientos (
        sobre_id, user_id, tipo, importe, moneda, billetera_id, modalidad, genera_rendimiento, fecha
    ) VALUES (
        p_sobre_id, v_user_id, 'aporte', p_importe, v_sobre.moneda,
        p_billetera_id, p_modalidad, COALESCE(p_genera_rendimiento, false), COALESCE(p_fecha, CURRENT_DATE)
    )
    RETURNING movimiento_id INTO v_movimiento_id;

    UPDATE public.p_sobres SET actualizado_at = now() WHERE sobre_id = p_sobre_id;

    RETURN v_movimiento_id;
END;
$function$;
