-- app_reportes rev: idioma_origen — decision dueno 2026-10-02 (saber el origen del idioma)
ALTER TABLE public.app_reportes
  ADD COLUMN IF NOT EXISTS idioma_origen text;

-- fn_crear_reporte acepta p_idioma_origen (idioma usado en el envio: job de audio o translate)
CREATE OR REPLACE FUNCTION public.fn_crear_reporte(
  p_titulo             text   DEFAULT NULL,
  p_descripcion        text   DEFAULT NULL,
  p_transcripcion_audio text  DEFAULT NULL,
  p_tiene_audio        boolean DEFAULT FALSE,
  p_media              jsonb  DEFAULT NULL,
  p_pantalla           text   DEFAULT NULL,
  p_version_app        text   DEFAULT NULL,
  p_plataforma         text   DEFAULT NULL,
  p_tipo               text   DEFAULT 'bug',
  p_idioma_origen      text   DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint; v_reporte_id bigint; v_hoy_dia integer;
BEGIN
  SELECT user_id INTO v_user_id FROM usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_auth_requerido');
  END IF;

  SELECT COUNT(*) INTO v_hoy_dia
  FROM app_reportes
  WHERE usuario_id = v_user_id AND creado_el > now() - interval '24 hours';
  IF v_hoy_dia >= 5 THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_limite_diario');
  END IF;

  IF p_tipo NOT IN ('bug','sugerencia') THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_cuerpo');
  END IF;

  p_titulo := NULLIF(trim(COALESCE(p_titulo, '')), '');
  IF p_titulo IS NULL OR char_length(p_titulo) < 5 OR char_length(p_titulo) > 150 THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_titulo');
  END IF;

  p_descripcion := NULLIF(trim(COALESCE(p_descripcion, '')), '');
  p_transcripcion_audio := NULLIF(trim(COALESCE(p_transcripcion_audio, '')), '');

  IF p_descripcion IS NULL AND p_transcripcion_audio IS NULL THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_cuerpo');
  END IF;
  IF p_transcripcion_audio IS NULL THEN
    -- El texto ES el cuerpo: 10..4000
    IF p_descripcion IS NOT NULL
       AND (char_length(p_descripcion) < 10 OR char_length(p_descripcion) > 4000) THEN
      RETURN json_build_object('ok', false, 'error_key', 'error_reporte_descripcion');
    END IF;
  ELSIF p_descripcion IS NOT NULL AND char_length(p_descripcion) > 4000 THEN
    -- El audio es el cuerpo: la nota escrita es extra opcional (sin minimo)
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_descripcion');
  END IF;
  IF p_transcripcion_audio IS NOT NULL AND char_length(p_transcripcion_audio) > 8000 THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_descripcion');
  END IF;

  INSERT INTO app_reportes
    (usuario_id, titulo, descripcion, transcripcion_audio, tiene_audio,
     media, pantalla, version_app, plataforma, tipo, idioma_origen)
  VALUES
    (v_user_id, p_titulo, p_descripcion, p_transcripcion_audio,
     COALESCE(p_tiene_audio, FALSE), COALESCE(p_media, '[]'::jsonb),
     p_pantalla, p_version_app, p_plataforma, p_tipo, p_idioma_origen)
  RETURNING reporte_id INTO v_reporte_id;

  RETURN json_build_object('ok', true, 'reporte_id', v_reporte_id, 'estado', 'nuevo', 'tipo', p_tipo);
END;
$function$
