CREATE OR REPLACE FUNCTION public.fn_completar_saldo_inicial_billetera(
  p_billetera_id bigint,
  p_saldo_apertura numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_pending boolean;
  v_caja_id bigint;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  IF p_billetera_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "billetera_id"}}';
  END IF;

  IF p_saldo_apertura IS NULL OR p_saldo_apertura < 0 THEN
    RAISE EXCEPTION '{"key": "error_opening_balance_negative", "params": {}}';
  END IF;

  SELECT b.saldo_inicial_pendiente INTO v_pending
  FROM public.p_billeteras b
  WHERE b.billetera_id = p_billetera_id
    AND b.user_id = v_user_id
    AND b.activa = true;

  IF v_pending IS NULL THEN
    RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
  END IF;

  IF v_pending = false THEN
    RAISE EXCEPTION '{"key": "error_initial_balance_not_pending", "params": {}}';
  END IF;

  IF p_saldo_apertura > 0 THEN
    INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso, fecha, detalle)
    VALUES (v_user_id, 'opening', p_billetera_id, p_saldo_apertura, 0, CURRENT_DATE, 'initial_balance_completed_later')
    RETURNING p_caja_id INTO v_caja_id;
  END IF;

  UPDATE public.p_billeteras
  SET saldo_inicial_pendiente = false,
      ultima_conciliacion_at = now()
  WHERE billetera_id = p_billetera_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'billetera_id', p_billetera_id,
    'p_caja_id', v_caja_id,
    'saldo_inicial_pendiente', false
  );
END;
$function$;
