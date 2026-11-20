# fn_borrar_datos_usuario (creada 2026-10-16 con OK del dueño: 'ejecuta a, b, c y d')

## Descripcion

Borrado de DATOS del usuario (menu-ajustes S15/T5c). La cuenta permanece; arranca de cero con datos frescos (onboarding nuevo en el arranque siguiente). No es `fn_eliminar_cuenta_usuario`: esa archiva la cuenta 30 dias.

**Firma vigente: `fn_borrar_datos_usuario(p_confirmacion_texto text, p_pin text DEFAULT NULL)`** (2 argumentos desde 20261119b; este espejo decia 1 y describia la palabra `'BORRAR DATOS'`, que no existe en ninguna version desplegada).

- `p_confirmacion_texto` debe ser exactamente `ERASE`. La palabra es FIJA y en ingles a proposito: el texto se compara exacto, asi que traducirla compararia una palabra espanola contra una portuguesa. La UI la envia como placeholder `{palabra}` (ver `src/lib/deleteConfirmation.ts`), de modo que ninguna traduccion futura pueda tocarla.
- `p_pin` es obligatorio pasados los 15 dias: `fn_verificar_pin` tiene que devolver `ok`. Sin PIN, `error_pin_no_configurado`; configurado hace menos de 24 h, `error_pin_espera_24h`; incorrecto, `error_pin_incorrecto`. Dentro de la ventana de 15 dias no se pide nada (regla S15 del dueño, elevada 10 -> 15).
- Identidad: `SECURITY DEFINER` + `auth.uid()` resuelto contra `usuarios.auth_id`. Ningun valor del cliente decide de quien son las filas.
- Mecanismo: `SET LOCAL session_replication_role = replica` y borrado por enumeracion `tabla|columna`. Los triggers estan apagados porque `tr_bloquear_categoria_inversion` devuelve NULL en DELETE, porque los BEFORE DELETE de `p_caja` levantan 27000 y porque `tr_caja_limpieza` reescribe tablas que se estan borrando.
- Hogar: la pertenencia del que reinicia se borra siempre; el contenido del hogar solo cuando no queda ningun otro participante (politica del dueño, 2026-11-19). El que se va pierde el acceso, no los saldos del otro.
- Retorno: `{ resultado:'borrado_datos_ok', user_id, entradas_con_filas, total_filas_eliminadas, detalle:[{tabla, columna, filas}] }`, solo con las tablas que tenian filas.

## Estado del espejo

El cuerpo de abajo es el **desplegado hoy**, leido con `pg_get_functiondef('public.fn_borrar_datos_usuario(text,text)')` el 2026-11-22 despues de aplicar `20261122b_feedback_se_conserva_integro.sql`: 44 pares `tabla|columna` sobre 42 tablas, post-condition derivada del catalogo y verificacion por contenido de las filas que se conservan.

Migraciones aplicadas, en orden:

1. `supabase/migrations/20261122a_borrado_datos_decisiones_aprobadas.sql` - decisiones C1, C3, C4, C7, C8 y C9 del capitulo 5 de `odd/tasks/diagnostico-cierre-prestamos.md`.
2. `supabase/migrations/20261122b_feedback_se_conserva_integro.sql` - **rectifica dos de esas decisiones el mismo dia**: C7 se invierte (el feedback se conserva integro, ya no se anonimiza) y C8 se suspende (no se revierte, no se toca nada de `p_referidos`).

Ambas usan la misma tecnica: leen el cuerpo desplegado, normalizan CRLF y reemplazan anclas contando ocurrencias, de modo que un ancla ausente o duplicada aborta la migracion. Ninguna cambia la firma: `CREATE OR REPLACE` conserva OID, owner, ACL y comentario.

Respaldo del cuerpo anterior, para revertir: `tests/prestamos/respaldo-fn-borrar-datos-usuario-20261119c.sql`.

## Codigo SQL (desplegado, verificado 2026-11-22)

```sql
CREATE OR REPLACE FUNCTION public.fn_borrar_datos_usuario(p_confirmacion_texto text, p_pin text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id       bigint;
    v_creado_at     timestamptz;
    v_dias          int;
    v_pin_estado    text;
    v_pin_cambio    timestamptz;
    v_pin_ok        boolean;
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
    -- C7 invertido (duenio, 2026-11-22): el feedback se conserva integro. La copia guarda
    -- user_id, mensaje y metadata tal como estaban antes de la llamada.
    v_feedback_copia  jsonb;
    v_referido_ids    bigint[];
    v_referido_antes  bigint;
    v_referido_ligado bigint;
    v_faltan          bigint;
BEGIN
    -- 1. Identity (project rule: the row in usuarios decides, never a client value).
    SELECT user_id, creado_at, email, telefono
      INTO v_user_id, v_creado_at, v_email, v_telefono
    FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Exact text confirmation.
    IF p_confirmacion_texto IS DISTINCT FROM 'ERASE' THEN
        RAISE EXCEPTION '{"key": "error_confirmation_invalid", "params": {}}';
    END IF;

    -- 3. S15 enforced server-side, in the order the owner stated.
    v_dias := (now()::date - v_creado_at::date);
    IF v_dias > 15 THEN
        SELECT estado, pin_ultimo_cambio INTO v_pin_estado, v_pin_cambio
        FROM public.p_pin_seguridad WHERE user_id = v_user_id;

        IF v_pin_estado IS DISTINCT FROM 'activa' THEN
            RAISE EXCEPTION '{"key": "error_pin_no_configurado", "params": {}}';
        END IF;

        -- The wait. A PIN set minutes ago cannot authorise a wipe; a legacy row with no
        -- timestamp is treated as old enough, so pre-existing PINs keep working.
        IF COALESCE(v_pin_cambio, '-infinity'::timestamptz) > now() - interval '24 hours' THEN
            RAISE EXCEPTION '{"key": "error_pin_espera_24h", "params": {}}';
        END IF;

        -- fn_verificar_pin RETURNS ok; it does not raise. Reading the result is the
        -- whole check - PERFORM here would silently accept any PIN.
        SELECT f.ok INTO v_pin_ok FROM public.fn_verificar_pin(p_pin) AS f;
        IF v_pin_ok IS NOT TRUE THEN
            RAISE EXCEPTION '{"key": "error_pin_incorrecto", "params": {}}';
        END IF;
    END IF;

    -- 3b. Snapshot of what must survive, taken before anything is deleted so that a
    --     cascade reaching these tables one day cannot hide behind "it was already
    --     empty". Step numbering is left as it was: the anchors of this migration stay
    --     small, and every other comment keeps pointing at the same place.
    --
    --     Conserved whole (owner, C3, C4 and C7): the legal consent records, the reports
    --     with their media, and the user's feedback with its comments, names included.
    --     Conserved anonymised (owner, C8, suspended 2026-11-22): the referrals, left
    --     exactly as they were - no DDL and no rule change while the module is undecided.
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

    SELECT COALESCE(array_agg(x.referido_id ORDER BY x.referido_id), '{}'), count(*)
      INTO v_referido_ids, v_referido_antes
      FROM public.p_referidos x
     WHERE x.user_id_invitado = v_user_id
        OR x.user_id_invitador = v_user_id;

    -- 4. Triggers off for the wipe. Three reasons, each one measured:
    --    - tr_bloquear_categoria_inversion returns NULL on DELETE, so the user's own
    --      categories were never removed;
    --    - the p_caja BEFORE DELETE triggers raise 27000 when two rows share an
    --      investment, which is why the old body needed a row-by-row cursor;
    --    - tr_caja_limpieza rewrites p_tarjetas_credito and p_compromisos_tarjeta while
    --      we are deleting those same tables.
    -- The verification in step 6 replaces the safety the triggers provided.
    SET LOCAL session_replication_role = replica;

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
            DELETE FROM public.p_hogar_pagos          WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_hogar_conciliaciones WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_hogar_invitaciones   WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_proyectos_compartidos WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_hogares              WHERE hogar_id = ANY (v_hogares);
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
        -- Conserved whole (owner, C7 inverted 2026-11-22) or already anonymous (C9). The
        -- referrals stay here because C8 suspends the module, not because they are
        -- anonymised by this routine being correct: see the note in step 6.
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

    -- 7. The two rows that only the signup trigger creates, so the account keeps working
    --    right after the reset.
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
$function$
$
```

## Decisiones aprobadas que 20261122a implementa

Matriz medida el 2026-11-22 antes de escribir la migracion. Las filas de C7 y C8 describen lo que 20261122a desplego; **las dos quedaron rectificadas despues y las dos secciones siguientes son las que mandan hoy**.

| Decision | Tabla | Hoy | Despues |
|---|---|---|---|
| C1 | `p_presupuestos_cierre` | **no se borra**: 7 filas, 1 usuario, **0 claves foraneas**, y el post-condition no la veia | se borra por `user_id` y entra en la verificacion |
| C3 | `p_legal_consentimientos` | se borraba: 315 filas, 80 usuarios | se conserva entera; el post-condition comprueba que siguen las mismas filas por `id` |
| C4 | `app_reportes` | se borraba | se conserva entera, con `usuario_id` intacto. Medido: `usuario_id` es NOT NULL y **no tiene FK** en el catalogo; no hay nada que relajar |
| C7 | `p_feedback_usuario` | se borraba | **(rectificado por 20261122b)** se conserva **integro**: no se escribe ninguna columna |
| C8 | `p_referidos` | se borraba por las dos columnas | **(suspendido: no se revierte)** se conserva con el tratamiento que 20261122a desplego, documentado abajo |
| C9 | post-condition | lista escrita a mano | derivado del catalogo: toda tabla con columna `user_id`/`usuario_id` (con cualquier prefijo) o con FK a `usuarios`, menos una lista explicita de excepciones. Una tabla nueva aborta el reset |

Excepciones aprobadas del post-condition: `caja`, `cuentas_egresos`, `productos`, `vendedores` (app madre), `admin_audit_log`, `admin_clone_destinos_permitidos` (responsabilidad administrativa), `usuarios` (raiz de identidad), `p_legal_consentimientos`, `app_reportes` y `p_feedback_usuario` (conservadas enteras), `p_referidos` y `p_ia_global_suggestions` (conservadas con el tratamiento de abajo), y los objetos compartidos del hogar `p_hogar_pagos`, `p_hogar_conciliaciones`, `p_hogar_invitaciones`. Por columna: `p_prestamos|contraparte_user_id`, porque limpiarlo borraria quien le debe a quien en un prestamo ajeno y la transferencia de elementos compartidos (C5) sigue abierta.

## C7 invertido (20261122b): el feedback se conserva integro

Decision del duenio, 2026-11-22, textual: los registros de `p_feedback_usuario` deben conservarse integros cuando el usuario utiliza «Borrar mis datos». No deben eliminarse ni anonimizarse como parte de ese procedimiento, **incluido el contenido de los comentarios**, aunque contengan nombres u otra informacion proporcionada por el usuario.

- Lo que habia desplegado 20261122a: `UPDATE public.p_feedback_usuario SET user_id = NULL, metadata = {marcador}, mensaje = regexp_replace(...)`. Ese `UPDATE` **ya no existe**.
- Lo que hay desplegado hoy: **cero escrituras** sobre la tabla. Ni `DELETE`, ni `UPDATE`, ni redaccion de correo o telefono.
- La verificacion vieja exigia que la fila saliera anonimizada y habria abortado cada reset al quitar el `UPDATE`. Se reemplazo por la contraria, en el paso 3b y en el post-condition: se copian `feedback_id`, `user_id`, `mensaje` y `metadata::text` antes de borrar nada, y al final **cada fila tiene que existir y los tres valores tienen que ser los mismos** (`IS NOT DISTINCT FROM`, byte a byte sobre el valor almacenado). Tambien se comprueba la cantidad: una fila nueva con otro id no reemplaza a la que se perdio.
- `p_feedback_usuario` sigue en la lista de excepciones del post-condition, porque la tabla **no** tiene que quedar vacia: es la excepcion de "conservada entera", no la de "anonimizada".

## C8 suspendido (20261122b): `p_referidos` queda como esta

Decision del duenio: no modificar `p_referidos`; no cambiar columnas, restricciones, claves foraneas ni politicas de acceso; no implementar nuevas reglas de anonimizacion o conservacion de referidos; no realizar migraciones relacionadas con este modulo. Si alguna modificacion parcial anterior ya quedo desplegada, documentar exactamente su estado, sin revertirla unilateralmente. **El modulo Referidos esta pendiente de definicion funcional.**

Estado exacto desplegado hoy en `public.p_referidos`, medido contra el catalogo y contra el cuerpo de la funcion:

- DDL: sin cambios. `referido_id` PK; `user_id_invitador` **NOT NULL**; `user_id_invitado` NULL; `codigo_referido` NOT NULL y UNIQUE; `email_invitado` NULL; `completado_onboarding`, `suscrito_premium`, `beneficio_aplicado` boolean NULL; `fecha_suscripcion`, `creado_at`, `usado_at` timestamptz NULL; `chk_no_self_invite`; dos FK `ON DELETE CASCADE` a `usuarios` (`user_id_invitador`, `user_id_invitado`). Ninguna politica de acceso tocada.
- La tabla **no se borra** (salio de la lista de borrado en 20261122a) y esta en la lista de excepciones del post-condition.
- Corre hoy, y se deja tal cual: `UPDATE public.p_referidos SET user_id_invitado = NULL, email_invitado = NULL WHERE referido_id = ANY (v_referido_ids) AND (user_id_invitado = v_user_id OR (v_email IS NOT NULL AND lower(email_invitado) = lower(v_email)))`. Condicion: las filas del usuario que reinicia, ya sea porque figura como invitado o porque el correo que tipeo el invitador coincide con el suyo (sin distinguir mayusculas).
- `user_id_invitador` **no se limpia**: es NOT NULL con FK `ON DELETE CASCADE`, asi que `SET NULL` no es representable. El id del invitador queda en la fila; la funcion lo registra con `RAISE LOG` y sigue abierto. Limpiarlo requiere `ALTER COLUMN ... DROP NOT NULL`, que es una decision de esquema del duenio y no se toma aca.
- Post-condition desplegada: las filas siguen existiendo por `referido_id`, y el lado invitado no conserva ni el id ni el correo del usuario que reinicia. No se agrego nada mas.

**C5 sigue abierto**: transferir elementos co-poseidos (`hogar_id IS NOT NULL` en `p_caja`, `p_estructuras_egresos`, `p_inversiones`, `p_prestamos`, `p_presupuestos`, `p_presupuestos_cierre`, `p_presupuestos_historial`, `p_sobres`) al integrante que queda. Hoy la titularidad es `user_id` y el reset borra por `user_id`, asi que un elemento co-poseido desaparece para los dos. Medido: 0 filas co-poseidas y 0 hogares hoy, o sea que no hay exposicion viva; el bloqueo es del modelo, no de las FK.

## Notas de validacion

- `tests/prestamos/borrado-datos-decisiones-transaccional.sql`: usuarios descartables, `BEGIN ... ROLLBACK`. Contra el cuerpo desplegado despues de 20261122b: **12 PASS / 0 FAIL** (13 filas, la primera es contexto). La asercion de C7 ahora es la invertida: la fila sigue existiendo, con el mismo `user_id`, el mismo `mensaje` y el mismo `metadata` byte a byte, y el texto conserva el correo, el telefono y el nombre que escribio el fixture. Se prueban dos formas: `metadata` con contenido y `metadata` NULL (para que la comparacion no confunda NULL con "cambio"). Contra el cuerpo de 20261122a la asercion falla (`FALLO C7 invertido: el feedback no sobrevivio identico`): esa es la prueba de que el cambio es real y no un no-op.
- `tests/prestamos/borrado-usuario-transaccional.sql`: **1 PASS / 0 FAIL**. Ya no exige que el feedback quede sin autor: exige el mismo numero de filas con `user_id` intacto. Ojo: el user 20 tiene **0 filas** de feedback, asi que ahi la asercion es vacua; la que tiene filas reales es la suite anterior.
- `tests/prestamos/eliminar-cuenta-transaccional.sql`: no toca esta funcion, sin cambios.
- Las dos suites devuelven filas con la forma que lee `run-transaccional.mjs` (`orden`, `resultado` PASS/FAIL, `assertion`, `detalle`); lo que no es PASS ni FAIL sale como INFO y no cuenta en el resumen.
- Para correr una migracion sin aplicarla: `node tests/prestamos/run-migracion-sin-aplicar.mjs <migracion> <suite>` compone las dos en una transaccion que termina en ROLLBACK. Asi se probo 20261122b antes de aplicarla.
- Aviso de i18n (fuera del alcance de este archivo): `error_borrado_incompleto`, `error_borrado_datos_primeros_dias`, `error_confirmation_invalid` y `error_pin_no_configurado` no estan en `src/locales/es.ts`; el backend las emite y el front no las traduce. Es previo a esta migracion.
