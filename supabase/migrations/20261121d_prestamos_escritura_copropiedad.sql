-- 20261121d_prestamos_escritura_copropiedad.sql
--
-- T30 / S31: co-ownership reaches the write layer.
--
-- The owner's rule, verbatim: "Si la deuda es compartida entre los dos, los dos son
-- duenos y se comportan como duenos, pudiendo hacer todas las funcionalidades que un
-- dueno tiene sobre esa deuda."
--
-- Migration 20261121c made the READ side honour it. The write side still resolved the
-- loan as `user_id = v_user_id`, so the second owner could see a shared debt in every
-- screen and still be unable to edit it, pay it, settle it or remove it from the
-- history. This migration closes exactly that gap and nothing else: no ownership
-- predicate changes what a function computes.
--
-- The predicate is the read side's, character for character:
--
--       (row.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND row.hogar_id = v_hogar_id))
--
-- and v_hogar_id is derived the same way 20261121c derives it:
--
--       SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
--
-- A caller who belongs to no household gets NULL, `v_hogar_id IS NOT NULL` is false,
-- and every predicate degrades to today's `user_id = v_user_id` for every row. That is
-- the no-regression guarantee; tests/prestamos/copropiedad-escritura-transaccional.sql
-- proves it by comparing both expressions' row sets over the whole table.
--
-- ---------------------------------------------------------------------------
-- The audited list, and what each one needed
-- ---------------------------------------------------------------------------
--
--   fn_prestamo_editar                 CHANGED  1 loan lookup
--   fn_prestamo_registrar_pago         CHANGED  1 loan lookup
--   fn_prestamo_eliminar_historial     CHANGED  1 loan lookup
--   fn_gestionar_deuda                 CHANGED  3 UPDATEs (editar / archivar / activar)
--   fn_saneamiento_vinculos_responder  CHANGED  1 loan lookup + 1 stored-score UPDATE
--   fn_prestamo_corregir_pago          NOT CHANGED, deliberately (see below)
--   fn_prestamo_eliminar_pago          NOT CHANGED, deliberately (see below)
--
-- Why the two payment operations keep gating on the payment's own user_id:
--
-- The subject row of those two functions is a payment, not a loan, and
-- p_prestamos_pagos has no hogar_id: the shared predicate has no second branch to
-- reach for it. The only honest subject there is the payer, because the cash leg of a
-- payment belongs to the wallet of whoever put the money in. The task of the wallet is
-- validated against the caller and against nobody else, so a correction rewrites a
-- p_caja row that already belongs to the caller. Widening those two to "any co-owner"
-- would let one member move another member's cash into their own wallet while the
-- operation kept naming the original payer — precisely the ledger lie S31 forbids.
--
-- What the fix does give them is the case that was impossible before: B can now
-- register a payment on A's co-owned loan (payment.user_id = B, B's wallet), and from
-- then on B can correct and delete that payment, because it is B's own money. So
-- correction and deletion are scoped to the payer, which is not the creator: no action
-- on the debt stays reserved to whoever created the row.
--
-- Payment attribution was audited and is already correct: fn_prestamo_registrar_pago
-- writes p_prestamos_pagos.user_id = v_user_id and p_caja.user_id = v_user_id, i.e. the
-- caller, and validates the wallet against the caller. It never reads the loan's
-- user_id, so a payment by B on A's loan already lands in B's wallet. Nothing to fix
-- there beyond the loan lookup. The test asserts it.
--
-- The balance side needed no change either: fn_prestamos_aplicar_saldo and
-- fn_prestamos_recalcular_saldo read (prestamo_id) only, never user_id, so a payment by
-- B recalculates A's loan once, by the trigger, from the payment rows of that loan.
--
-- Implementation: each definition is read with pg_get_functiondef, its CRLF line
-- endings are normalised to LF, and each anchor is replaced only if it appears exactly
-- the expected number of times. A missing or duplicated anchor aborts the whole
-- migration, so a silent no-op is impossible. Signatures are untouched, so
-- CREATE OR REPLACE keeps OID, ACL, comments and grants.
--
-- One naming note: fn_prestamo_editar already had a local `v_hogar` (the household the
-- call is about to WRITE, added by 20261121b) plus the membership guard that judges it.
-- That guard is untouched. The variable added here is `v_hogar_id`: the caller's own
-- household, the one the read predicate names. They answer different questions and must
-- not be conflated.

BEGIN;

CREATE FUNCTION pg_temp.reemplazo(
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
    proname   text,
    ancla     text,
    nuevo     text,
    esperados integer
) ON COMMIT DROP;

INSERT INTO _t_ancla (proname, ancla, nuevo, esperados) VALUES

-- ---- fn_prestamo_editar ---------------------------------------------------
('fn_prestamo_editar',
 E'    v_user_id   bigint;\n',
 E'    v_user_id   bigint;\n    v_hogar_id  bigint;\n',
 1),
('fn_prestamo_editar',
 'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();',
 E'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();\n\n    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;',
 1),
('fn_prestamo_editar',
 'WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id',
 E'WHERE prestamo_id = p_prestamo_id\n      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),

-- ---- fn_prestamo_registrar_pago -------------------------------------------
('fn_prestamo_registrar_pago',
 E'    v_user_id        bigint;\n',
 E'    v_user_id        bigint;\n    v_hogar_id       bigint;\n',
 1),
('fn_prestamo_registrar_pago',
 'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();',
 E'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();\n\n    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;',
 1),
('fn_prestamo_registrar_pago',
 'WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id',
 E'WHERE prestamo_id = p_prestamo_id\n      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),

-- ---- fn_prestamo_eliminar_historial --------------------------------------
('fn_prestamo_eliminar_historial',
 E'    v_user_id  bigint;\n',
 E'    v_user_id  bigint;\n    v_hogar_id bigint;\n',
 1),
('fn_prestamo_eliminar_historial',
 'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();',
 E'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();\n\n    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;',
 1),
('fn_prestamo_eliminar_historial',
 'WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id',
 E'WHERE prestamo_id = p_prestamo_id\n      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),

-- ---- fn_gestionar_deuda: legacy edit / archive / activate, three UPDATEs --
('fn_gestionar_deuda',
 E'    v_user_id bigint;\n',
 E'    v_user_id bigint;\n    v_hogar_id bigint;\n',
 1),
('fn_gestionar_deuda',
 'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();',
 E'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();\n\n    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;',
 1),
('fn_gestionar_deuda',
 'WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id',
 'WHERE prestamo_id = p_prestamo_id AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 3),

-- ---- fn_saneamiento_vinculos_responder -----------------------------------
('fn_saneamiento_vinculos_responder',
 E'    v_user_id bigint;\n',
 E'    v_user_id bigint;\n    v_hogar_id bigint;\n',
 1),
('fn_saneamiento_vinculos_responder',
 'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();',
 E'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();\n\n    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;',
 1),
-- Both statements carry the loan predicate: the reachability check of each answered
-- loan, and the stored-score UPDATE. The `v.user_id = v_user_id` filter inside the
-- EXISTS is left alone: it selects the caller's own answers, which is what the INSERT
-- above writes.
('fn_saneamiento_vinculos_responder',
 'WHERE prestamo_id = v_prestamo AND user_id = v_user_id',
 'WHERE prestamo_id = v_prestamo AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),
('fn_saneamiento_vinculos_responder',
 'WHERE p.user_id = v_user_id',
 'WHERE (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))',
 1);

DO $escritura$
DECLARE
    v_names text[] := ARRAY[
        'fn_prestamo_editar',
        'fn_prestamo_registrar_pago',
        'fn_prestamo_eliminar_historial',
        'fn_gestionar_deuda',
        'fn_saneamiento_vinculos_responder'
    ];
    v_name text;
    v_oid  oid;
    v_def  text;
    v_r    record;
    v_n    integer;
BEGIN
    -- The two payment operations are out of this list on purpose. Assert they are
    -- still there and still single-overload, so the audit cannot silently lose them.
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_prestamo_corregir_pago', 'fn_prestamo_eliminar_pago');
    IF v_n <> 2 THEN
        RAISE EXCEPTION 'se esperaban 2 funciones de pago (corregir, eliminar) y hay %', v_n;
    END IF;

    FOREACH v_name IN ARRAY v_names LOOP
        SELECT count(*) INTO v_n
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_name;
        IF v_n <> 1 THEN
            RAISE EXCEPTION '%: se esperaba 1 sobrecarga y hay %', v_name, v_n;
        END IF;

        SELECT p.oid INTO v_oid
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_name;

        v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

        IF position('v_hogar_id' IN v_def) > 0 THEN
            RAISE EXCEPTION '%: ya tiene v_hogar_id; la migracion ya fue aplicada', v_name;
        END IF;

        FOR v_r IN SELECT * FROM _t_ancla WHERE proname = v_name LOOP
            v_def := pg_temp.reemplazo(v_def, v_r.ancla, v_r.nuevo, v_r.esperados, v_name);
        END LOOP;

        -- The household must be declared, derived the way the read side derives it,
        -- and actually used. Any of the three missing means the anchor set did not
        -- cover this body.
        IF position(E'\n    v_hogar_id' IN v_def) = 0 THEN
            RAISE EXCEPTION '%: falta la declaracion de v_hogar_id', v_name;
        END IF;
        IF position('FROM public.p_hogar_participantes WHERE user_id = v_user_id' IN v_def) = 0 THEN
            RAISE EXCEPTION '%: falta la derivacion de v_hogar_id', v_name;
        END IF;
        IF position('(v_hogar_id IS NOT NULL AND' IN v_def) = 0 THEN
            RAISE EXCEPTION '%: no quedo ninguna comparacion contra v_hogar_id', v_name;
        END IF;

        EXECUTE v_def;
        RAISE NOTICE '%: escritura ajustada a copropiedad', v_name;
    END LOOP;
END $escritura$;

DROP TABLE _t_ancla;

COMMIT;
