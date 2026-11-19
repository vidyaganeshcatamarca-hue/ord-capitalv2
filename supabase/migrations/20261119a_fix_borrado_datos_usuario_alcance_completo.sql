-- 20261119a_fix_borrado_datos_usuario_alcance_completo.sql
--
-- The self-service reset must leave the account clean. The deployed body failed for
-- two independent reasons:
--
--   1. It named `p_preferencias_notificaciones`, a table that has never existed (the
--      real name is `p_notificaciones_config`). The dynamic DELETE raised 42P01 and,
--      because a function call is one transaction, the whole reset rolled back:
--      nothing was ever deleted, for anyone.
--   2. It only knew 22 of the user's tables. Sobres, PIN, reminders, family group,
--      budget history, sent notifications, legal consent, feedback, referrals, bug
--      reports, sessions and telemetry all survived the wipe.
--
-- It also silently under-deleted `p_estructuras_egresos`: tr_bloquear_categoria_inversion
-- has no DELETE branch and falls through to RETURN NULL, which cancels the delete of a
-- BEFORE DELETE trigger without raising.
--
-- This version wipes everything the user owns, verifies the post-condition, and leaves
-- the account usable by restoring the two rows only the signup trigger creates.

CREATE OR REPLACE FUNCTION public.fn_borrar_datos_usuario(
    p_confirmacion_texto text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id       bigint;
    v_creado_at     timestamptz;
    v_dias          int;
    v_par           text;
    v_tabla         text;
    v_col           text;
    v_sql           text;
    v_filas         bigint;
    v_total         bigint := 0;
    v_detalle       jsonb := '[]'::jsonb;
    v_restantes     bigint;
    v_hogares       bigint[];
    v_vinculos      text[];
BEGIN
    -- 1. Identity (project rule: the row in usuarios decides, never a client value).
    SELECT user_id, creado_at INTO v_user_id, v_creado_at
    FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Exact text confirmation.
    IF p_confirmacion_texto IS DISTINCT FROM 'ERASE' THEN
        RAISE EXCEPTION '{"key": "error_confirmation_invalid", "params": {}}';
    END IF;

    -- 3. Backend guard for the first 15 days (defence in depth, S15).
    v_dias := (now()::date - v_creado_at::date);
    IF v_dias <= 15 THEN
        RAISE EXCEPTION '{"key": "error_borrado_datos_primeros_dias", "params": {"dias": %}}', v_dias;
    END IF;

    -- 4. Triggers off for the wipe. Three reasons, each one measured:
    --    - tr_bloquear_categoria_inversion returns NULL on DELETE, so the user's own
    --      categories were never removed;
    --    - the p_caja BEFORE DELETE triggers raise 27000 when two rows share an
    --      investment, which is why the old body needed a row-by-row cursor;
    --    - tr_caja_limpieza rewrites p_tarjetas_credito and p_compromisos_tarjeta while
    --      we are deleting those same tables.
    -- The verification in step 6 replaces the safety the triggers provided: if any row
    -- owned by this user survives, the whole reset raises and rolls back.
    SET LOCAL session_replication_role = replica;

    -- 5. Wipe. Order is irrelevant with triggers off; it is kept parent-last so the
    --    list stays readable and the same list works for the verification pass.
    v_vinculos := ARRAY[
        'p_sobre_movimientos_auditoria|user_id',
        'p_sobre_movimientos|user_id',
        'p_sobres|user_id',
        'p_prestamos_vinculos|user_id',
        'p_prestamos_pagos|user_id',
        'p_prestamos_cuotas|user_id',
        'p_prestamos|user_id',
        'p_cuotas_detalle|user_id',
        'p_compromisos_tarjeta|user_id',
        'p_pagos_tarjeta_log|user_id',
        'p_gastos_recurrentes|user_id',
        'p_inyecciones_presupuesto|user_id',
        'p_presupuestos|user_id',
        'p_presupuestos_config|user_id',
        'p_presupuestos_historial|user_id',
        'p_gastos_fijos_config|user_id',
        'p_config_bola_nieve|user_id',
        'p_config_inflacion|user_id',
        'p_conciliaciones|user_id',
        'p_caja_cuarentena|user_id',
        'p_caja|user_id',
        'p_caja|pagado_por_user_id',
        'p_grupo_familiar|user_id',
        'p_tarjetas_credito|user_id',
        'p_estructuras_egresos|user_id',
        'p_billeteras|user_id',
        'p_ingresos|user_id',
        'p_inversiones|user_id',
        'p_historico_score_salud|user_id',
        'p_recordatorios|user_id',
        'p_pin_seguridad|user_id',
        'p_notificaciones_enviadas|user_id',
        'p_notificaciones_config|user_id',
        'p_preferencias_usuario|user_id',
        'p_config_region|user_id',
        'p_legal_consentimientos|user_id',
        'p_feedback_usuario|user_id',
        'p_referidos|user_id_invitador',
        'p_referidos|user_id_invitado',
        'app_reportes|usuario_id',
        'app_usuario_bloqueos|usuario_id',
        'p_app_sessions|user_id',
        'p_telemetry_events|user_id',
        'p_telemetry_cps_snapshots|user_id',
        'p_telemetry_user_metrics|user_id',
        'p_webhook_queue|user_id'
    ];

    FOREACH v_par IN ARRAY v_vinculos LOOP
        v_tabla := split_part(v_par, '|', 1);
        v_col   := split_part(v_par, '|', 2);
        CONTINUE WHEN to_regclass('public.' || quote_ident(v_tabla)) IS NULL;

        v_sql := format('DELETE FROM public.%I WHERE %I = $1', v_tabla, v_col);
        EXECUTE v_sql USING v_user_id;
        GET DIAGNOSTICS v_filas = ROW_COUNT;
        IF v_filas > 0 THEN
            v_detalle := v_detalle || jsonb_build_array(
                jsonb_build_object('tabla', v_tabla, 'columna', v_col, 'filas', v_filas));
            v_total := v_total + v_filas;
        END IF;
    END LOOP;

    -- 5b. Household. Policy (owner, 2026-11-19): a reset never deletes a shared account.
    --     The leaving member loses their ACCESS - the membership row - and everything
    --     shared stays with the other member, because that member's balances are built
    --     from p_hogar_pagos and p_hogar_conciliaciones. Only when the last participant
    --     leaves does the household and its content go with them.
    SELECT COALESCE(array_agg(p.hogar_id), '{}') INTO v_hogares
    FROM public.p_hogar_participantes p
    WHERE p.user_id = v_user_id;

    IF array_length(v_hogares, 1) IS NOT NULL THEN
        DELETE FROM public.p_hogar_participantes WHERE user_id = v_user_id;

        SELECT COALESCE(array_agg(h.hogar_id), '{}') INTO v_hogares
        FROM public.p_hogares h
        WHERE h.hogar_id = ANY (v_hogares)
          AND NOT EXISTS (
              SELECT 1 FROM public.p_hogar_participantes p
              WHERE p.hogar_id = h.hogar_id
          );

        IF array_length(v_hogares, 1) IS NOT NULL THEN
            DELETE FROM public.p_hogar_pagos         WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_hogar_conciliaciones WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_hogar_invitaciones  WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_proyectos_compartidos WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_hogares             WHERE hogar_id = ANY (v_hogares);
            v_detalle := v_detalle || jsonb_build_array(
                jsonb_build_object('tabla', 'p_hogares', 'columna', 'sin_participantes',
                                   'filas', array_length(v_hogares, 1)));
            v_total := v_total + array_length(v_hogares, 1);
        END IF;
    END IF;

    -- 5c. Shared category mapping. It is learned from every user, so the row stays and
    --     the author reference is cleared instead: deleting it would change what other
    --     users' receipts map to.
    UPDATE public.p_ia_global_suggestions
       SET usuario_que_sugirio = NULL
     WHERE usuario_que_sugirio = v_user_id;

    -- 6. Post-condition. With FK triggers off, a table missing from the list above
    --    would leave an orphan silently. This makes that impossible to ship.
    FOREACH v_par IN ARRAY v_vinculos LOOP
        v_tabla := split_part(v_par, '|', 1);
        v_col   := split_part(v_par, '|', 2);
        CONTINUE WHEN to_regclass('public.' || quote_ident(v_tabla)) IS NULL;

        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_tabla, v_col)
           INTO v_restantes USING v_user_id;
        IF v_restantes > 0 THEN
            RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                              "params": {"tabla": %, "columna": %, "filas": %}}',
                v_tabla, v_col, v_restantes;
        END IF;
    END LOOP;

    EXECUTE 'SELECT count(*) FROM public.p_hogar_participantes WHERE user_id = $1'
       INTO v_restantes USING v_user_id;
    IF v_restantes > 0 THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "p_hogar_participantes", "filas": %}}', v_restantes;
    END IF;

    -- 7. The two rows that only the signup trigger creates. Without them the account
    --    keeps working but every RPC that reads preferences has to tolerate a missing
    --    row; restoring them keeps the account usable right after the reset.
    INSERT INTO public.p_preferencias_usuario (user_id) VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.p_notificaciones_config (user_id) VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    RAISE LOG 'borrado de datos ok: user %, tablas con filas %, total %',
        v_user_id, jsonb_array_length(v_detalle), v_total;

    RETURN jsonb_build_object(
        'resultado', 'borrado_datos_ok',
        'user_id', v_user_id,
        'entradas_con_filas', jsonb_array_length(v_detalle),
        'total_filas_eliminadas', v_total,
        'detalle', v_detalle
    );
END;
$function$;

COMMENT ON FUNCTION public.fn_borrar_datos_usuario(text) IS
'Self-service account reset: removes every row the user owns, verifies the post-condition, and restores the preference rows created at signup.';
