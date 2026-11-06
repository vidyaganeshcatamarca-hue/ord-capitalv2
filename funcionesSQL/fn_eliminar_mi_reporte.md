# fn_eliminar_mi_reporte

## Descripcion
Elimina SOLO un reporte propio del usuario y SOLO si estado='nuevo' (decision del dueno: si ya lo miramos queda congelado). Los archivos de capturas del bucket los limpia el front ANTES/DESPUES (policies propias por subprefijo uid).

## Firma
`fn_eliminar_mi_reporte(p_reporte_id bigint) RETURNS json`

## Respuesta
- OK: `{ok:true}`
- Errores: `error_auth_requerido`, `error_reporte_borrar` (no existe / no es propio / estado != 'nuevo')

## Notas
- DELETE ... RETURNING para distinguir no-encontrado.
- Sin edicion de reportes (decision).

## Codigo SQL (aplicada en vivo 2026-10-01)
```sql
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
```