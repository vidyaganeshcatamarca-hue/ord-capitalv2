CREATE OR REPLACE FUNCTION public.fn_editar_cuarentena_v2(
    p_pendiente_id bigint,
    p_tipo text DEFAULT NULL,
    p_monto numeric DEFAULT NULL,
    p_destination_amount numeric DEFAULT NULL,
    p_billetera_id bigint DEFAULT NULL,
    p_billetera_destino_id bigint DEFAULT NULL,
    p_tarjeta_id bigint DEFAULT NULL,
    p_estructura_egreso_id bigint DEFAULT NULL,
    p_cuenta_ingreso_id bigint DEFAULT NULL,
    p_moneda text DEFAULT NULL,
    p_cuotas integer DEFAULT NULL,
    p_fecha date DEFAULT NULL,
    p_detalle text DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_rec RECORD;
    v_exists boolean;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT * INTO v_rec
    FROM public.p_caja_cuarentena
    WHERE pendiente_id = p_pendiente_id
      AND user_id = v_user_id
      AND estado = 'pendiente';

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_quarantine_item_not_found", "params": {}}';
    END IF;

    IF p_tipo IS NOT NULL AND p_tipo NOT IN ('expense', 'income', 'transfer', 'card_expense') THEN
        RAISE EXCEPTION '{"key": "error_invalid_movement_type", "params": {}}';
    END IF;

    IF p_billetera_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM p_billeteras
            WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND activa = true
        ) INTO v_exists;
        IF NOT v_exists THEN
            RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
        END IF;
    END IF;

    IF p_billetera_destino_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM p_billeteras
            WHERE billetera_id = p_billetera_destino_id AND user_id = v_user_id AND activa = true
        ) INTO v_exists;
        IF NOT v_exists THEN
            RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
        END IF;
    END IF;

    IF p_tarjeta_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM p_tarjetas_credito
            WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id
        ) INTO v_exists;
        IF NOT v_exists THEN
            RAISE EXCEPTION '{"key": "error_card_not_found", "params": {}}';
        END IF;
    END IF;

    IF p_estructura_egreso_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM p_estructuras_egresos
            WHERE estructura_id = p_estructura_egreso_id AND user_id = v_user_id
        ) INTO v_exists;
        IF NOT v_exists THEN
            RAISE EXCEPTION '{"key": "error_category_not_found", "params": {}}';
        END IF;
    END IF;

    IF p_cuenta_ingreso_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM p_ingresos
            WHERE producto_id = p_cuenta_ingreso_id AND user_id = v_user_id
        ) INTO v_exists;
        IF NOT v_exists THEN
            RAISE EXCEPTION '{"key": "error_income_source_not_found", "params": {}}';
        END IF;
    END IF;

    UPDATE public.p_caja_cuarentena
    SET
        tipo = COALESCE(p_tipo, tipo),
        monto = COALESCE(p_monto, monto),
        destination_amount = COALESCE(p_destination_amount, destination_amount),
        billetera_id = COALESCE(p_billetera_id, billetera_id),
        billetera_destino_id = COALESCE(p_billetera_destino_id, billetera_destino_id),
        tarjeta_id = COALESCE(p_tarjeta_id, tarjeta_id),
        estructura_egreso_id = COALESCE(p_estructura_egreso_id, estructura_egreso_id),
        cuenta_ingreso_id = COALESCE(p_cuenta_ingreso_id, cuenta_ingreso_id),
        moneda = COALESCE(p_moneda, moneda),
        cuotas = COALESCE(p_cuotas, cuotas),
        fecha = COALESCE(p_fecha, fecha),
        detalle = COALESCE(p_detalle, detalle)
    WHERE pendiente_id = p_pendiente_id
      AND user_id = v_user_id
      AND estado = 'pendiente';
END;
$function$;
