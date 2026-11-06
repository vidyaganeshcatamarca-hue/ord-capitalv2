# fn_listar_categorias_ingreso

REV.2 (bug 3 fuentes de ingreso, 2026-10-02): solo fuentes activas + flag
`tiene_movimientos` para el modal de edición.

## Firma
`fn_listar_categorias_ingreso() RETURNS TABLE(producto_id bigint, nombre text, descripcion text, icono text, color text, es_pasivo boolean, tiene_movimientos boolean)`

## Cambios rev.2
- NUEVA columna final: `tiene_movimientos boolean` = EXISTS en `p_caja` por
  `cuenta_ingreso_id` (la FK de p_caja se llama `cuenta_ingreso_id`).
- Filtra `COALESCE(i.activo, true) = true`: las fuentes archivadas con
  `fn_archivar_fuente_ingreso` desaparecen de la lista.
- Requiere DROP previo: el retorno cambió de OUT params (no se puede
  CREATE OR REPLACE cambiando el row type).

## Front
- `CategoriaIngreso` en CategoriasPage incluye `tiene_movimientos`; el modal
  muestra Eliminar solo cuando es false.

## Fuente SQL
```sql
CREATE OR REPLACE FUNCTION public.fn_listar_categorias_ingreso()
 RETURNS TABLE(producto_id bigint, nombre text, descripcion text, icono text, color text, es_pasivo boolean, tiene_movimientos boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    RETURN QUERY
    SELECT
        i.producto_id,
        i.nombre,
        i.descripcion,
        COALESCE(i.icono, '💰') AS icono,
        COALESCE(i.color, '#22C55E') AS color,
        COALESCE(i.es_pasivo, false) AS es_pasivo,
        EXISTS (
            SELECT 1 FROM public.p_caja c
            WHERE c.user_id = v_user_id
              AND c.cuenta_ingreso_id = i.producto_id
        ) AS tiene_movimientos
    FROM public.p_ingresos i
    WHERE i.user_id = v_user_id
      AND COALESCE(i.activo, true) = true
    ORDER BY
        COALESCE(i.es_pasivo, false) ASC,
        lower(i.nombre) ASC;
END;
$function$;
```