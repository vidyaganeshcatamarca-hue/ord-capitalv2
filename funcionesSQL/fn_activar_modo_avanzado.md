# fn_activar_modo_avanzado

## Descripción
Cambia la preferencia del usuario actual a modo `avanzado` (UPDATE en `usuarios.modo_app`; la preferencia es reversible con `fn_desactivar_modo_avanzado`).

- Error `{"key":"error_modo_avanzado_no_disponible"}` cuando el switch global `modo_avanzado_habilitado` está OFF.
- **REV.2 (2026-10-19, bug-4 tanda post-testing, autorizado):** con el switch global OFF, los usuarios de testing (`modo_avanzado_testing=true` + email en `modo_avanzado_testing_users`, parse con strip de todo whitespace) pueden activar igual — correlato de `fn_obtener_modo_app` rev.5 (testing da la CAPACIDAD de cambiar, no fuerza modo). No-testing users mantienen el error.
- Nota de proceso: este espejo contenía una definición obsoleta (leía columna `modo_avanzado_habilitado` inexistente en el esquema clave/valor y usaba tabla `user_modo_app`); reescrito desde la definición real de producción extraída con `pg_get_functiondef` + cambio rev.2 deployado.

## Código SQL (definición deployada rev.2)
```sql
CREATE OR REPLACE FUNCTION public.fn_activar_modo_avanzado()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_habilitado BOOLEAN;
  v_testing_habilitado BOOLEAN;
  v_testing_user BOOLEAN;
  v_email TEXT;
BEGIN
  SELECT (valor = 'true') INTO v_habilitado
  FROM app_global_config WHERE clave = 'modo_avanzado_habilitado';

  IF NOT COALESCE(v_habilitado, false) THEN
    -- Rev.2: admin test users may switch with the global switch OFF.
    SELECT email INTO v_email FROM usuarios WHERE auth_id = auth.uid();
    SELECT (valor = 'true') INTO v_testing_habilitado
      FROM app_global_config WHERE clave = 'modo_avanzado_testing';
    IF COALESCE(v_testing_habilitado, FALSE) AND v_email IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM app_global_config
        WHERE clave = 'modo_avanzado_testing_users'
          AND v_email = ANY (string_to_array(regexp_replace(valor, '\s+', '', 'g'), ','))
      ) INTO v_testing_user;
    ELSE
      v_testing_user := FALSE;
    END IF;
    IF NOT COALESCE(v_testing_user, FALSE) THEN
      RAISE EXCEPTION '{"key":"error_modo_avanzado_no_disponible"}';
    END IF;
  END IF;

  UPDATE usuarios SET modo_app = 'avanzado' WHERE auth_id = auth.uid();

  RETURN json_build_object('ok', true, 'modo', 'avanzado');
END;
$function$;
```