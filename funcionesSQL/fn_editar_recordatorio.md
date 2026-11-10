CREATE OR REPLACE FUNCTION public.fn_editar_recordatorio(p_recordatorio_id bigint, p_titulo text, p_hora time without time zone, p_descripcion text DEFAULT NULL::text, p_recurrente boolean DEFAULT true, p_dias_semana text[] DEFAULT NULL::text[], p_fecha_unica date DEFAULT NULL::date, p_activo boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.p_recordatorios
    WHERE recordatorio_id = p_recordatorio_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;
  UPDATE public.p_recordatorios SET
    titulo = trim(p_titulo),
    descripcion = p_descripcion,
    hora = p_hora,
    dias_semana = p_dias_semana,
    recurrente = p_recurrente,
    fecha_unica = p_fecha_unica,
    activo = p_activo
  WHERE recordatorio_id = p_recordatorio_id AND user_id = v_user_id;
END;
$function$;
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.p_recordatorios
        WHERE recordatorio_id = p_recordatorio_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;
    UPDATE public.p_recordatorios SET
        titulo = trim(p_titulo),
        descripcion = p_descripcion,
        hora = p_hora,
        dias_semana = p_dias_semana,
        recurrente = p_recurrente,
        fecha_unica = p_fecha_unica,
        activo = p_activo
    WHERE recordatorio_id = p_recordatorio_id AND user_id = v_user_id;
END;
$function$
