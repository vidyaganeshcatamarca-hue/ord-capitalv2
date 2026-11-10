# fn_desactivar_modo_avanzado

## Descripción
Cambia la preferencia del usuario actual a modo `simple`.

## Código SQL
```sql
CREATE OR REPLACE FUNCTION public.fn_desactivar_modo_avanzado()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE usuarios SET modo_app = 'simple' WHERE auth_id = auth.uid();

  RETURN json_build_object('ok', true, 'modo', 'simple');
END;
$function$;