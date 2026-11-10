CREATE OR REPLACE FUNCTION public.fn_listar_recordatorios()
 RETURNS TABLE(recordatorio_id bigint, titulo text, descripcion text, hora time without time zone, dias_semana text[], recurrente boolean, fecha_unica date, activo boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
  RETURN QUERY
    SELECT r.recordatorio_id, r.titulo, r.descripcion, r.hora, r.dias_semana, r.recurrente, r.fecha_unica, r.activo
    FROM public.p_recordatorios r
    WHERE r.user_id = v_user_id
    ORDER BY r.hora ASC, r.created_at ASC;
END;
$function$;
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    RETURN QUERY
      SELECT r.recordatorio_id, r.titulo, r.descripcion, r.hora, r.dias_semana, r.recurrente, r.fecha_unica, r.activo
      FROM public.p_recordatorios r
      WHERE r.user_id = v_user_id
      ORDER BY r.hora ASC, r.created_at ASC;
END;
$function$
