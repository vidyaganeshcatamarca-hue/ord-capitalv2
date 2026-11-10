# fn_verificar_pin (pin-huella T5, deployada con OK del dueño el 2026-10-16)

Devuelve **filas** para los caminos esperados (ok / contador / estado / ventana):
un RAISE revierte el contador junto con la transacción (probado en el ensayo 74a).
Los RAISE quedan solo para maluso (NoAuth, no configurado, formato).
```sql
CREATE OR REPLACE FUNCTION public.fn_verificar_pin(p_pin text)
 RETURNS TABLE(ok boolean, intentos_fallidos integer, estado text, bloqueado_hasta timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_row public.p_pin_seguridad;
  v_intentos integer;
BEGIN
  SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key":"error_unauthorized","params":{}}';
  END IF;

  SELECT * INTO v_row FROM public.p_pin_seguridad r WHERE r.user_id = v_user_id FOR UPDATE;

  IF NOT FOUND OR v_row.estado = 'sin_pin' THEN
    RAISE EXCEPTION '{"key":"error_pin_no_configurado","params":{}}';
  END IF;

  IF v_row.estado = 'en_cooldown' THEN
    IF v_row.bloqueado_hasta IS NOT NULL AND v_row.bloqueado_hasta <= now() THEN
      -- window over while verifying: clear the PIN, ask for a new one (S7)
      UPDATE public.p_pin_seguridad
        SET estado = 'restaurar', pin_hash = NULL, intentos_fallidos = 0,
            bloqueado_hasta = NULL
        WHERE user_id = v_user_id;
      RETURN QUERY SELECT false, 0, 'restaurar'::text, NULL::timestamptz;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, v_row.intentos_fallidos, 'en_cooldown'::text, v_row.bloqueado_hasta;
    RETURN;
  END IF;

  IF v_row.estado = 'restaurar' OR v_row.pin_hash IS NULL THEN
    RETURN QUERY SELECT false, 0, 'restaurar'::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF length(p_pin) <> 4 OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION '{"key":"error_pin_formato","params":{}}';
  END IF;

  IF extensions.crypt(p_pin, v_row.pin_hash) = v_row.pin_hash THEN
    -- success: attempts forgiven (S6, the counter resets on a valid PIN)
    UPDATE public.p_pin_seguridad
      SET intentos_fallidos = 0
      WHERE user_id = v_user_id;
    RETURN QUERY SELECT true, 0, v_row.estado, v_row.bloqueado_hasta;
    RETURN;
  END IF;

  -- failure: count server-side; the 10th totals the owner's 24h lockout
  v_intentos := v_row.intentos_fallidos + 1;
  IF v_intentos >= 10 THEN
    UPDATE public.p_pin_seguridad
      SET estado = 'en_cooldown', intentos_fallidos = v_intentos,
          bloqueado_hasta = now() + interval '24 hours'
      WHERE user_id = v_user_id;
    RETURN QUERY SELECT false, v_intentos, 'en_cooldown'::text,
                        (now() + interval '24 hours')::timestamptz;
    RETURN;
  END IF;

  UPDATE public.p_pin_seguridad
    SET intentos_fallidos = v_intentos
    WHERE user_id = v_user_id;
  RETURN QUERY SELECT false, v_intentos, v_row.estado, v_row.bloqueado_hasta;
END;
$function$;
DECLARE
  v_user_id bigint;
  v_row public.p_pin_seguridad;
  v_intentos integer;
BEGIN
  SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key":"error_unauthorized","params":{}}';
  END IF;

  SELECT * INTO v_row FROM public.p_pin_seguridad r WHERE r.user_id = v_user_id FOR UPDATE;

  IF NOT FOUND OR v_row.estado = 'sin_pin' THEN
    RAISE EXCEPTION '{"key":"error_pin_no_configurado","params":{}}';
  END IF;

  IF v_row.estado = 'en_cooldown' THEN
    IF v_row.bloqueado_hasta IS NOT NULL AND v_row.bloqueado_hasta <= now() THEN
      -- ventaja vencida al verificar: limpia y pide nuevo (S7)
      UPDATE public.p_pin_seguridad
        SET estado = 'restaurar', pin_hash = NULL, intentos_fallidos = 0,
            bloqueado_hasta = NULL
        WHERE user_id = v_user_id;
      RETURN QUERY SELECT false, 0, 'restaurar'::text, NULL::timestamptz;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, v_row.intentos_fallidos, 'en_cooldown'::text, v_row.bloqueado_hasta;
    RETURN;
  END IF;

  IF v_row.estado = 'restaurar' OR v_row.pin_hash IS NULL THEN
    RETURN QUERY SELECT false, 0, 'restaurar'::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF length(p_pin) <> 4 OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION '{"key":"error_pin_formato","params":{}}';
  END IF;

  IF extensions.crypt(p_pin, v_row.pin_hash) = v_row.pin_hash THEN
    -- éxito: los intentos se perdonan (S6)
    UPDATE public.p_pin_seguridad
      SET intentos_fallidos = 0
      WHERE user_id = v_user_id;
    RETURN QUERY SELECT true, 0, v_row.estado, v_row.bloqueado_hasta;
    RETURN;
  END IF;

  -- fallo: contador server-side; el 10º dispara la ventana de 24h
  v_intentos := v_row.intentos_fallidos + 1;
  IF v_intentos >= 10 THEN
    UPDATE public.p_pin_seguridad
      SET estado = 'en_cooldown', intentos_fallidos = v_intentos,
          bloqueado_hasta = now() + interval '24 hours'
      WHERE user_id = v_user_id;
    RETURN QUERY SELECT false, v_intentos, 'en_cooldown'::text,
                        (now() + interval '24 hours')::timestamptz;
    RETURN;
  END IF;

  UPDATE public.p_pin_seguridad
    SET intentos_fallidos = v_intentos
    WHERE user_id = v_user_id;
  RETURN QUERY SELECT false, v_intentos, v_row.estado, v_row.bloqueado_hasta;
END;
$function$;
```
