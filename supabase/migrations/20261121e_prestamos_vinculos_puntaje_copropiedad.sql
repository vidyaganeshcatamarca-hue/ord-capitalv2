-- 20261121e_prestamos_vinculos_puntaje_copropiedad.sql
--
-- T30 / S31: the Vinculos score of a co-owned loan aggregates the LOAN, not one member.
--
-- The owner's rule, verbatim: "Si la deuda es compartida entre los dos, los dos son
-- duenos y se comportan como duenos, pudiendo hacer todas las funcionalidades que un
-- dueno tiene sobre esa deuda." One of those functionalities is answering the Vinculos
-- questionnaire. Migration 20261121d widened WHO may answer it; it did not fix WHAT the
-- answer is stored as, and that is this migration.
--
-- ---------------------------------------------------------------------------
-- The defect
-- ---------------------------------------------------------------------------
--
-- p_prestamos_vinculos is keyed (prestamo_id, criterio) -- PRIMARY KEY, one row per loan
-- and question -- so the answers belong to the LOAN. The score computation, though,
-- filtered the aggregate by the caller:
--
--       SUM(CASE WHEN v.criterio = 3 THEN 5 ELSE 3 END)
--         ... WHERE v.prestamo_id = p.prestamo_id AND v.user_id = v_user_id AND v.seleccionado
--       ... AND EXISTS (SELECT 1 FROM ... WHERE v.prestamo_id = p.prestamo_id AND v.user_id = v_user_id)
--
-- With one answerer that is invisible. With two co-owners it is two separate lies:
--
--   * Partial collision. A answers criterion 1; B answers 1 and 3. The INSERT for B's
--     criterion 1 hits ON CONFLICT (prestamo_id, criterio) and updates A's row, so B ends
--     up owning only criterion 3. The SUM sees 5 and stores 5 where the true value is 8.
--   * Total collision. Both answer the same criteria. Every row belongs to the first
--     answerer, B owns none, the EXISTS is false, and the score is not recomputed at
--     all: the stored puntos_vinculo stays at whatever it was before -- including zero
--     on a loan that was just scored.
--
-- ---------------------------------------------------------------------------
-- The fix, and why it cannot regress a private loan
-- ---------------------------------------------------------------------------
--
-- Remove `AND v.user_id = v_user_id` from the SUM and from the EXISTS, so the score is
-- the sum of the distinct criteria answered for that loan. Nothing else in the body
-- changes.
--
-- For a private loan the two readings are the same statement: only its single owner can
-- answer it (the reachability predicate in the loop rejects every other caller), so
-- every row of that loan carries that one user's id. A private loan keeps its exact
-- previous score; tests/prestamos/vinculos-puntaje-copropiedad-transaccional.sql
-- asserts it on the same weights.
--
-- Deliberately NOT changed:
--
--   * WHO may answer. The loan lookup in the loop keeps
--     `(user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))`, the
--     predicate 20261121d set. A caller outside the household still cannot answer.
--   * `DELETE FROM public.p_prestamos_vinculos WHERE user_id = v_user_id;`. Answering
--     replaces THIS caller's answers wholesale -- the questionnaire is a snapshot, and
--     re-asking must be able to clear a previous answer. It must not erase the co-owner's
--     answers, which are equally valid input for the shared score.
--   * Signature, return type, SECURITY DEFINER, volatility, ACL. The body is read with
--     pg_get_functiondef and replayed with CREATE OR REPLACE over the same signature, and
--     the migration asserts owner, ACL and volatility are byte-identical before and after.
--
-- Known residual limitation, not addressed here because it is answer-level and predates
-- this change: an answer that collided onto the co-owner's row keeps the co-owner as its
-- user_id, so the second answerer cannot later retract that single answer by re-answering
-- without it (the wholesale DELETE is scoped to their own rows). The score itself is
-- correct in every case, because it now reads all rows of the loan. Fixing retraction
-- would need a per-loan, per-caller delete and is a contract change of its own.
--
-- Implementation: the anchors below are matched with an exact occurrence count, and a
-- missing or duplicated anchor aborts the whole migration, so a silent no-op is
-- impossible. Re-application is refused: after the fix the body no longer contains
-- `v.user_id = v_user_id` anywhere.

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
    ancla     text,
    nuevo     text,
    esperados integer
) ON COMMIT DROP;

INSERT INTO _t_ancla (ancla, nuevo, esperados) VALUES

-- ---- the aggregate: every answer recorded for the loan --------------------
(E'               WHERE v.prestamo_id = p.prestamo_id AND v.user_id = v_user_id AND v.seleccionado\n',
 E'               WHERE v.prestamo_id = p.prestamo_id AND v.seleccionado\n',
 1),

-- ---- the recompute guard: any answer of the loan triggers it --------------
(E'                   WHERE v.prestamo_id = p.prestamo_id AND v.user_id = v_user_id);\n',
 E'                   WHERE v.prestamo_id = p.prestamo_id);\n',
 1),

-- ---- the comment, so the body states the invariant it relies on -----------
-- Adjacent string constants cannot be continued across lines when they are E''
-- literals (Postgres rejects it), so the replacement is concatenated explicitly.
(E'    -- Recompute the stored score. Weights: criterion 3 = 5, criteria 1 and 2 = 3.\n',
 E'    -- Recompute the stored score. Weights: criterion 3 = 5, criteria 1 and 2 = 3.\n'
 || E'    -- p_prestamos_vinculos is keyed (prestamo_id, criterio): the answers belong to the\n'
 || E'    -- LOAN, not to each member. Filtering the aggregate by user_id made a co-owned loan\n'
 || E'    -- shrink to whoever answered last, or skip the recompute when every criterion\n'
 || E'    -- collided. Every answer recorded for the loan counts; on a private loan the two\n'
 || E'    -- readings are identical, because exactly one user can have answered it.\n',
 1);

DO $vinculos$
DECLARE
    v_name      text := 'fn_saneamiento_vinculos_responder';
    v_oid       oid;
    v_def       text;
    v_r         record;
    v_n         integer;
    v_owner0    oid;
    v_acl0      aclitem[];
    v_secdef0   boolean;
    v_vol0      "char";
    v_args0     text;
    v_ret0      oid;
    v_owner1    oid;
    v_acl1      aclitem[];
    v_secdef1   boolean;
    v_vol1      "char";
    v_args1     text;
    v_ret1      oid;
BEGIN
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_name;
    IF v_n <> 1 THEN
        RAISE EXCEPTION '%: se esperaba 1 sobrecarga y hay %', v_name, v_n;
    END IF;

    SELECT p.oid, p.proowner, p.proacl, p.prosecdef, p.provolatile,
           p.proargtypes::text, p.prorettype
      INTO v_oid, v_owner0, v_acl0, v_secdef0, v_vol0, v_args0, v_ret0
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_name;

    v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

    -- Re-application guard: the fixed body has no per-user filter left.
    IF position('v.user_id = v_user_id' IN v_def) = 0 THEN
        RAISE EXCEPTION '%: ya no filtra por usuario; la migracion ya fue aplicada', v_name;
    END IF;

    -- What may NOT move. Asserted before the edit so a surprising starting point stops
    -- the migration instead of being silently rewritten.
    IF position('DELETE FROM public.p_prestamos_vinculos WHERE user_id = v_user_id;' IN v_def) = 0 THEN
        RAISE EXCEPTION '%: falta el reemplazo integral de las respuestas del llamante', v_name;
    END IF;
    IF position('WHERE prestamo_id = v_prestamo AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))' IN v_def) = 0 THEN
        RAISE EXCEPTION '%: falta el predicado de alcance del prestamo (20261121d)', v_name;
    END IF;
    IF position('WHERE (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))' IN v_def) = 0 THEN
        RAISE EXCEPTION '%: falta el predicado de alcance del UPDATE de puntaje (20261121d)', v_name;
    END IF;

    FOR v_r IN SELECT * FROM _t_ancla LOOP
        v_def := pg_temp.reemplazo(v_def, v_r.ancla, v_r.nuevo, v_r.esperados, v_name);
    END LOOP;

    -- Post-conditions: the aggregate and the guard now read the whole loan, the two
    -- co-ownership predicates did not move, and no per-user filter survived anywhere.
    IF position('v.prestamo_id = p.prestamo_id AND v.seleccionado' IN v_def) = 0 THEN
        RAISE EXCEPTION '%: el SUM sigue sin agregar por prestamo', v_name;
    END IF;
    IF position('WHERE v.prestamo_id = p.prestamo_id);' IN v_def) = 0 THEN
        RAISE EXCEPTION '%: el EXISTS sigue sin agregar por prestamo', v_name;
    END IF;
    IF position('v.user_id = v_user_id' IN v_def) > 0 THEN
        RAISE EXCEPTION '%: quedo un filtro por usuario en el calculo del puntaje', v_name;
    END IF;
    IF position('(user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))' IN v_def) = 0
       OR position('(p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))' IN v_def) = 0 THEN
        RAISE EXCEPTION '%: cambio el predicado de copropiedad', v_name;
    END IF;

    EXECUTE v_def;

    SELECT p.proowner, p.proacl, p.prosecdef, p.provolatile,
           p.proargtypes::text, p.prorettype
      INTO v_owner1, v_acl1, v_secdef1, v_vol1, v_args1, v_ret1
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_name;

    IF v_owner0 IS DISTINCT FROM v_owner1
       OR v_acl0 IS DISTINCT FROM v_acl1
       OR v_secdef0 IS DISTINCT FROM v_secdef1
       OR v_vol0 IS DISTINCT FROM v_vol1
       OR v_args0 IS DISTINCT FROM v_args1
       OR v_ret0 IS DISTINCT FROM v_ret1 THEN
        RAISE EXCEPTION '%: cambio la identidad de la funcion (dueno/ACL/SECURITY/VOLATILE/firma)', v_name;
    END IF;

    RAISE NOTICE '%: el puntaje de vinculos agrega por prestamo', v_name;
END $vinculos$;

DROP TABLE _t_ancla;

COMMIT;
