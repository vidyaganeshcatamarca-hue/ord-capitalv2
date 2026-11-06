# pin-huella T5 — espejos funcionesSQL (enviados al clone Personal por Engram)

Tabla **p_pin_seguridad** (hash de PIN, intentos, cooldown, estado) + 5 RPCs.
Dominio RPC-only con `auth.uid()`, RLS sin policies (FORCE no aplica: los definers
son owner). `pgcrypto` se llama cualificado `extensions.crypt/gen_salt`.

---

```sql
-- p_pin_seguridad (deployada)
CREATE TABLE IF NOT EXISTS public.p_pin_seguridad (
  pin_row_id        bigserial PRIMARY KEY,
  user_id           bigint NOT NULL UNIQUE REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
  pin_hash          text,
  estado            text NOT NULL DEFAULT 'sin_pin'
                    CHECK (estado IN ('sin_pin','activa','en_cooldown','restaurar')),
  intentos_fallidos integer NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta   timestamptz,
  pin_ultimo_cambio timestamptz
);
ALTER TABLE public.p_pin_seguridad ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_p_pin_seguridad_estado ON public.p_pin_seguridad (estado);
```

## fn_tiene_pin()
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

## fn_verificar_pin(p_pin text)
Devuelve **filas** para los caminos esperados (ok / contador / estado / ventana):
un RAISE revierte el contador junto con la transacción (probado en el ensayo 74a).
Los RAISE quedan solo para maluso (NoAuth, no configurado, formato).
```sql
CREATE OR REPLACE FUNCTION public.fn_verificar_pin(p_pin text)
 RETURNS TABLE (ok boolean, intentos_fallidos integer, estado text, bloqueado_hasta timestamptz)
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

## fn_configurar_pin(p_pin text, p_pin_actual text DEFAULT NULL)
```sql
CREATE OR REPLACE FUNCTION public.fn_configurar_pin(p_pin text, p_pin_actual text DEFAULT NULL)
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
  IF p_pin ~ '^([0-9])\1{3}$' THEN
    RAISE EXCEPTION '{"key":"error_pin_debil","params":{}}';
  END IF;

  SELECT * INTO v_row FROM public.p_pin_seguridad r WHERE r.user_id = v_user_id FOR UPDATE;
  v_row.estado := COALESCE(v_row.estado, 'sin_pin');

  IF v_row.estado = 'activa' AND v_row.pin_hash IS NOT NULL THEN
    -- S8: cambiar un PIN activo exige el actual
    IF p_pin_actual IS NULL OR extensions.crypt(p_pin_actual, v_row.pin_hash) <> v_row.pin_hash THEN
      RAISE EXCEPTION '{"key":"error_pin_actual_incorrecto","params":{}}';
    END IF;
  ELSIF v_row.estado = 'en_cooldown' THEN
    IF v_row.bloqueado_hasta IS NOT NULL AND v_row.bloqueado_hasta > now() THEN
      RAISE EXCEPTION '{"key":"error_en_cooldown","params":{"hasta":"%"}}', v_row.bloqueado_hasta::text;
    END IF;
    -- ventana vencida: el front llega a restaurar (S7)
    UPDATE public.p_pin_seguridad
      SET estado = 'restaurar', pin_hash = NULL, intentos_fallidos = 0,
          bloqueado_hasta = NULL
      WHERE user_id = v_user_id;
    SELECT * INTO v_row FROM public.p_pin_seguridad r WHERE r.user_id = v_user_id;
  END IF;
  -- 'restaurar': el PIN NUEVO no requiere el viejo (el server lo limpió)

  INSERT INTO public.p_pin_seguridad (user_id, pin_hash, estado, intentos_fallidos, bloqueado_hasta, pin_ultimo_cambio)
  VALUES (v_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 'activa', 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        estado = 'activa',
        intentos_fallidos = 0,
        bloqueado_hasta = NULL,
        pin_ultimo_cambio = now();
END;
$function$;
```

## fn_reactivar_pin()
```sql
-- S7: el desbloqueo biométrico cancela una ventana ACTIVA y deja el PIN en vigencia.
CREATE OR REPLACE FUNCTION public.fn_reactivar_pin()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
BEGIN
  SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key":"error_unauthorized","params":{}}';
  END IF;

  UPDATE public.p_pin_seguridad
    SET estado = 'activa', intentos_fallidos = 0, bloqueado_hasta = NULL
    WHERE user_id = v_user_id
      AND estado IN ('en_cooldown')
      AND (bloqueado_hasta IS NULL OR bloqueado_hasta > now());
  -- una ventana VENCIDA no se reactiva por huella sola: queda 'restaurar'.
END;
$function$;
```

## fn_desactivar_pin(p_pin_actual text)
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

## Verificación del deploy (smokes 74b, TODOS OK)
1. estructura: 5 RPCs + tabla + idx + rls `relrowsecurity` on.
2. alta → activa/0.
3. `fn_desactivar_pin('9999')` → `error_pin_actual_incorrecto`.
4. desactivar correcto → sin_pin (fila borrada).
5. cambio con actual correcto → sigue activa.
6. verificar OK `ok=true`; fallo `ok=false,intentos=1` (sin raise).
7. 9 intentos → activa/9; el **10º** → `en_cooldown` + ventana.
8. reactivar → activa/0 (ventana cancelada).
9. ventana vencida al leer → `restaurar`, hash NULL, intentos 0.
10. formato → error_pin_formato; AAAA → error_pin_debil (server-side).
