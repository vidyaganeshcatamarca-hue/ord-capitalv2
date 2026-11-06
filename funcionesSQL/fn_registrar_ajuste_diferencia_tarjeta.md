CREATE OR REPLACE FUNCTION public.fn_registrar_ajuste_diferencia_tarjeta(
  p_tarjeta_id bigint,
  p_diferencia numeric,
  p_fecha date DEFAULT CURRENT_DATE,
  p_parent_pago_caja_id bigint DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_estructura_padre_id int8;
  v_estructura_id int8;
  v_moneda text;
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

  -- Validar tarjeta del usuario
  IF NOT EXISTS (
    SELECT 1 FROM public.p_tarjetas_credito
    WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  IF p_diferencia IS NULL OR p_diferencia = 0 THEN
    RETURN; -- sin diferencia, no hay ajuste que registrar
  END IF;

  -- Moneda del ajuste: la de la tarjeta
  SELECT COALESCE(moneda_iso, 'ARS') INTO v_moneda
    FROM public.p_tarjetas_credito
    WHERE tarjeta_id = p_tarjeta_id;

  -- Auto-crear la cuenta de sistema (misma estructura que cat_mystery:
  -- padre cat_card_diff + subcuenta no_detail), si no existe.
  SELECT estructura_id INTO v_estructura_padre_id
    FROM public.p_estructuras_egresos
    WHERE nombre_cuenta = 'cat_card_diff' AND user_id = v_user_id AND padre_id IS NULL;

  IF v_estructura_padre_id IS NULL THEN
    INSERT INTO public.p_estructuras_egresos (user_id, nombre_cuenta, tipo_cupo, descripcion, icono, color)
    VALUES (v_user_id, 'cat_card_diff', 'need', 'Diferencias entre resumen de tarjeta y valor del banco', '💳', '#8B5CF6')
    RETURNING estructura_id INTO v_estructura_padre_id;
  END IF;

  SELECT estructura_id INTO v_estructura_id
    FROM public.p_estructuras_egresos
    WHERE padre_id = v_estructura_padre_id AND nombre_cuenta = 'no_detail' AND user_id = v_user_id;

  IF v_estructura_id IS NULL THEN
    INSERT INTO public.p_estructuras_egresos (user_id, padre_id, nombre_cuenta, tipo_cupo, descripcion, icono, color)
    VALUES (v_user_id, v_estructura_padre_id, 'no_detail', 'need', 'Diferencia Tarjeta', '💳', '#8B5CF6')
    RETURNING estructura_id INTO v_estructura_id;
  END IF;

  -- Registro en p_caja: tipo adjustment, acumulable mes a mes, consultable.
  -- Misma convención que fn_ejecutar_conciliacion (misterio olvido):
  -- diferencia > 0 (banco > tarjeta, pagó de más) → valor_egreso con la subcuenta;
  -- diferencia < 0 (banco < tarjeta, pagó de menos) → valor_ingreso sin estructura.
  IF p_diferencia > 0 THEN
    INSERT INTO public.p_caja (user_id, fecha, tipo, tarjeta_id, billetera_origen_id, valor_egreso, valor_ingreso, estructura_egreso_id, detalle, moneda, parent_pago_caja_id)
    VALUES (v_user_id, p_fecha, 'adjustment', p_tarjeta_id, NULL, p_diferencia, 0, v_estructura_id, 'adjustment_card_diff', v_moneda, p_parent_pago_caja_id);
  ELSE
    INSERT INTO public.p_caja (user_id, fecha, tipo, tarjeta_id, billetera_origen_id, valor_ingreso, valor_egreso, estructura_egreso_id, detalle, moneda, parent_pago_caja_id)
    VALUES (v_user_id, p_fecha, 'adjustment', p_tarjeta_id, NULL, -p_diferencia, 0, v_estructura_id, 'adjustment_card_diff', v_moneda, p_parent_pago_caja_id);
  END IF;
END;
$function$