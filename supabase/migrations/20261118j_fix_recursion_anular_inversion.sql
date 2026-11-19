-- Bounded fix: recursion in fn_tr_anular_inversion_al_borrar_movimiento.
--
-- Found while running fn_borrar_datos_usuario, which deletes every p_caja row of a
-- user in one statement.
--
-- ROOT CAUSE (not a guess): the trigger ends by cascading a delete over the other
-- movements that share the same inversion_id:
--
--     DELETE FROM public.p_caja
--     WHERE user_id = OLD.user_id
--       AND metadata->>'inversion_id' = v_inversion_id
--       AND p_caja_id <> OLD.p_caja_id;
--
-- That DELETE fires the same BEFORE DELETE trigger once per matched row. With a
-- single investment_prefix row the nested statement only reaches derived rows
-- (rescate / liquidacion / aporte), which return early, so it terminates. With TWO
-- OR MORE investment_prefix rows sharing an inversion_id the two invocations keep
-- matching each other: the exclusion `p_caja_id <> OLD.p_caja_id` only removes one
-- id, and the other row is still visible to the nested statement's snapshot. The
-- result is unbounded mutual recursion and a 54001 stack-depth error.
--
-- FIX: let only the outermost invocation propagate the delete, using
-- pg_trigger_depth(). Nested invocations still perform their own per-row reversal
-- (contribution, withdrawal) because those branches return before reaching this
-- point; they simply stop re-entering the cascade.
--
-- Business rules are untouched: the same rows are deleted, in the same order, for
-- the same reasons. Only the re-entry is cut.

BEGIN;

DO $$
DECLARE
    v_oid  oid;
    v_def  text;
    v_ancla text := '    DELETE FROM public.p_caja
    WHERE user_id = OLD.user_id
      AND metadata->>''inversion_id'' = v_inversion_id
      AND p_caja_id <> OLD.p_caja_id;';
    v_nuevo text := '    -- Solo la invocacion externa propaga el borrado. Un DELETE anidado vuelve a
    -- disparar este trigger: sin esta guarda, dos movimientos de alta que comparten
    -- inversion_id se borran mutuamente para siempre y el stack se agota (54001).
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;

    DELETE FROM public.p_caja
    WHERE user_id = OLD.user_id
      AND metadata->>''inversion_id'' = v_inversion_id
      AND p_caja_id <> OLD.p_caja_id;';
BEGIN
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_tr_anular_inversion_al_borrar_movimiento';

    v_def := pg_get_functiondef(v_oid);

    IF position('pg_trigger_depth()' IN v_def) > 0 THEN
        RAISE NOTICE 'ya estaba protegido';
        RETURN;
    END IF;

    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'no se encontro el DELETE en cascada; revisar a mano, no adivinar';
    END IF;

    v_def := replace(v_def, v_ancla, v_nuevo);

    IF position('pg_trigger_depth()' IN v_def) = 0 THEN
        RAISE EXCEPTION 'el reemplazo no se aplico';
    END IF;

    EXECUTE v_def;
    RAISE NOTICE 'guardia de profundidad agregada';
END $$;

COMMIT;
