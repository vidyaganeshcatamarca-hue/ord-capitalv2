# fn_tiene_pin (pin-huella T5, deployada con OK del dueño el 2026-10-16)

```sql
CREATE OR REPLACE FUNCTION public.fn_tiene_pin()
 RETURNS TABLE (estado text, bloqueado_hasta timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_row public.p_pin_seguridad;
BEGIN
  SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key":"error_unauthorized","params":{}}';
  END IF;

  SELECT * INTO v_row FROM public.p_pin_seguridad r WHERE r.user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'sin_pin'::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Self-heal (S7): la ventana vencida limpia el PIN y entra en restaurar.
  IF v_row.estado = 'en_cooldown' AND v_row.bloqueado_hasta IS NOT NULL AND v_row.bloqueado_hasta <= now() THEN
    UPDATE public.p_pin_seguridad
      SET estado = 'restaurar', pin_hash = NULL, intentos_fallidos = 0,
          bloqueado_hasta = NULL
      WHERE user_id = v_user_id;
    v_row.estado := 'restaurar';
    v_row.bloqueado_hasta := NULL;
  END IF;

  RETURN QUERY SELECT v_row.estado, v_row.bloqueado_hasta;
END;
$function$;
```
