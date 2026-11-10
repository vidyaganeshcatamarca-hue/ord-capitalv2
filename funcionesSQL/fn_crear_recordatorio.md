CREATE OR REPLACE FUNCTION public.fn_crear_recordatorio(p_titulo text, p_hora time without time zone, p_descripcion text DEFAULT NULL::text, p_recurrente boolean DEFAULT true, p_dias_semana text[] DEFAULT NULL::text[], p_fecha_unica date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_id bigint;
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
  IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 OR length(p_titulo) > 60 THEN
    RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "titulo"}}';
  END IF;
  INSERT INTO public.p_recordatorios(user_id, titulo, descripcion, hora, dias_semana, recurrente, fecha_unica, activo)
  VALUES (v_user_id, trim(p_titulo), p_descripcion, p_hora, p_dias_semana, p_recurrente, p_fecha_unica, true)
  RETURNING recordatorio_id INTO v_id;
  RETURN v_id;
END;
$function$;
DECLARE v_user_id bigint; v_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 OR length(p_titulo) > 60 THEN
        RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "titulo"}}';
    END IF;
    INSERT INTO public.p_recordatorios(user_id, titulo, descripcion, hora, dias_semana, recurrente, fecha_unica, activo)
    VALUES (v_user_id, trim(p_titulo), p_descripcion, p_hora, p_dias_semana, p_recurrente, p_fecha_unica, true)
    RETURNING recordatorio_id INTO v_id;
    RETURN v_id;
END;
$function$
