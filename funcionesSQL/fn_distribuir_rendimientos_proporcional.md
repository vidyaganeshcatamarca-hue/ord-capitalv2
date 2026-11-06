CREATE OR REPLACE FUNCTION public.fn_distribuir_rendimientos_proporcional(p_cuenta_madre_id bigint, p_monto_rendimiento numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_total_sobres numeric := 0;
    r_sobre RECORD;
    v_monto_distribuido numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF NOT EXISTS (SELECT 1 FROM p_billeteras WHERE billetera_id = p_cuenta_madre_id AND user_id = v_user_id AND es_cuenta_madre_ahorro = true) THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_mother_account", "params": {}}';
    END IF;
    IF p_monto_rendimiento <= 0 THEN RAISE EXCEPTION '{"key": "error_savings_fund_yield_zero", "params": {}}'; END IF;

    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_total_sobres
    FROM p_billeteras
    WHERE billetera_respaldo_id = p_cuenta_madre_id
      AND es_fondo_prevision = true
      AND activa = true;
    IF v_total_sobres = 0 THEN RAISE EXCEPTION '{"key": "error_no_orphan_savings_funds", "params": {}}'; END IF;

    FOR r_sobre IN
        SELECT billetera_id, saldo_actual
        FROM p_billeteras
        WHERE billetera_respaldo_id = p_cuenta_madre_id
          AND es_fondo_prevision = true
          AND activa = true
    LOOP
        v_monto_distribuido := (r_sobre.saldo_actual / v_total_sobres) * p_monto_rendimiento;

        INSERT INTO public.p_caja (
            user_id,
            tipo,
            billetera_origen_id,
            valor_ingreso,
            valor_egreso,
            fecha,
            detalle
        )
        VALUES (
            v_user_id,
            'adjustment',
            r_sobre.billetera_id,
            v_monto_distribuido,
            0,
            CURRENT_DATE,
            'mother_account_yield_distribution'
        );
    END LOOP;
END;
$function$
