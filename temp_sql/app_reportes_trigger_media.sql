-- #5 (aprobado): limpieza automatica de capturas del bucket 'reportes'
-- - al pasar el estado a 'resuelto' o 'descartado' (UPDATE de estado)
-- - al borrar el reporte (DELETE)
-- El trigger corre como postgres (bypassea RLS de storage); borra el OBJETO,
-- la fila del reporte conserva todo el texto. Decision del dueno: sin cron.

CREATE OR REPLACE FUNCTION public.fn_limpia_media_reporte()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'storage', 'public'
AS $function$
DECLARE
  v_paths text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_paths := COALESCE(ARRAY(SELECT jsonb_array_elements_text(OLD.media)), ARRAY[]::text[]);
  ELSE
    v_paths := COALESCE(ARRAY(SELECT jsonb_array_elements_text(NEW.media)), ARRAY[]::text[]);
  END IF;
  IF v_paths IS NULL OR array_length(v_paths, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  DELETE FROM storage.objects
  WHERE bucket_id = 'reportes'
    AND name = ANY(v_paths);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tr_limpia_media_reporte_estado ON public.app_reportes;
CREATE TRIGGER tr_limpia_media_reporte_estado
AFTER UPDATE OF estado ON public.app_reportes
FOR EACH ROW
WHEN (NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('resuelto','descartado'))
EXECUTE FUNCTION public.fn_limpia_media_reporte();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_limpia_media_reporte_delete' AND tgrelid = 'public.app_reportes'::regclass) THEN
    CREATE TRIGGER tr_limpia_media_reporte_delete
    AFTER DELETE ON public.app_reportes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_limpia_media_reporte();
  END IF;
END $$;

-- #4 complemento: Mis reportes ahora expone la pantalla elegida
CREATE OR REPLACE FUNCTION public.fn_obtener_mis_reportes()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
BEGIN
  SELECT user_id INTO v_user_id FROM usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_auth_requerido');
  END IF;

  RETURN json_build_object('ok', true, 'reportes', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'reporte_id',     r.reporte_id,
          'titulo',         r.titulo,
          'descripcion',    r.descripcion,
          'estado',         r.estado,
          'creado_el',      r.creado_el,
          'respuesta_admin', r.respuesta_admin,
          'tiene_audio',    r.tiene_audio,
          'media',          r.media,
          'tipo',           r.tipo,
          'pantalla',       r.pantalla
        ) ORDER BY r.creado_el DESC)::json
      FROM (
        SELECT reporte_id, titulo, descripcion, estado, creado_el,
               respuesta_admin, tiene_audio, media, tipo, pantalla
        FROM app_reportes
        WHERE usuario_id = v_user_id AND estado <> 'descartado'
        ORDER BY creado_el DESC
        LIMIT 50
      ) r
    ),
    '[]'::json
  ));
END;
$function$
