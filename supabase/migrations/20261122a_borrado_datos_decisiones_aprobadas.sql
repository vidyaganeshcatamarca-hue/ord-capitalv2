-- 20261122a_borrado_datos_decisiones_aprobadas.sql
--
-- Owner decisions on the self-service data reset, chapter 5 of the closure diagnosis.
-- Everything below is a decision already taken, not a proposal. Each one is implemented
-- as an anchor-patched replacement of the deployed body, so the guard is that the body
-- keeps working exactly as it did everywhere else.
--
-- C1 - p_presupuestos_cierre enters the wipe. It is the only table in the whole universe
--      with no referential constraint at all (PRIMARY KEY (cierre_id) and nothing else),
--      which is why nothing ever removed it and nothing ever noticed: 7 rows belonging to
--      1 user survived a reset that answered borrado_datos_ok. It is deleted by user_id
--      and it is now inside the verification, because the verification is derived from
--      the catalog.
--
-- C3 - p_legal_consentimientos stops being deleted. 315 rows over 80 users were being
--      destroyed on every reset. The routine no longer touches them, and the
--      post-condition now asserts they are still there, row by row, by id.
--
-- C4 - app_reportes stops being deleted. The reports, their photos, their audio and their
--      Storage files are conserved. Measured: `app_reportes.usuario_id` is NOT NULL and
--      has NO foreign key in the catalog today (only the primary key plus three CHECK
--      constraints), so keeping the row with its usuario_id intact breaks nothing and
--      nothing had to be relaxed. The column is not nulled and not anonymised: the
--      decision is to keep the record whole.
--
-- C7 - p_feedback_usuario is conserved anonymised. `user_id` is set to NULL (the column is
--      nullable and its FK is ON DELETE CASCADE, so no constraint objects). `metadata` is
--      a free-form bag written by the client and cannot be audited key by key, so it is
--      replaced by an explicit marker that states what is and is not verified. `mensaje`
--      is the user's own prose: an e-mail address is removed by rule, and the row records
--      that the rest of the text was NOT verified. Residual identifiers that survive and
--      cannot be removed reliably are listed in the delivery report.
--
-- C8 - p_referidos is conserved anonymised. Measured before writing this: both columns are
--      FOREIGN KEY ... ON DELETE CASCADE to usuarios, and `user_id_invitador` is NOT NULL.
--      So SET NULL does not reach the inviter: the column cannot hold NULL at all. The
--      invited side (`user_id_invitado`, nullable) is cleared together with the address
--      the inviter typed, and the row stays because it is the proof of the inviter's
--      benefit. The remaining reference to the inviter is logged by the routine and is
--      reported as an open item: clearing it needs `ALTER COLUMN ... DROP NOT NULL`, which
--      is a schema decision and not taken here.
--
-- C9 - the post-condition stops being a hand-written list. It is derived from the catalog:
--      every base table of `public` carrying a user reference - a column named user_id or
--      usuario_id with any prefix, or any column that is a FOREIGN KEY to usuarios - must
--      come out empty, except for an explicit list of approved exceptions. A new table
--      belongs to neither group, so it aborts the whole reset instead of passing in
--      silence. That is the entire point: the silence was the bug.
--
-- NOT in this migration: C5, transferring co-owned elements to the member who stays. The
-- owner forbade mass user_id substitutions, and the model does not represent household
-- ownership on its own (ownership is `user_id`; `hogar_id IS NOT NULL` marks co-ownership
-- but the read layer of every module except loans still filters by `user_id`). The one
-- column that would need that transfer, `p_prestamos.contraparte_user_id`, is declared as
-- an explicit exception so the new verification does not pretend it was handled.
--
-- Also untouched, on purpose: the PIN guard, the 24 hour wait, and
-- fn_eliminar_cuenta_usuario.
BEGIN;

-- The deployed bodies are read with pg_get_functiondef, their CRLF endings normalised to
-- LF, and each anchor replaced only if it appears exactly the expected number of times.
-- A missing or duplicated anchor aborts the whole migration, so a silent no-op is
-- impossible. The signature is untouched, so CREATE OR REPLACE keeps the OID, the
-- owner, the ACL and the comment.

CREATE OR REPLACE FUNCTION pg_temp.reemplazo(
    p_def       text,
    p_ancla     text,
    p_nuevo     text,
    p_esperados integer,
    p_ctx       text
) RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
    v_n integer;
BEGIN
    v_n := (length(p_def) - length(replace(p_def, p_ancla, ''))) / length(p_ancla);
    IF v_n <> p_esperados THEN
        RAISE EXCEPTION '%: el ancla aparece % veces y se esperaban % --> %',
            p_ctx, v_n, p_esperados, p_ancla;
    END IF;
    RETURN replace(p_def, p_ancla, p_nuevo);
END;
$f$;

CREATE TEMP TABLE _t_ancla (
    etiqueta  text,
    ancla     text,
    nuevo     text,
    esperados integer
) ON COMMIT DROP;

-- Anchors. a0: identity read. a1: DECLARE tail. a2: the comment that opens the trigger
-- block, where the snapshot of what must survive is inserted before it. a3: the wipe
-- list plus its comment. a4: the whole hand-written post-condition, replaced by the
-- catalog-derived one.
INSERT INTO _t_ancla (etiqueta, ancla, nuevo, esperados) VALUES

('a0', $a0$
    SELECT user_id, creado_at INTO v_user_id, v_creado_at
    FROM public.usuarios WHERE auth_id = auth.uid();
$a0$,
 $a0nuevo$
    SELECT user_id, creado_at, email, telefono
      INTO v_user_id, v_creado_at, v_email, v_telefono
    FROM public.usuarios WHERE auth_id = auth.uid();
$a0nuevo$, 1),

('a1', $a1$
    v_hogares       bigint[];
    v_vinculos      text[];
BEGIN
$a1$,
 $a1nuevo$
    v_hogares       bigint[];
    v_vinculos      text[];
    -- C9: the verification universe is read from the catalog, not from the list above.
    v_universo        text[];
    v_excepciones     text[];
    v_excepciones_col text[];
    v_borradas        text[];
    -- Snapshots of the rows that now survive on purpose (C3, C4, C7, C8), plus the user's
    -- own contact details, which are the identifiers the anonymisation has to remove.
    v_email           text;
    v_telefono        text;
    v_legal_ids       bigint[];
    v_legal_antes     bigint;
    v_reportes_ids    bigint[];
    v_reportes_antes  bigint;
    v_feedback_ids    bigint[];
    v_feedback_antes  bigint;
    v_referido_ids    bigint[];
    v_referido_antes  bigint;
    v_referido_ligado bigint;
    v_faltan          bigint;
BEGIN
$a1nuevo$, 1),

('a2', $a2$
    -- 4. Triggers off for the wipe. Three reasons, each one measured:
$a2$,
 $a2nuevo$
    -- 3b. Snapshot of what must survive, taken before anything is deleted so that a
    --     cascade reaching these tables one day cannot hide behind "it was already
    --     empty". Step numbering is left as it was: the anchors of this migration stay
    --     small, and every other comment keeps pointing at the same place.
    --
    --     Conserved whole (owner, C3 and C4): the legal consent records and the reports
    --     with their media. Conserved anonymised (owner, C7 and C8): the feedback and the
    --     referrals.
    SELECT COALESCE(array_agg(l.id ORDER BY l.id), '{}'), count(*)
      INTO v_legal_ids, v_legal_antes
      FROM public.p_legal_consentimientos l
     WHERE l.user_id = v_user_id;

    SELECT COALESCE(array_agg(r.reporte_id ORDER BY r.reporte_id), '{}'), count(*)
      INTO v_reportes_ids, v_reportes_antes
      FROM public.app_reportes r
     WHERE r.usuario_id = v_user_id;

    SELECT COALESCE(array_agg(f.feedback_id ORDER BY f.feedback_id), '{}'), count(*)
      INTO v_feedback_ids, v_feedback_antes
      FROM public.p_feedback_usuario f
     WHERE f.user_id = v_user_id;

    SELECT COALESCE(array_agg(x.referido_id ORDER BY x.referido_id), '{}'), count(*)
      INTO v_referido_ids, v_referido_antes
      FROM public.p_referidos x
     WHERE x.user_id_invitado = v_user_id
        OR x.user_id_invitador = v_user_id;

    -- 4. Triggers off for the wipe. Three reasons, each one measured:
$a2nuevo$, 1),

('a3', $a3$
    -- 5. Wipe. Order is irrelevant with triggers off; it is kept parent-last so the list
    --    stays readable and doubles as the verification list.
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
$a3$,
 $a3nuevo$
    -- 5. Wipe. Order is irrelevant with triggers off; it is kept parent-last so the list
    --    stays readable and doubles as the diagnosis list in step 6b.
    --
    --    Owner decisions of 2026-11-22 moved four groups of rows out of this list:
    --      - p_presupuestos_cierre is NEW here (C1). It carries no foreign key at all,
    --        which is why nothing removed it and nothing noticed: seven of the user's
    --        closes survived a reset that answered borrado_datos_ok.
    --      - p_legal_consentimientos is GONE (C3): consent records are conserved whole.
    --      - app_reportes is GONE (C4): the reports and their media are conserved whole.
    --      - p_feedback_usuario and p_referidos are GONE (C7, C8): they are conserved
    --        anonymised in step 6.
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
        'p_presupuestos_cierre|user_id',
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
        'app_usuario_bloqueos|usuario_id',
        'p_app_sessions|user_id',
        'p_telemetry_events|user_id',
        'p_telemetry_cps_snapshots|user_id',
        'p_telemetry_user_metrics|user_id',
        'p_webhook_queue|user_id'
    ];
$a3nuevo$, 1),

('a4', $a4$
    -- 6. Post-condition. With FK triggers off, a table missing from the list above would
    --    leave an orphan silently. This makes that impossible to ship.
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
$a4$,
 $a4nuevo$
    -- 6. Rows that survive on purpose. Each one is updated and then verified, because
    --    "I did not delete it" is not the same as "it is still the same row".
    --
    --    C7 - p_feedback_usuario. `user_id` is the only column that points at the author.
    --    `metadata` is a free-form bag the client fills - device, version, account,
    --    screen - so it cannot be audited key by key: it is replaced by an explicit
    --    marker instead of being left in place. `mensaje` is the user's own prose; an
    --    e-mail address is unambiguous and is removed by rule, but a name, a phone number
    --    written differently, or the story itself cannot be detected reliably. The row
    --    therefore says so out loud - metadata.free_text_verified = false - instead of
    --    pretending to be anonymous.
    UPDATE public.p_feedback_usuario
       SET user_id  = NULL,
           metadata = jsonb_build_object(
                          'anonymised_by_data_reset', true,
                          'free_text_verified', false),
           mensaje  = regexp_replace(
                          regexp_replace(
                              mensaje,
                              '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}',
                              '[email]', 'g'),
                          '\+?[0-9][0-9 ()-]{6,}[0-9]',
                          '[phone]', 'g')
     WHERE feedback_id = ANY (v_feedback_ids);

    --    C8 - p_referidos. The invited side is the resetting user, so their id and the
    --    e-mail the inviter typed go. The row stays, with its code, its flags and its
    --    dates, because it is the proof of the inviter's benefit and of whatever was
    --    already granted; deleting it would damage a third party's rights.
    --
    --    user_id_invitador CANNOT be cleared here: the column is NOT NULL and its foreign
    --    key is ON DELETE CASCADE, so SET NULL is not even representable. The residual
    --    reference is logged and reported as an open item, never hidden: removing it
    --    needs the column to become nullable, which is a DDL decision of the owner.
    UPDATE public.p_referidos
       SET user_id_invitado = NULL,
           email_invitado   = NULL
     WHERE referido_id = ANY (v_referido_ids)
       AND (user_id_invitado = v_user_id
            OR (v_email IS NOT NULL AND lower(email_invitado) = lower(v_email)));

    -- 6b. Post-condition, derived from the catalog (C9). A hand-written list cannot
    --     notice a table nobody wrote down, and that is exactly how seven rows of
    --     p_presupuestos_cierre survived a reset that answered borrado_datos_ok. The
    --     universe is every base table carrying a user reference: a column named user_id
    --     or usuario_id - with any prefix, like pagado_por_user_id - or any column that
    --     is a foreign key to usuarios. The approved exceptions are named right below,
    --     so a NEW table belongs to neither group and aborts the reset. Failing loudly is
    --     the point: the silence was the bug.
    v_excepciones := ARRAY[
        -- Books of the mother app, declared out of scope (owner, chapter 5).
        'caja',
        'cuentas_egresos',
        'productos',
        'vendedores',
        -- Administrative accountability: who did what is the admin record, not user data.
        'admin_audit_log',
        'admin_clone_destinos_permitidos',
        -- Identity root. The reset wipes data; the account itself stays.
        'usuarios',
        -- Conserved whole (owner, C3 and C4).
        'p_legal_consentimientos',
        'app_reportes',
        -- Conserved anonymised (owner, C7 and C8) or already anonymous (C9).
        'p_feedback_usuario',
        'p_referidos',
        'p_ia_global_suggestions',
        -- Shared household objects. The row belongs to the member who stays: the leaving
        -- member loses access, not the other member's balances (owner policy 2026-11-19,
        -- implemented in step 5b). p_hogar_participantes is NOT here on purpose: that
        -- membership row is deleted always, and the catalog check below proves it.
        'p_hogar_pagos',
        'p_hogar_conciliaciones',
        'p_hogar_invitaciones'
    ];

    -- A column, not a table. Another member's loan can point at this user as its
    -- counterparty; clearing it would erase who owes whom on a loan that is not the
    -- leaving user's. Co-owned elements have to be transferred to the member who stays,
    -- which is C5 and is still open, so this one column keeps the reference for now.
    v_excepciones_col := ARRAY['p_prestamos|contraparte_user_id'];

    SELECT COALESCE(array_agg(s.u ORDER BY s.u), '{}') INTO v_universo
    FROM (
        SELECT c.relname::text || '|' || a.attname::text AS u
        FROM pg_class c
        JOIN pg_attribute a
          ON a.attrelid = c.oid
         AND a.attnum > 0
         AND NOT a.attisdropped
        WHERE c.relnamespace = 'public'::regnamespace
          AND c.relkind IN ('r', 'p')
          AND (
              a.attname::text ~ '(^|_)(user_id|usuario_id)(_|$)'
              OR EXISTS (
                  SELECT 1
                  FROM pg_constraint k
                  WHERE k.contype = 'f'
                    AND k.conrelid = c.oid
                    AND k.confrelid = 'public.usuarios'::regclass
                    AND a.attnum = ANY (k.conkey)
              )
          )
    ) s;

    -- The catalog read has to see at least everything the wipe list names. If it does
    -- not, the verification itself is broken and must not pass.
    SELECT count(*) INTO v_faltan
    FROM unnest(v_vinculos) AS t(w)
    WHERE to_regclass('public.' || quote_ident(split_part(t.w, '|', 1))) IS NOT NULL
      AND NOT (t.w = ANY (v_universo));
    IF v_faltan > 0 OR cardinality(v_universo) = 0 THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "catalog", "columna": "universe", "filas": %}}',
            v_faltan;
    END IF;

    v_borradas := ARRAY(
        SELECT u
        FROM unnest(v_universo) AS t(u)
        WHERE split_part(t.u, '|', 1) <> ALL (v_excepciones)
          AND NOT (t.u = ANY (v_excepciones_col))
        ORDER BY t.u
    );

    FOREACH v_par IN ARRAY v_borradas LOOP
        v_tabla := split_part(v_par, '|', 1);
        v_col   := split_part(v_par, '|', 2);

        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_tabla, v_col)
           INTO v_restantes USING v_user_id;
        IF v_restantes > 0 THEN
            RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                              "params": {"tabla": %, "columna": %, "filas": %}}',
                v_tabla, v_col, v_restantes;
        END IF;
    END LOOP;

    -- C3 and C4: the consent records and the reports are still there, row by row, with
    -- exactly the ids that existed before the reset.
    SELECT count(*) INTO v_faltan
    FROM unnest(v_legal_ids) AS t(id)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.p_legal_consentimientos l WHERE l.id = t.id);
    IF v_faltan > 0 THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "p_legal_consentimientos", "columna": "conserved", "filas": %}}',
            v_faltan;
    END IF;

    SELECT count(*) INTO v_faltan
    FROM unnest(v_reportes_ids) AS t(id)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.app_reportes r WHERE r.reporte_id = t.id);
    IF v_faltan > 0 THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "app_reportes", "columna": "conserved", "filas": %}}',
            v_faltan;
    END IF;

    -- C7: nothing left in the kept feedback rows identifies the author. The two patterns
    -- are the same ones the UPDATE applied; keep them in step.
    SELECT count(*) INTO v_faltan
    FROM public.p_feedback_usuario f
    WHERE f.feedback_id = ANY (v_feedback_ids)
      AND (
          f.user_id IS NOT NULL
          OR f.metadata->>'anonymised_by_data_reset' IS DISTINCT FROM 'true'
          OR f.metadata->>'free_text_verified' IS DISTINCT FROM 'false'
          OR f.mensaje ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
          OR f.mensaje ~ '\+?[0-9][0-9 ()-]{6,}[0-9]'
      );
    IF v_faltan > 0 THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "p_feedback_usuario", "columna": "user_id", "filas": %}}',
            v_faltan;
    END IF;

    -- C8: every kept referral is still there, and the invited side carries neither the id
    -- nor the address of the user who reset.
    SELECT count(*) INTO v_faltan
    FROM unnest(v_referido_ids) AS t(id)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.p_referidos x WHERE x.referido_id = t.id);
    IF v_faltan > 0 THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "p_referidos", "columna": "conserved", "filas": %}}',
            v_faltan;
    END IF;

    SELECT count(*) INTO v_faltan
    FROM public.p_referidos x
    WHERE x.referido_id = ANY (v_referido_ids)
      AND (
          x.user_id_invitado = v_user_id
          OR (v_email IS NOT NULL AND lower(x.email_invitado) = lower(v_email))
      );
    IF v_faltan > 0 THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "p_referidos", "columna": "user_id_invitado", "filas": %}}',
            v_faltan;
    END IF;

    -- C9: the shared category mapping keeps its row and loses the author.
    SELECT count(*) INTO v_faltan
    FROM public.p_ia_global_suggestions
    WHERE usuario_que_sugirio = v_user_id;
    IF v_faltan > 0 THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "p_ia_global_suggestions", "columna": "usuario_que_sugirio", "filas": %}}',
            v_faltan;
    END IF;

    -- What the reset kept on purpose, and the one reference it cannot clear yet.
    SELECT count(*) INTO v_referido_ligado
    FROM public.p_referidos
    WHERE user_id_invitador = v_user_id;
    IF v_referido_ligado > 0 THEN
        RAISE LOG 'referidos conservados con el id del invitador: user %, filas % (columna NOT NULL, C8 abierto)',
            v_user_id, v_referido_ligado;
    END IF;

    RAISE LOG 'conservadas sin borrar: legales %, reportes %, feedback %, referidos %',
        v_legal_antes, v_reportes_antes, v_feedback_antes, v_referido_antes;
$a4nuevo$, 1);

DO $migracion$
DECLARE
    v_oid  oid;
    v_def  text;
    v_r    record;
    v_n    integer;
BEGIN
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario';
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'fn_borrar_datos_usuario: se esperaba 1 sobrecarga y hay %', v_n;
    END IF;

    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario';

    v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

    -- Guard against re-application: only a body without the catalog verification needs
    -- this migration.
    IF position('v_excepciones_col' IN v_def) > 0 THEN
        RAISE EXCEPTION 'fn_borrar_datos_usuario ya verifica desde el catalogo; la migracion ya fue aplicada';
    END IF;
    IF position('SESSION_REPLICATION_ROLE' IN upper(v_def)) = 0 THEN
        RAISE EXCEPTION 'fn_borrar_datos_usuario: no parece el cuerpo desplegado (falta session_replication_role)';
    END IF;

    FOR v_r IN SELECT * FROM _t_ancla ORDER BY etiqueta LOOP
        v_def := pg_temp.reemplazo(v_def, v_r.ancla, v_r.nuevo, v_r.esperados, v_r.etiqueta);
    END LOOP;

    -- Every decision is present exactly once in the new body, and the rows that are no
    -- longer destroyed are gone from the wipe list. Any of these missing means the anchor
    -- set did not cover the body.
    IF position('''p_presupuestos_cierre|user_id''' IN v_def) = 0 THEN
        RAISE EXCEPTION 'falta p_presupuestos_cierre en la lista de borrado (C1)';
    END IF;
    IF position('''p_legal_consentimientos|user_id''' IN v_def) > 0 THEN
        RAISE EXCEPTION 'p_legal_consentimientos sigue en la lista de borrado (C3)';
    END IF;
    IF position('''app_reportes|usuario_id''' IN v_def) > 0 THEN
        RAISE EXCEPTION 'app_reportes sigue en la lista de borrado (C4)';
    END IF;
    IF position('''p_feedback_usuario|user_id''' IN v_def) > 0 THEN
        RAISE EXCEPTION 'p_feedback_usuario sigue en la lista de borrado (C7)';
    END IF;
    IF position('''p_referidos|user_id_invitado''' IN v_def) > 0 THEN
        RAISE EXCEPTION 'p_referidos sigue en la lista de borrado (C8)';
    END IF;
    IF position('v_excepciones_col :=' IN v_def) = 0 THEN
        RAISE EXCEPTION 'falta la lista explicita de excepciones por columna (C9)';
    END IF;
    IF position('c.relnamespace = ''public''::regnamespace' IN v_def) = 0 THEN
        RAISE EXCEPTION 'falta la lectura del catalogo (C9)';
    END IF;

    EXECUTE v_def;

    -- Read it back: the body in the catalog is the one that was just composed, and it
    -- still has exactly one overload.
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario';
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'fn_borrar_datos_usuario: sobrecargas despues de aplicar: %', v_n;
    END IF;
END $migracion$;

DROP TABLE _t_ancla;

COMMIT;
