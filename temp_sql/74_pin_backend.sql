-- 74: PIN security backend (feature: pin-huella, T5) — trial-then-real deploy pattern (73b).
-- Owner-authorized SQL delivery for the app-lock feature (odd/tasks/pin-huella.md, S3/S6/S7/S9).
-- Conventions: p_ table, SECURITY DEFINER with search_path 'public', error JSON keys,
-- user resolution public.usuarios.auth_id = auth.uid() → user_id bigint.

-- 1) dedicate security table (PIN hash never lives in p_preferencias_usuario)
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

-- Locking policy: RLS on, no direct policies. This table is only touched by
-- the SECURITY DEFINER RPCs below, which resolve the owner via auth.uid().
ALTER TABLE public.p_pin_seguridad ENABLE ROW LEVEL SECURITY;

-- Owner index word: state-driven queries arrive from the lock screen on cold
-- start; hashing lookups go through the PK. Small, keeps the state scan O(1).
CREATE INDEX IF NOT EXISTS idx_p_pin_seguridad_estado
  ON public.p_pin_seguridad (estado);

-- 2) RPCs (exact names frozen in src/contexts/AppLockContext.tsx)

-- 2a) estado — the lock screen's pull. Self-heals an expired cooldown into
-- 'restaurar' (server clears the PIN; the app asks for a new one, S7).
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

  -- Self-heal (S7): an expired window clears the PIN for this read.
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

DROP FUNCTION IF EXISTS public.fn_verificar_pin(text);

-- 2b) verify — checks the PIN (bcrypt via crypt) and counts failures
-- server-side (S6). RETURNS the outcome instead of raising: an attempt-failure
-- update must SURVIVE the errored call, and a raised error rolls the counter
-- back with the transaction (proven by smoke 6b/c in trial 74b).
-- Expected outcomes are returned as rows; exceptions stay for misuse
-- (unauthenticated, no pin, bad format).
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

-- 2c) configure — accepts a NEW pin (S7 path after 'restaurar' or sin_pin),
-- or a CHANGE over the current one (S8). Enforces 4 distinct-enough digits.
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
$function$;

-- 2d) reactivate — biometric unlock cancels an active window and leaves the
-- PIN in force (owner rule S7: "la huella puede reactivar el pin").
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
  -- an expired window is NOT restorable by biometry alone: it stays 'restaurar'
  -- until the owner defines a new PIN (S7).
END;
$function$;

-- 2e) disable — S8: quitting requires the current PIN (stored server-side).
-- The alternative biometric unlock happens at the lock overlay (device side);
-- server-side this RPC demands the correct current PIN.
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