-- Bounded fix: fn_borrar_datos_usuario dies on p_caja with error 27000.
--
-- Diagnosed from the live error context, not guessed:
--   ERROR 27000: tuple to be updated was already modified by an operation
--   triggered by the current command
--   CONTEXT: SQL statement "DELETE FROM public.p_caja WHERE user_id = $1"
--            PL/pgSQL function fn_borrar_datos_usuario(text) line 58 at EXECUTE
--
-- ROOT CAUSE: p_caja carries a BEFORE DELETE trigger that reverses investment
-- movements by updating p_inversiones. The routine deletes every p_caja row of the
-- user in ONE statement. When two of those rows belong to the same inversion, the
-- second trigger invocation tries to update a p_inversiones row the first one
-- already modified inside the same command, which PostgreSQL rejects.
--
-- The HINT suggests rewriting the investments trigger as AFTER, which would change
-- the investments design. This fix stays inside the deletion routine instead: p_caja
-- is deleted one row per statement. Same rows, same triggers, same order, same
-- effects; each row is simply its own command, so no row is updated twice within
-- one command.
--
-- No business rule changes. No data shape changes. Nothing destructive.

BEGIN;

DO $fix$
DECLARE
    v_oid    oid;
    v_def    text;
    v_ancla1 text;
    v_ancla2 text;
BEGIN
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario';

    v_def := pg_get_functiondef(v_oid);

    IF position('v_pcaja' IN v_def) > 0 THEN
        RAISE NOTICE 'ya estaba parcheado';
        RETURN;
    END IF;

    -- 1. Declare the cursor variable.
    v_ancla1 := $a1$    v_sql text;$a1$;
    IF position(v_ancla1 IN v_def) = 0 THEN
        RAISE EXCEPTION 'no se encontro el bloque DECLARE; revisar a mano';
    END IF;
    v_def := replace(v_def, v_ancla1, $n1$    v_sql text;
    v_pcaja bigint;$n1$);

    -- 2. Special-case p_caja before the generic bulk delete.
    v_ancla2 := $a2$    LOOP
        v_sql := 'DELETE FROM public.' || v_tabla || ' WHERE user_id = $1';$a2$;
    IF position(v_ancla2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'no se encontro el inicio del LOOP; revisar a mano';
    END IF;

    v_def := replace(v_def, v_ancla2, $n2$    LOOP
        -- p_caja va una fila por sentencia. Sus triggers BEFORE DELETE actualizan
        -- p_inversiones, y dos filas de la misma inversion dentro de un mismo
        -- comando producen 27000. El efecto es identico: mismas filas, mismos
        -- triggers, mismo orden; solo cambia el alcance de cada comando.
        IF v_tabla = 'p_caja' THEN
            v_filas := 0;
            FOR v_pcaja IN
                SELECT pc.p_caja_id FROM public.p_caja pc
                WHERE pc.user_id = v_user_id
                ORDER BY pc.p_caja_id
            LOOP
                DELETE FROM public.p_caja WHERE p_caja_id = v_pcaja;
                v_filas := v_filas + 1;
            END LOOP;
            IF v_filas > 0 THEN
                v_detalle := v_detalle || jsonb_build_array(
                    jsonb_build_object('tabla', v_tabla, 'filas', v_filas));
                v_totalFilas := v_totalFilas + v_filas::int;
            END IF;
            CONTINUE;
        END IF;

        v_sql := 'DELETE FROM public.' || v_tabla || ' WHERE user_id = $1';$n2$);

    IF position('v_pcaja' IN v_def) = 0 THEN
        RAISE EXCEPTION 'el reemplazo no se aplico';
    END IF;

    EXECUTE v_def;
    RAISE NOTICE 'fn_borrar_datos_usuario: p_caja se borra fila por fila';
END $fix$;

COMMIT;
