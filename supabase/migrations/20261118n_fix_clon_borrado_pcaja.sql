-- Same 27000 as fn_borrar_datos_usuario, now inside the clone's destination wipe.
--
-- The clone's phase 1 deletes every p_caja row of the destination in ONE statement
-- while the BEFORE DELETE trigger updates p_inversiones. Two rows of the same
-- inversion make the second trigger invocation update a row the first already
-- modified in the same command, which PostgreSQL rejects. Same root cause, same
-- remedy the deletion routine already uses: one row per statement, so each trigger
-- invocation is its own command.
--
-- Accounting is preserved: the same row count reaches the audit jsonb, and the
-- existing p_estructuras_egresos trigger-window handling is untouched.

BEGIN;

DO $fix$
DECLARE
    v_oid    oid;
    v_def    text;
    v_anchor text;
BEGIN
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_clonar_usuario_admin';

    v_def := pg_get_functiondef(v_oid);

    IF position('v_cnt' IN v_def) > 0 THEN
        RAISE NOTICE 'ya estaba parcheado';
        RETURN;
    END IF;

    v_anchor := $a$        EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', v_tabla)
        USING v_user_id_destino;

        GET DIAGNOSTICS v_filas_eliminadas = ROW_COUNT;
        v_total_deletes := v_total_deletes + v_filas_eliminadas;
        v_borradas_jsonb := v_borradas_jsonb || jsonb_build_object(v_tabla, v_filas_eliminadas);$a$;

    IF position(v_anchor IN v_def) = 0 THEN
        RAISE EXCEPTION 'no se encontro el EXECUTE del borrado del destino';
    END IF;

    v_def := replace(v_def, v_anchor, $b$        -- p_caja va una fila por sentencia: sus triggers BEFORE DELETE actualizan
        -- p_inversiones, y dos filas de la misma inversion dentro de un mismo comando
        -- producen 27000. Mismo criterio que fn_borrar_datos_usuario.
        IF v_tabla = 'p_caja' THEN
            DECLARE
                v_pcaja bigint;
                v_cnt   bigint := 0;
            BEGIN
                FOR v_pcaja IN
                    SELECT pc.p_caja_id FROM public.p_caja pc
                    WHERE pc.user_id = v_user_id_destino
                    ORDER BY pc.p_caja_id
                LOOP
                    DELETE FROM public.p_caja WHERE p_caja_id = v_pcaja;
                    v_cnt := v_cnt + 1;
                END LOOP;
                v_filas_eliminadas := v_cnt;
            END;
        ELSE
            EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', v_tabla)
            USING v_user_id_destino;
            GET DIAGNOSTICS v_filas_eliminadas = ROW_COUNT;
        END IF;

        v_total_deletes := v_total_deletes + v_filas_eliminadas;
        v_borradas_jsonb := v_borradas_jsonb || jsonb_build_object(v_tabla, v_filas_eliminadas);$b$);

    EXECUTE v_def;
    RAISE NOTICE 'fn_clonar_usuario_admin: p_caja se borra fila por fila';
END $fix$;

COMMIT;
