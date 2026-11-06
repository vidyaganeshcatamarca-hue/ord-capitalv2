# fn_desactivar_modo_avanzado

## Descripción
Cambia la preferencia del usuario actual a modo `simple`.

## Código SQL
```sql
CREATE OR REPLACE FUNCTION fn_desactivar_modo_avanzado()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  INSERT INTO user_modo_app (user_id, modo_app)
  VALUES (v_user_id, 'simple')
  ON CONFLICT (user_id) DO UPDATE SET modo_app = 'simple', updated_at = NOW();
END;
$$;
```
