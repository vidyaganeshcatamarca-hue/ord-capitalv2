-- Incidental fix: fn_borrar_datos_usuario can never complete.
--
-- Found while verifying that user deletion knows about the new loan tables.
-- Unrelated to this module, but it makes the account-deletion feature unusable.
--
-- The routine declares:
--     v_detalle json := '[]'::json;
-- and then accumulates with:
--     v_detalle := v_detalle || json_build_array(...)
--
-- PostgreSQL defines no `json || json` operator (`||` exists for jsonb only), so
-- the function raises 42883 on the FIRST table it processes. It has never worked.
-- The error is deterministic, not data-dependent.
--
-- Fix: make the accumulator jsonb and build jsonb, matching the declared return
-- type. Only that type mismatch changes; the table list, the guards and the
-- return shape stay as they are.

BEGIN;

DO $$
DECLARE
    v_oid oid;
    v_def text;
BEGIN
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario';

    v_def := pg_get_functiondef(v_oid);

    IF position('v_detalle json :=' IN v_def) = 0 THEN
        IF position('v_detalle jsonb :=' IN v_def) > 0 THEN
            RAISE NOTICE 'ya estaba corregido';
            RETURN;
        END IF;
        RAISE EXCEPTION 'no se encontro la declaracion de v_detalle; revisar a mano';
    END IF;

    v_def := replace(v_def, 'v_detalle json := ''[]''::json;', 'v_detalle jsonb := ''[]''::jsonb;');
    v_def := replace(v_def, 'json_build_array(', 'jsonb_build_array(');
    v_def := replace(v_def, 'json_build_object(', 'jsonb_build_object(');

    IF position('json_build_array(' IN v_def) > 0 OR position('json_build_object(' IN v_def) > 0 THEN
        RAISE EXCEPTION 'quedaron construcciones json sin convertir';
    END IF;

    EXECUTE v_def;
    RAISE NOTICE 'fn_borrar_datos_usuario: acumulador convertido a jsonb';
END $$;

COMMIT;
