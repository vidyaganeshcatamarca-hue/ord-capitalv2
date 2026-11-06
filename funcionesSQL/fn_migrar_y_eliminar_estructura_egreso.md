CREATE OR REPLACE FUNCTION public.fn_migrar_y_eliminar_estructura_egreso(
  p_estructura_id_origen bigint,
  p_estructura_id_destino bigint
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_origen_user_id bigint;
  v_destino_user_id bigint;
  v_tiene_hijas integer;
  v_migrados_caja integer := 0;
  v_migrados_presupuestos integer := 0;
  v_migrados_recurrentes integer := 0;
BEGIN
  -- Identidad
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

  -- Origen y destino validos y distintos
  IF p_estructura_id_origen IS NULL OR p_estructura_id_destino IS NULL THEN
    RAISE EXCEPTION '{"key": "error_invalid_params", "params": {}}';
  END IF;
  IF p_estructura_id_origen = p_estructura_id_destino THEN
    RAISE EXCEPTION '{"key": "error_invalid_params", "params": {}}';
  END IF;

  -- Origen existe y pertenece al usuario
  SELECT user_id INTO v_origen_user_id FROM public.p_estructuras_egresos WHERE estructura_id = p_estructura_id_origen;
  IF v_origen_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_category_not_found", "params": {}}'; END IF;
  IF v_origen_user_id <> v_user_id THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

  -- Destino existe y pertenece al usuario
  SELECT user_id INTO v_destino_user_id FROM public.p_estructuras_egresos WHERE estructura_id = p_estructura_id_destino;
  IF v_destino_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_category_not_found", "params": {}}'; END IF;
  IF v_destino_user_id <> v_user_id THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

  -- Bloqueo: si el origen tiene subcategorias hijas, no se puede borrar (borrar hijas primero)
  SELECT COUNT(*) INTO v_tiene_hijas FROM public.p_estructuras_egresos
  WHERE padre_id = p_estructura_id_origen AND user_id = v_user_id;
  IF v_tiene_hijas > 0 THEN
    RAISE EXCEPTION '{"key": "error_category_has_children", "params": {}}';
  END IF;

  -- Migrar p_caja (movimientos historicos)
  UPDATE public.p_caja
  SET estructura_egreso_id = p_estructura_id_destino
  WHERE estructura_egreso_id = p_estructura_id_origen
    AND user_id = v_user_id;
  GET DIAGNOSTICS v_migrados_caja = ROW_COUNT;

  -- Migrar p_presupuestos
  UPDATE public.p_presupuestos
  SET estructura_egreso_id = p_estructura_id_destino
  WHERE estructura_egreso_id = p_estructura_id_origen
    AND user_id = v_user_id;
  GET DIAGNOSTICS v_migrados_presupuestos = ROW_COUNT;

  -- Migrar p_gastos_recurrentes
  UPDATE public.p_gastos_recurrentes
  SET estructura_egreso_id = p_estructura_id_destino
  WHERE estructura_egreso_id = p_estructura_id_origen
    AND user_id = v_user_id;
  GET DIAGNOSTICS v_migrados_recurrentes = ROW_COUNT;

  -- Borrar la categoria origen
  DELETE FROM public.p_estructuras_egresos
  WHERE estructura_id = p_estructura_id_origen AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '{"key": "error_category_not_found", "params": {}}';
  END IF;

  RETURN jsonb_build_object(
    'migrados_caja', v_migrados_caja,
    'migrados_presupuestos', v_migrados_presupuestos,
    'migrados_recurrentes', v_migrados_recurrentes,
    'origen_id', p_estructura_id_origen,
    'destino_id', p_estructura_id_destino
  );
END;
$function$
