# fn_admin_session

## Descripción
Primitiva de identidad y rol de **ORD Admin** (no la usa la app de usuario). Resuelve
quién es el que llama contra la allowlist `public.admin_usuarios` usando `auth.uid()` y
devuelve `{is_admin, rol, email}` con `rol` en `viewer|admin`. Es el punto único de
verificación que reutilizarán las 10 RPCs `fn_admin_*` de la Fase B.

Tres comportamientos verificados:
- Sin JWT (`auth.uid()` NULL) niega con `error_unauthorized` **sin** auditar, para que un
  scanner anónimo no llene `admin_audit_log` de filas inutilizables.
- identidad NO en la allowlist: audita `accion='admin_session'`, `resultado='denied'` y
  niega con `error_admin_only`. El intento fallido queda registrado a propósito.
- identidad en la allowlist: marca `ultimo_acceso_at`, audita `resultado='ok'` y devuelve la sesión.

`SECURITY DEFINER` porque lee `admin_usuarios`, que tiene RLS activado sin policies y
`REVOKE ALL` desde cliente: la tabla no es legible desde ningún frontend.
A diferencia del resto de las RPCs del proyecto, `anon` está revocado explícitamente.

Origen: `admin/sql/fase_a_admin_usuarios.sql` (decisiones ① y ③ del PRD de ORD Admin).

## Código SQL
```sql
CREATE OR REPLACE FUNCTION public.fn_admin_session()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_admin public.admin_usuarios%ROWTYPE;
BEGIN
    -- Sin identidad no hay nada que atribuir: se niega sin escribir auditoria
    -- (si no, un scanner anonimo llenaria admin_audit_log de filas basura).
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT * INTO v_admin
      FROM public.admin_usuarios
     WHERE auth_id = auth.uid()
       AND habilitado
     LIMIT 1;

    IF NOT FOUND THEN
        -- Intento negado: esto es justamente lo que se quiere poder leer despues.
        INSERT INTO public.admin_audit_log (accion, admin_caller, resultado, parametros)
        VALUES ('admin_session',
                coalesce(auth.email(), '(sin email)'),
                'denied',
                jsonb_build_object('auth_id', auth.uid()));

        RAISE EXCEPTION '{"key": "error_admin_only", "params": {}}';
    END IF;

    UPDATE public.admin_usuarios
       SET ultimo_acceso_at = now()
     WHERE admin_id = v_admin.admin_id;

    INSERT INTO public.admin_audit_log (accion, admin_caller, resultado, parametros)
    VALUES ('admin_session', v_admin.email, 'ok',
            jsonb_build_object('rol', v_admin.rol));

    RETURN jsonb_build_object(
        'is_admin', true,
        'rol',      v_admin.rol,
        'email',    v_admin.email
    );
END;
$function$
```
