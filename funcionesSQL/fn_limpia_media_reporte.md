# fn_limpia_media_reporte (+ triggers) — RETIRADA 2026-10-02

**RETIRO: Supabase bloquea el DELETE SQL directo de storage.objects (trigger interno protect_delete, ERROR 42501) — el trigger hacia FAIL el UPDATE/DELETE del reporte. La limpieza se hace desde el front con la Storage API (permitida por policies): delete-flow + lazy-cleanup de resueltos al abrir Mis reportes. Descartados: a mano o backend futuro. Se conservan triggers en Supabase NO (dropped). VER CODIGO HISTORICO abajo como referencia NO aplicada.**

## Descripcion
Limpieza AUTOMATICA de las capturas del bucket privado `reportes` (decision dueno 2026-10-02, sin cron). Se dispara cuando:
- el reporte pasa a estado `resuelto` o `descartado` (UPDATE de `estado`), o
- el reporte se borra (DELETE, ej. via `fn_eliminar_mi_reporte`).

La fila del reporte conserva TODO el texto (titulo, descripcion, transcripcion_audio, respuesta_admin); solo desaparecen los OBJETOS del storage cuyo `name` esta listado en `media` (jsonb de paths `uid/uuid.webp`). El trigger corre como postgres (SECURITY DEFINER → bypassea las policies RLS del storage).

## Firma
`fn_limpia_media_reporte() RETURNS trigger` (AFTER UPDATE OF estado / AFTER DELETE ON app_reportes)

## Notas
- `media` vacia o NULL: no hace nada.
- Los DELETE de storage no son recuperables (sin version): intencional.
- Si el dueno corrige un estado (resuelto -> en_revision), las imagenes ya no vuelven (no hay copia). Aceptado por diseno.

## Codigo SQL (aplicado en vivo 2026-10-02)
```sql
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

-- creacion idempotente apuntada en el script (DO block), def vigente:
CREATE TRIGGER tr_limpia_media_reporte_delete
AFTER DELETE ON public.app_reportes
FOR EACH ROW
EXECUTE FUNCTION public.fn_limpia_media_reporte();
```