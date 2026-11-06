# fn_desactivar_pin (pin-huella T5, deployada con OK del dueño el 2026-10-16)

```sql
-- S8: desactivar exige el PIN actual (la huella es la vía del overlay).
CREATE OR REPLACE FUNCTION public.fn_desactivar_pin(p_pin_actual text)
 RETURNS void
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

  IF NOT FOUND OR v_row.estado = 'sin_pin' OR v_row.pin_hash IS NULL THEN
    RAISE EXCEPTION '{"key":"error_pin_no_configurado","params":{}}';
  END IF;

  IF v_row.estado = 'en_cooldown' THEN
    IF v_row.bloqueado_hasta IS NOT NULL AND v_row.bloqueado_hasta <= now() THEN
      UPDATE public.p_pin_seguridad
        SET estado = 'restaurar', pin_hash = NULL, intentos_fallidos = 0,
            bloqueado_hasta = NULL
        WHERE user_id = v_user_id;
      RAISE EXCEPTION '{"key":"error_pin_nuevo_requerido","params":{}}';
    END IF;
    RAISE EXCEPTION '{"key":"error_en_cooldown","params":{"hasta":"%"}}', v_row.bloqueado_hasta::text;
  END IF;

  IF v_row.estado = 'restaurar' THEN
    RAISE EXCEPTION '{"key":"error_pin_nuevo_requerido","params":{}}';
  END IF;

  IF p_pin_actual IS NULL OR extensions.crypt(p_pin_actual, v_row.pin_hash) <> v_row.pin_hash THEN
    RAISE EXCEPTION '{"key":"error_pin_actual_incorrecto","params":{}}';
  END IF;

  DELETE FROM public.p_pin_seguridad WHERE user_id = v_user_id;
END;
$function$;
```
