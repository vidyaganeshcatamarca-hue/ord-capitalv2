# fn_crear_reporte

## Descripcion
Crea un reporte de bug del usuario (pantalla Ajustes -> 'Reportar un problema', feature spec odd/tasks/bloqueo-y-reportes.md). Cuerpo = descripcion escrita (10..4000) O transcripcion_audio (texto convertido por la voice API, invisible al usuario), en un INSERT todo-o-nada. Los adjuntos (capturas) ya fueron subidos por el front al bucket privado de storage 'reportes' (jsonb de paths; NO hay RPC de subida de media). LIMITE anti-abuso: max 5 reportes por usuario cada 24h (constante >= 5 en la RPC).

## Firma
`fn_crear_reporte(p_titulo, p_descripcion, p_transcripcion_audio, p_tiene_audio, p_media, p_pantalla, p_version_app, p_plataforma, p_tipo, p_idioma_origen, p_texto_original) RETURNS json`
— 11 params (rev.2 2026-10-02: **+ p_texto_original** text DEFAULT NULL; guarda el texto EN IDIOMA ORIGINAL del usuario; p_descripcion queda la traduccion al espanol para el dashboard del dueno). Columna `tuvo_adjuntos` boolean NOT NULL DEFAULT false seteada en el INSERT cuando `p_media <> '[]'` (historico: sobrevive la limpieza de storage de cron/front). Columna `explicacion_interna` text: NOTA DEL EQUIPO DEV de como se resolvio el problema (solo dashboard, NUNCA al usuario).

## Respuesta
- OK: `{ok:true, reporte_id bigint, estado:'nuevo'}`
- Errores (json `{ok:false, error_key}` → i18n es.ts):
  - `error_auth_requerido` — sin usuario
  - `error_reporte_limite_diario` — >= 5 reportes en 24h
  - `error_reporte_titulo` — titre < 5 o > 150 chars tras trim
  - `error_reporte_cuerpo` — sin descripcion y sin transcripcion
  - `error_reporte_descripcion` — descripcion 10..4000 o transcript > 8000

## Notas
- Trim + NULLIF; titulo obligatorio 5..150 (CHECK en la tabla).
- SECURITY DEFINER; auth via `usuarios WHERE auth_id = auth.uid()`.
- Tabla `app_reportes`: RLS deny-all (solo RPC); index (usuario_id, creado_el DESC) y (estado).
- El texto de la transcripcion NUNCA vuelve al usuario (fn_obtener_mis_reportes no lo expone; el dueño lo lee en dashboard).

## Codigo SQL (rev.2 aplicada en vivo 2026-10-02: p_tipo + max 150 + p_idioma_origen + validacion partida texto-cuerpo/extrara-opcional)
```sql
CREATE OR REPLACE FUNCTION public.fn_crear_reporte(
  p_titulo              text   DEFAULT NULL,
  p_descripcion         text   DEFAULT NULL,
  p_transcripcion_audio text   DEFAULT NULL,
  p_tiene_audio         boolean DEFAULT FALSE,
  p_media               jsonb  DEFAULT NULL,
  p_pantalla            text   DEFAULT NULL,
  p_version_app         text   DEFAULT NULL,
  p_plataforma          text   DEFAULT NULL,
  p_tipo                text   DEFAULT 'bug',
  p_idioma_origen       text   DEFAULT NULL,
  p_texto_original      text   DEFAULT NULL
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
    IF p_descripcion IS NOT NULL
       AND (char_length(p_descripcion) < 10 OR char_length(p_descripcion) > 4000) THEN
      RETURN json_build_object('ok', false, 'error_key', 'error_reporte_descripcion');
    END IF;
  ELSIF p_descripcion IS NOT NULL AND char_length(p_descripcion) > 4000 THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_descripcion');
  END IF;
  IF p_transcripcion_audio IS NOT NULL AND char_length(p_transcripcion_audio) > 8000 THEN
    RETURN json_build_object('ok', false, 'error_key', 'error_reporte_descripcion');
  END IF;

  INSERT INTO app_reportes
    (usuario_id, titulo, descripcion, texto_original, transcripcion_audio, tiene_audio,
     media, pantalla, version_app, plataforma, tipo, idioma_origen, tuvo_adjuntos)
  VALUES
    (v_user_id, p_titulo, p_descripcion,
     NULLIF(trim(COALESCE(p_texto_original, '')), ''),
     p_transcripcion_audio,
     COALESCE(p_tiene_audio, FALSE),
     COALESCE(p_media, '[]'::jsonb),
     p_pantalla, p_version_app, p_plataforma, p_tipo, p_idioma_origen,
     (COALESCE(p_media, '[]'::jsonb) <> '[]'::jsonb))
  RETURNING reporte_id INTO v_reporte_id;

  RETURN json_build_object('ok', true, 'reporte_id', v_reporte_id, 'estado', 'nuevo', 'tipo', p_tipo);
END;
$function$

```