-- 20261119d_fix_guarda_pin_eliminar_cuenta.sql
--
-- S15 says "ambas bajo la misma regla": deleting the data and deleting the account share
-- one access rule. The data path got that rule in 20261119b/c. This one had none - no
-- PIN, no age check, no wait - so anyone holding an open session could archive the whole
-- account from another phone without knowing any secret. It is the more destructive of
-- the two operations, so the hole mattered more, not less.
--
-- Same rule, same order:
--   - 15 days or less      -> no PIN, no wait
--   - older, no PIN        -> error_pin_no_configurado
--   - older, PIN under 24h -> error_pin_espera_24h
--   - older, wrong PIN     -> error_pin_incorrecto
--   - older, right PIN     -> the account is scheduled, 30 days out
--
-- The archive itself is unchanged: soft delete, deleted_at 30 days ahead,
-- estado_cuenta = 'pendiente_eliminacion', and the same 'DELETE' confirmation word.

DROP FUNCTION IF EXISTS public.fn_eliminar_cuenta_usuario(text);

CREATE OR REPLACE FUNCTION public.fn_eliminar_cuenta_usuario(
    p_confirmacion_texto text,
    p_pin text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id            bigint;
    v_creado_at          timestamptz;
    v_dias               int;
    v_deleted_at         timestamptz;
    v_programmed_deletion timestamptz;
    v_pin_estado         text;
    v_pin_cambio         timestamptz;
    v_pin_ok             boolean;
BEGIN
    -- 1. Identity.
    SELECT user_id, creado_at INTO v_user_id, v_creado_at
    FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Exact confirmation word, distinct from the data reset's one.
    IF p_confirmacion_texto IS DISTINCT FROM 'DELETE' THEN
        RAISE EXCEPTION '{"key": "error_confirmation_invalid", "params": {}}';
    END IF;

    -- 3. S15, same rule as the data reset.
    v_dias := (now()::date - v_creado_at::date);
    IF v_dias > 15 THEN
        SELECT estado, pin_ultimo_cambio INTO v_pin_estado, v_pin_cambio
        FROM public.p_pin_seguridad WHERE user_id = v_user_id;

        IF v_pin_estado IS DISTINCT FROM 'activa' THEN
            RAISE EXCEPTION '{"key": "error_pin_no_configurado", "params": {}}';
        END IF;

        IF COALESCE(v_pin_cambio, '-infinity'::timestamptz) > now() - interval '24 hours' THEN
            RAISE EXCEPTION '{"key": "error_pin_espera_24h", "params": {}}';
        END IF;

        -- fn_verificar_pin RETURNS ok; it does not raise on a wrong PIN.
        SELECT f.ok INTO v_pin_ok FROM public.fn_verificar_pin(p_pin) AS f;
        IF v_pin_ok IS NOT TRUE THEN
            RAISE EXCEPTION '{"key": "error_pin_incorrecto", "params": {}}';
        END IF;
    END IF;

    -- 4. Already scheduled.
    SELECT deleted_at INTO v_deleted_at FROM public.usuarios WHERE user_id = v_user_id;
    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION '{"key": "error_account_already_scheduled", "params": {}}';
    END IF;

    -- 5. Soft delete, 30 days out.
    v_programmed_deletion := now() + INTERVAL '30 days';

    UPDATE public.usuarios
       SET deleted_at = v_programmed_deletion,
           estado_cuenta = 'pendiente_eliminacion'
     WHERE user_id = v_user_id;

    RETURN v_programmed_deletion;
END;
$function$;

COMMENT ON FUNCTION public.fn_eliminar_cuenta_usuario(text, text) IS
'Archives the account for 30 days. Past the S15 grace window it requires the security PIN, set at least 24 hours earlier, exactly like the data reset.';

GRANT EXECUTE ON FUNCTION public.fn_eliminar_cuenta_usuario(text, text)
    TO anon, authenticated, service_role;
