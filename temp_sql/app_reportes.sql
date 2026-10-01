-- Script 2: tabla app_reportes + 3 RPCs + bucket 'reportes' + policies (2026-10-01)
-- Spec completo: odd/tasks/bloqueo-y-reportes.md (Parte B + B++).

-- ============ TABLA ============
CREATE TABLE IF NOT EXISTS public.app_reportes (
  reporte_id          bigserial PRIMARY KEY,
  usuario_id          bigint NOT NULL,
  titulo              varchar(150) NOT NULL,
  descripcion         text,
  transcripcion_audio text,
  tiene_audio         boolean NOT NULL DEFAULT false,
  media               jsonb NOT NULL DEFAULT '[]'::jsonb,
  pantalla            text,
  version_app         text,
  plataforma          text,
  estado              text NOT NULL DEFAULT 'nuevo'
                      CHECK (estado IN ('nuevo','en_revision','resuelto','descartado')),
  respuesta_admin     text,
  creado_el           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_reportes_titulo_len CHECK (char_length(trim(titulo)) <= 150)
);

CREATE INDEX IF NOT EXISTS ix_reportes_usuario_fecha
  ON public.app_reportes (usuario_id, creado_el DESC);
CREATE INDEX IF NOT EXISTS ix_reportes_estado
  ON public.app_reportes (estado);

ALTER TABLE public.app_reportes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bp_reportes_deny_all ON public.app_reportes;
CREATE POLICY bp_reportes_deny_all ON public.app_reportes
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ============ fn_crear_reporte ============
-- Devuelve json {ok, reporte_id?, estado?, error_key?}.
-- titulo 5..150; cuerpo = descripcion (10..4000) O transcripcion_audio
-- (texto convertido por la voice API; nunca visible al usuario).
CREATE OR REPLACE FUNCTION public.fn_crear_reporte(
  p_titulo             text   DEFAULT NULL,
  p_descripcion        text   DEFAULT NULL,
  p_transcripcion_audio text  DEFAULT NULL,
  p_tiene_audio        boolean DEFAULT FALSE,
  p_media              jsonb  DEFAULT NULL,
  p_pantalla           text   DEFAULT NULL,
  p_version_app        text   DEFAULT NULL,
  p_plataforma         text   DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   bigint;
  v_reporte_id bigint;
  v_hoy_dia   integer;
BEGIN
  SELECT user_id INTO v_user_id FROM usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_auth_requerido');
  END IF;

  -- Anti-abuse: max 5 reportes por usuario cada 24h
  SELECT COUNT(*) INTO v_hoy_dia
  FROM app_reportes
  WHERE usuario_id = v_user_id
    AND creado_el > now() - interval '24 hours';
  IF v_hoy_dia >= 5 THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_limite_diario');
  END IF;

  p_titulo := NULLIF(trim(COALESCE(p_titulo, '')), '');
  IF p_titulo IS NULL OR char_length(p_titulo) < 5 THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_titulo');
  END IF;

  p_descripcion := NULLIF(trim(COALESCE(p_descripcion, '')), '');
  p_transcripcion_audio := NULLIF(trim(COALESCE(p_transcripcion_audio, '')), '');

  IF p_descripcion IS NULL AND p_transcripcion_audio IS NULL THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_cuerpo');
  END IF;
  IF p_descripcion IS NOT NULL
     AND (char_length(p_descripcion) < 10 OR char_length(p_descripcion) > 4000) THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_descripcion');
  END IF;
  IF p_transcripcion_audio IS NOT NULL AND char_length(p_transcripcion_audio) > 8000 THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_descripcion');
  END IF;

  INSERT INTO app_reportes
    (usuario_id, titulo, descripcion, transcripcion_audio, tiene_audio,
     media, pantalla, version_app, plataforma)
  VALUES
    (v_user_id, p_titulo, p_descripcion, p_transcripcion_audio,
     COALESCE(p_tiene_audio, FALSE), COALESCE(p_media, '[]'::jsonb),
     p_pantalla, p_version_app, p_plataforma)
  RETURNING reporte_id INTO v_reporte_id;

  RETURN json_build_object('ok', true, 'reporte_id', v_reporte_id, 'estado', 'nuevo');
END;
$function$;

-- ============ fn_obtener_mis_reportes ============
-- Ultimos 50, excluye estado='descartado' (decision del dueno).
-- NO expone transcripcion_audio (el usuario nunca ve la transcripcion).
CREATE OR REPLACE FUNCTION public.fn_obtener_mis_reportes()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
          'media',          r.media
        ) ORDER BY r.creado_el DESC)::json
      FROM (
        SELECT reporte_id, titulo, descripcion, estado, creado_el,
               respuesta_admin, tiene_audio, media
        FROM app_reportes
        WHERE usuario_id = v_user_id
          AND estado <> 'descartado'
        ORDER BY creado_el DESC
        LIMIT 50
      ) r
    ),
    '[]'::json
  ));
END;
$function$;

-- ============ fn_eliminar_mi_reporte ============
-- Borra SOLO el propio reporte del usuario Y solo si estado='nuevo'.
-- La limpieza de las imagenes del bucket la hace el front (policies propias).
CREATE OR REPLACE FUNCTION public.fn_eliminar_mi_reporte(p_reporte_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_borrado bigint;
BEGIN
  SELECT user_id INTO v_user_id FROM usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_auth_requerido');
  END IF;

  DELETE FROM app_reportes
  WHERE reporte_id = p_reporte_id
    AND usuario_id = v_user_id
    AND estado = 'nuevo'
  RETURNING reporte_id INTO v_borrado;

  IF v_borrado IS NULL THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_borrar');
  END IF;

  RETURN json_build_object('ok', true);
END;
$function$;

-- ============ BUCKET de imagenes 'reportes' (privado) ============
-- Solo imagenes: el audio de reportes NUNCA pasa por storage (mult a la voice API).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reportes', 'reportes',
  false,
  4194304, -- 4MB por imagen (front comprime a ~1080px WebP, se queda lejos)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policies: el usuario opera SOLO en su subprefijo reportes/<uid>/...
DROP POLICY IF EXISTS bp_reportes_img_insert ON storage.objects;
CREATE POLICY bp_reportes_img_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'reportes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS bp_reportes_img_select ON storage.objects;
CREATE POLICY bp_reportes_img_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'reportes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS bp_reportes_img_delete ON storage.objects;
CREATE POLICY bp_reportes_img_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'reportes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );