CREATE OR REPLACE FUNCTION public.fn_aprobar_cuarentena_lote_v2(p_pendiente_ids bigint[])
 RETURNS TABLE(
    pendiente_id bigint,
    p_caja_id bigint,
    ok boolean,
    error_key text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_id bigint;
    v_caja_id bigint;
    v_error_key text;
    v_error_msg text;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_pendiente_ids IS NULL OR array_length(p_pendiente_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    FOREACH v_id IN ARRAY p_pendiente_ids
    LOOP
        v_caja_id := NULL;
        v_error_key := NULL;
        v_error_msg := NULL;

        BEGIN
            v_caja_id := public.fn_aprobar_cuarentena_v2(v_id);
            RETURN QUERY SELECT v_id, v_caja_id, true, NULL::text;
        EXCEPTION WHEN OTHERS THEN
            v_error_msg := SQLERRM;
            v_error_key := CASE
                WHEN v_error_msg LIKE '%error_field_required%' THEN 'error_field_required'
                WHEN v_error_msg LIKE '%error_invalid_amount%' THEN 'error_invalid_amount'
                WHEN v_error_msg LIKE '%error_invalid_movement_type%' THEN 'error_invalid_movement_type'
                WHEN v_error_msg LIKE '%error_quarantine_item_not_found%' THEN 'error_quarantine_item_not_found'
                WHEN v_error_msg LIKE '%error_transfer_different_currencies%' THEN 'error_transfer_different_currencies'
                WHEN v_error_msg LIKE '%error_transfer_insufficient_balance%' THEN 'error_transfer_insufficient_balance'
                WHEN v_error_msg LIKE '%error_wallet_not_found%' THEN 'error_wallet_not_found'
                WHEN v_error_msg LIKE '%error_wallet_inactive%' THEN 'error_wallet_inactive'
                WHEN v_error_msg LIKE '%error_destination_required%' THEN 'error_destination_required'
                WHEN v_error_msg LIKE '%error_transfer_same_wallet%' THEN 'error_transfer_same_wallet'
                ELSE 'error_voice_approve_failed'
            END;
            RETURN QUERY SELECT v_id, NULL::bigint, false, v_error_key;
        END;
    END LOOP;
END;
$function$;
