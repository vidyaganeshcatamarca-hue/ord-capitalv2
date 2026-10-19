# fn_configurar_pin (pin-huella T5, deployada con OK del dueño el 2026-10-16; rev.2 2026-10-19: sin regla de PIN débil)

Rev.2 (2026-10-19, OK explícito del dueño): se eliminó el rechazo
`error_pin_debil` — el PIN son exactamente 4 dígitos, sin política de fuerza
(0000/1111/9999 se aceptan). El formato y la verificación del PIN actual siguen
vigentes.

```sql
CREATE OR REPLACE FUNCTION public.fn_configurar_pin(p_pin text, p_pin_actual text DEFAULT NULL::text)
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

  IF p_pin IS NULL OR length(p_pin) <> 4 OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION '{"key":"error_pin_formato","params":{}}';
  END IF;

  SELECT * INTO v_row FROM public.p_pin_seguridad r WHERE r.user_id = v_user_id FOR UPDATE;
  v_row.estado := COALESCE(v_row.estado, 'sin_pin');

  IF v_row.estado = 'activa' AND v_row.pin_hash IS NOT NULL THEN
    -- S8: changing an active PIN requires the current one
    IF p_pin_actual IS NULL OR extensions.crypt(p_pin_actual, v_row.pin_hash) <> v_row.pin_hash THEN
      RAISE EXCEPTION '{"key":"error_pin_actual_incorrecto","params":{}}';
    END IF;
  ELSIF v_row.estado = 'en_cooldown' THEN
    IF v_row.bloqueado_hasta IS NOT NULL AND v_row.bloqueado_hasta > now() THEN
      RAISE EXCEPTION '{"key":"error_en_cooldown","params":{"hasta":"%"}}', v_row.bloqueado_hasta::text;
    END IF;
    -- expired window: flow relayed by front to 'restaurar' (S7)
    UPDATE public.p_pin_seguridad
      SET estado = 'restaurar', pin_hash = NULL, intentos_fallidos = 0,
          bloqueado_hasta = NULL
      WHERE user_id = v_user_id;
    SELECT * INTO v_row FROM public.p_pin_seguridad r WHERE r.user_id = v_user_id;
  END IF;
  -- 'restaurar': save the NEW pin without the old (server already cleared it)

  INSERT INTO public.p_pin_seguridad (user_id, pin_hash, estado, intentos_fallidos, bloqueado_hasta, pin_ultimo_cambio)
  VALUES (v_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 'activa', 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        estado = 'activa',
        intentos_fallidos = 0,
        bloqueado_hasta = NULL,
        pin_ultimo_cambio = now();
END;
$function$
```
