# fn_obtener_nombre_usuario

## Descripción
Retorna el nombre real del usuario autenticado directamente desde la tabla `public.usuarios` en lugar de depender de los metadatos volátiles de sesión (OAuth).

## Código SQL
```sql
CREATE OR REPLACE FUNCTION public.fn_obtener_nombre_usuario()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_nombre text;
BEGIN
    SELECT nombre INTO v_nombre FROM public.usuarios WHERE auth_id = auth.uid();
    RETURN COALESCE(v_nombre, '');
END;
$function$;
```
