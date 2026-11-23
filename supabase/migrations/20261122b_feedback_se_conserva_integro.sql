-- 20261122b_feedback_se_conserva_integro.sql
--
-- Rectification of two of the decisions implemented by
-- 20261122a_borrado_datos_decisiones_aprobadas.sql, which is already applied.
--
-- C7 INVERTED. Owner decision of 2026-11-22, verbatim: the rows of `p_feedback_usuario`
--    must be conserved whole when the user runs "Borrar mis datos". They must not be
--    deleted and must not be anonymised as part of that procedure, including the content
--    of the comments, even when they carry names or any other information the user
--    provided.
--
--    Deployed today: `user_id` is set to NULL, `metadata` is replaced by a marker, and
--    e-mail addresses and phone numbers are redacted out of `mensaje`. That UPDATE is
--    removed entirely. Nothing in this routine writes to the feedback any more.
--
--    Removing the UPDATE is not enough to comply: the old post-condition asserted the
--    row came out anonymised, so it would now abort every reset. It is replaced by the
--    opposite check - every row that existed before the call still exists, and `user_id`,
--    `mensaje` and `metadata` are the same values they had before. The comparison is made
--    against a copy taken in step 3b, so it is a comparison of stored values, not of a
--    rule that merely looks like it anonymises.
--
-- C8 SUSPENDED, not reverted. Owner decision: do not modify `p_referidos`; no columns, no
--    constraints, no foreign keys, no access policies; do not implement new anonymisation
--    or conservation rules for referrals; do not migrate anything about this module. If a
--    partial modification is already deployed, document its exact state without reverting
--    it unilaterally.
--
--    Deployed today, measured for this migration and left exactly as it is: the invited
--    side of a referral (`user_id_invitado`, nullable) is set to NULL together with
--    `email_invitado` when the invited user is the one resetting, or when the address the
--    inviter typed matches the resetting user's e-mail. The inviter's reference
--    (`user_id_invitador`) cannot be cleared: the column is NOT NULL and its foreign key
--    is ON DELETE CASCADE, so SET NULL is not representable, and clearing it needs
--    `ALTER COLUMN ... DROP NOT NULL`, which is a schema decision. That residual reference
--    is still logged by the routine and is reported as an open item. The Referrals module
--    is pending a functional definition.
--
-- NOT in this migration: C1, C3, C4 and C9 are as 20261122a left them. The wipe list, the
-- catalog-derived verification, the exception list and the household handling are
-- untouched except for the one comment line that described the feedback as anonymised.
--
-- Technique: same as the previous one. The deployed body is read with pg_get_functiondef,
-- its CRLF endings normalised, and each anchor replaced only if it appears exactly the
-- expected number of times. A missing or duplicated anchor aborts the whole migration, so
-- a silent no-op is impossible. The signature is untouched, so CREATE OR REPLACE keeps the
-- OID, the owner, the ACL and the comment.
BEGIN;

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

-- Anchors. a1: DECLARE tail, where the copy of the feedback is declared. a2: the comment
-- that describes what step 3b snapshots. a3: the feedback snapshot, extended to the whole
-- row. a4: the step-6 header plus the C7 UPDATE - removed. a5: the C7 post-condition,
-- inverted. a6: the one comment line of the exception list that called the feedback
-- anonymised.
INSERT INTO _t_ancla (etiqueta, ancla, nuevo, esperados) VALUES

('a1', $a1$
    v_feedback_ids    bigint[];
    v_feedback_antes  bigint;
$a1$,
 $a1nuevo$
    v_feedback_ids    bigint[];
    v_feedback_antes  bigint;
    -- C7 invertido (duenio, 2026-11-22): el feedback se conserva integro. La copia guarda
    -- user_id, mensaje y metadata tal como estaban antes de la llamada.
    v_feedback_copia  jsonb;
$a1nuevo$, 1),

('a2', $a2$
    --     Conserved whole (owner, C3 and C4): the legal consent records and the reports
    --     with their media. Conserved anonymised (owner, C7 and C8): the feedback and the
    --     referrals.
$a2$,
 $a2nuevo$
    --     Conserved whole (owner, C3, C4 and C7): the legal consent records, the reports
    --     with their media, and the user's feedback with its comments, names included.
    --     Conserved anonymised (owner, C8, suspended 2026-11-22): the referrals, left
    --     exactly as they were - no DDL and no rule change while the module is undecided.
$a2nuevo$, 1),

('a3', $a3$
    SELECT COALESCE(array_agg(f.feedback_id ORDER BY f.feedback_id), '{}'), count(*)
      INTO v_feedback_ids, v_feedback_antes
      FROM public.p_feedback_usuario f
     WHERE f.user_id = v_user_id;
$a3$,
 $a3nuevo$
    SELECT COALESCE(array_agg(f.feedback_id ORDER BY f.feedback_id), '{}'), count(*)
      INTO v_feedback_ids, v_feedback_antes
      FROM public.p_feedback_usuario f
     WHERE f.user_id = v_user_id;

    -- C7 invertido: la copia completa, no solo los ids. `metadata` se guarda como texto
    -- para compararla byte a byte al final, que es exactamente lo que el duenio pidio.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id',       f.feedback_id,
               'user_id',  f.user_id::text,
               'mensaje',  f.mensaje,
               'metadata', f.metadata::text) ORDER BY f.feedback_id), '[]'::jsonb)
      INTO v_feedback_copia
      FROM public.p_feedback_usuario f
     WHERE f.user_id = v_user_id;
$a3nuevo$, 1),

('a4', $a4$
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
$a4$,
 $a4nuevo$
    -- 6. Rows that survive on purpose. Until 2026-11-22 the feedback was conserved
    --    anonymised, and this step updated it. The owner inverted that decision: the
    --    feedback is conserved WHOLE - `user_id`, `mensaje` and `metadata` untouched,
    --    comments carrying names or any other detail the user wrote included - and it is
    --    no longer written to at all.
    --
    --    C7 - p_feedback_usuario: no UPDATE, no anonymisation, no redaction. Nothing in
    --    this routine may touch a feedback row of the user who resets. "I did not delete
    --    it" is still not the same as "it is the same row", so the copy taken in step 3b
    --    is compared value by value in the post-condition instead.
$a4nuevo$, 1),

('a5', $a5$
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
$a5$,
 $a5nuevo$
    -- C7 invertido: las filas de feedback del usuario siguen existiendo, una por una, y
    -- con los mismos valores. `user_id`, `mensaje` y `metadata` se comparan contra la
    -- copia de 3b, guardada como texto: es la comparacion del valor almacenado, no la de
    -- una regla que "parece" anonimizar.
    SELECT count(*) INTO v_faltan
    FROM jsonb_array_elements(v_feedback_copia) AS e (f)
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.p_feedback_usuario x
        WHERE x.feedback_id = (e.f->>'id')::bigint
          AND x.user_id::text   IS NOT DISTINCT FROM e.f->>'user_id'
          AND x.mensaje         IS NOT DISTINCT FROM e.f->>'mensaje'
          AND x.metadata::text  IS NOT DISTINCT FROM e.f->>'metadata'
    );
    IF v_faltan > 0 THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "p_feedback_usuario", "columna": "conserved", "filas": %}}',
            v_faltan;
    END IF;

    -- La cantidad tampoco puede bajar: una fila nueva con otro id no reemplaza a la que
    -- se perdio.
    SELECT count(*) INTO v_faltan
    FROM public.p_feedback_usuario
    WHERE feedback_id = ANY (v_feedback_ids);
    IF v_faltan <> v_feedback_antes THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "p_feedback_usuario", "columna": "count", "filas": %}}',
            v_feedback_antes - v_faltan;
    END IF;
$a5nuevo$, 1),

('a6', $a6$
        -- Conserved anonymised (owner, C7 and C8) or already anonymous (C9).
$a6$,
 $a6nuevo$
        -- Conserved whole (owner, C7 inverted 2026-11-22) or already anonymous (C9). The
        -- referrals stay here because C8 suspends the module, not because they are
        -- anonymised by this routine being correct: see the note in step 6.
$a6nuevo$, 1);

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

    -- Guards against re-application and against the wrong starting body.
    IF position('v_feedback_copia' IN v_def) > 0 THEN
        RAISE EXCEPTION 'fn_borrar_datos_usuario ya conserva el feedback integro; la migracion ya fue aplicada';
    END IF;
    IF position('SET user_id  = NULL' IN v_def) = 0 THEN
        RAISE EXCEPTION 'fn_borrar_datos_usuario: no parece el cuerpo desplegado (falta la anonimizacion de p_feedback_usuario)';
    END IF;
    IF position('SESSION_REPLICATION_ROLE' IN upper(v_def)) = 0 THEN
        RAISE EXCEPTION 'fn_borrar_datos_usuario: no parece el cuerpo desplegado (falta session_replication_role)';
    END IF;
    IF position('v_excepciones_col :=' IN v_def) = 0 THEN
        RAISE EXCEPTION 'fn_borrar_datos_usuario: falta la verificacion desde el catalogo (C9); aplicar 20261122a antes';
    END IF;

    FOR v_r IN SELECT * FROM _t_ancla ORDER BY etiqueta LOOP
        v_def := pg_temp.reemplazo(v_def, v_r.ancla, v_r.nuevo, v_r.esperados, v_r.etiqueta);
    END LOOP;

    -- C7 inverted: nothing writes to the feedback any more, no marker survives, and the
    -- row is verified against the snapshot instead.
    IF position('UPDATE public.p_feedback_usuario' IN v_def) > 0 THEN
        RAISE EXCEPTION 'p_feedback_usuario sigue recibiendose un UPDATE (C7 invertido)';
    END IF;
    IF position('anonymised_by_data_reset' IN v_def) > 0 THEN
        RAISE EXCEPTION 'quedo el marcador de anonimizacion del feedback (C7 invertido)';
    END IF;
    IF position('''p_feedback_usuario|user_id''' IN v_def) > 0 THEN
        RAISE EXCEPTION 'p_feedback_usuario volvio a la lista de borrado (C7 invertido)';
    END IF;
    IF position('v_feedback_copia' IN v_def) = 0 THEN
        RAISE EXCEPTION 'falta la copia del feedback (C7 invertido)';
    END IF;

    -- C8 suspended: the referral part is exactly as 20261122a left it, neither removed
    -- nor extended. If someone touched it, this migration is not the one to apply.
    IF position('UPDATE public.p_referidos' IN v_def) = 0 THEN
        RAISE EXCEPTION 'p_referidos ya no recibe el tratamiento desplegado (C8 suspendido: no se revierte)';
    END IF;
    IF position('user_id_invitado = NULL' IN v_def) = 0 THEN
        RAISE EXCEPTION 'p_referidos: cambio el tratamiento del lado invitado (C8 suspendido: no se revierte)';
    END IF;
    IF position('''p_referidos|user_id_invitado''' IN v_def) > 0 THEN
        RAISE EXCEPTION 'p_referidos volvio a la lista de borrado (C8 suspendido: no se revierte)';
    END IF;

    -- Everything else stays where 20261122a put it.
    IF position('''p_presupuestos_cierre|user_id''' IN v_def) = 0 THEN
        RAISE EXCEPTION 'falta p_presupuestos_cierre en la lista de borrado (C1)';
    END IF;
    IF position('''p_legal_consentimientos|user_id''' IN v_def) > 0 THEN
        RAISE EXCEPTION 'p_legal_consentimientos sigue en la lista de borrado (C3)';
    END IF;
    IF position('''app_reportes|usuario_id''' IN v_def) > 0 THEN
        RAISE EXCEPTION 'app_reportes sigue en la lista de borrado (C4)';
    END IF;
    IF position('c.relnamespace = ''public''::regnamespace' IN v_def) = 0 THEN
        RAISE EXCEPTION 'falta la lectura del catalogo (C9)';
    END IF;

    EXECUTE v_def;

    -- Read it back: still exactly one overload, and the body in the catalog is the one
    -- that was just composed.
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario';
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'fn_borrar_datos_usuario: sobrecargas despues de aplicar: %', v_n;
    END IF;

    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario';
    IF position('UPDATE public.p_feedback_usuario' IN v_def) > 0
       OR position('v_feedback_copia' IN v_def) = 0 THEN
        RAISE EXCEPTION 'relectura: el cuerpo aplicado no conserva el feedback integro (C7 invertido)';
    END IF;
END $migracion$;

DROP TABLE _t_ancla;

COMMIT;
