CREATE OR REPLACE FUNCTION public.fn_aprobar_cuarentena(p_pendiente_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_rec RECORD;
    v_caja_id bigint;
    v_metadata jsonb;
    v_saldo_actual numeric;
    v_wallet_nombre text;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT *
    INTO v_rec
    FROM public.p_caja_cuarentena
    WHERE pendiente_id = p_pendiente_id
      AND user_id = v_user_id
      AND estado = 'pendiente';

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_quarantine_item_not_found", "params": {}}';
    END IF;

    v_metadata := COALESCE(v_rec.metadata, '{}'::jsonb);
    v_metadata := jsonb_set(v_metadata, '{origen_cuarentena}', to_jsonb(v_rec.origen));
    IF v_rec.recurrente_id IS NOT NULL THEN
        v_metadata := jsonb_set(v_metadata, '{recurrente_id}', to_jsonb(v_rec.recurrente_id));
    END IF;


    -- Wallet integrity: the paying wallet must exist, belong to the user
    -- and cover the amount. The row is locked to serialize concurrent
    -- approvals spending the same balance.
    IF v_rec.billetera_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_quarantine_no_wallet", "params": {}}';
    END IF;

    SELECT b.saldo_actual, b.nombre
    INTO v_saldo_actual, v_wallet_nombre
    FROM public.p_billeteras b
    WHERE b.billetera_id = v_rec.billetera_id
      AND b.user_id = v_user_id
    FOR UPDATE;

    IF v_saldo_actual IS NULL THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
    END IF;

    IF v_saldo_actual < v_rec.monto THEN
        RAISE EXCEPTION '{"key": "error_wallet_saldo_insuficiente", "params": {"nombre": "%", "saldo": %}}',
            v_wallet_nombre, v_saldo_actual;
    END IF;
    INSERT INTO public.p_caja (
        user_id,
        tipo,
        billetera_origen_id,
        valor_egreso,
        fecha,
        estructura_egreso_id,
        detalle,
        metadata
    )
    VALUES (
        v_user_id,
        'expense',
        v_rec.billetera_id,
        v_rec.monto,
        v_rec.fecha,
        v_rec.estructura_egreso_id,
        v_rec.detalle,
        v_metadata
    )
    RETURNING p_caja_id INTO v_caja_id;

    UPDATE public.p_caja_cuarentena
    SET estado = 'procesado'
    WHERE pendiente_id = p_pendiente_id;

    RETURN v_caja_id;
END;
$function$




CREATE OR REPLACE FUNCTION public.fn_aprobar_gastos_cuarentena_lote(p_pendiente_ids bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    r_item RECORD;
    v_metadata jsonb;
    v_saldo_actual numeric;
    v_wallet_nombre text;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    FOR r_item IN
        SELECT *
        FROM p_caja_cuarentena
        WHERE pendiente_id = ANY(p_pendiente_ids)
          AND user_id = v_user_id
          AND estado = 'pendiente'
    LOOP
        v_metadata := COALESCE(r_item.metadata, '{}'::jsonb);
        v_metadata := jsonb_set(v_metadata, '{origen_cuarentena}', to_jsonb(r_item.origen));

        IF r_item.recurrente_id IS NOT NULL THEN
            v_metadata := jsonb_set(v_metadata, '{recurrente_id}', to_jsonb(r_item.recurrente_id));
        END IF;


    -- Wallet integrity: the paying wallet must exist, belong to the user
    -- and cover the amount. The row is locked to serialize concurrent
    -- approvals spending the same balance.
    IF r_item.billetera_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_quarantine_no_wallet", "params": {}}';
    END IF;

    SELECT b.saldo_actual, b.nombre
    INTO v_saldo_actual, v_wallet_nombre
    FROM public.p_billeteras b
    WHERE b.billetera_id = r_item.billetera_id
      AND b.user_id = v_user_id
    FOR UPDATE;

    IF v_saldo_actual IS NULL THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
    END IF;

    IF v_saldo_actual < r_item.monto THEN
        RAISE EXCEPTION '{"key": "error_wallet_saldo_insuficiente", "params": {"nombre": "%", "saldo": %}}',
            v_wallet_nombre, v_saldo_actual;
    END IF;
        INSERT INTO p_caja (
            user_id,
            tipo,
            billetera_origen_id,
            valor_egreso,
            fecha,
            estructura_egreso_id,
            detalle,
            metadata
        ) VALUES (
            v_user_id,
            'expense',
            r_item.billetera_id,
            r_item.monto,
            r_item.fecha,
            r_item.estructura_egreso_id,
            r_item.detalle,
            v_metadata
        );

        UPDATE p_caja_cuarentena
        SET estado = 'procesado'
        WHERE pendiente_id = r_item.pendiente_id;
    END LOOP;
END;
$function$



