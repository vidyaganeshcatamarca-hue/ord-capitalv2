# fn_obtener_mis_reportes

## Descripcion
Lista 'Mis reportes' del usuario: ultimos 50 sin estado='descartado' (decision del dueno: los descartados desaparecen de la lista). NO expone transcripcion_audio (el usuario nunca ve la transcripcion; el dueño la lee en dashboard).

## Firma
`fn_obtener_mis_reportes() RETURNS json`

## Respuesta
- OK: `{ok:true, reportes:[{reporte_id, titulo, texto_original, estado, creado_el, respuesta_admin, tiene_audio, tuvo_adjuntos, media, pantalla, tipo}]}`
- Errores: `error_auth_requerido`
- Front renderiza descripcion + respuesta_admin en la card expandida; media paths -> signed URLs del bucket privado.

## Notas
- Orden creado_el DESC, LIMIT 50.
- SECURITY DEFINER; auth via `usuarios WHERE auth_id = auth.uid()`.

## Codigo SQL (rev.2 fix 2026-10-02: r.descripcion no existia fuera del alias — runtime 42703; COALESCE vive en el subquery)
```sql
-- fn_obtener_mis_reportes ahora incluye tipo
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
          'tipo',           r.tipo
        ) ORDER BY r.creado_el DESC)::json
      FROM (
        SELECT reporte_id, titulo, descripcion, estado, creado_el,
               respuesta_admin, tiene_audio, media, tipo
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
```