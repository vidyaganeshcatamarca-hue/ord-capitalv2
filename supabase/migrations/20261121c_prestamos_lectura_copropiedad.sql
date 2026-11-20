-- 20261121c_prestamos_lectura_copropiedad.sql
--
-- T29 / S30, second half: the read layer honours co-ownership.
--
-- The rule, identical to the precedent already deployed in fn_obtener_arbol_categorias:
--
--   a row is visible when it belongs to the caller, OR when it is co-owned by the
--   household the caller is a member of
--
--       (row.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND row.hogar_id = v_hogar_id))
--
-- v_hogar_id is derived exactly the way the precedent derives it:
--
--       SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
--
-- A caller who belongs to no household gets NULL, the second branch is never true
-- (NULL IS NOT NULL), and every predicate degrades to today's `user_id = v_user_id`
-- byte for byte. That is the no-regression guarantee, and the transactional test
-- asserts it against a user with no household.
--
-- Co-ownership, not visibility: hogar_id set means the two members own that debt and
-- both may operate on it. It is NOT a read-only window into somebody else's private
-- rows, and this migration is read-only for that same reason: no write function's
-- ownership predicate changes here. fn_prestamo_editar keeps resolving the loan as
-- user_id = v_user_id; the only thing it gained (migration 20261121b) is the
-- membership guard for the household it writes.
--
-- Two functions in this list have a second, older overload that takes p_user_id uuid
-- and is not part of this audit (they do not resolve the caller from auth.uid()).
-- Only the auth.uid() overload is touched, and the overload count is asserted.
--
-- Implementation note: each definition is read with pg_get_functiondef, its CRLF line
-- endings are normalised to LF, and the exact anchor is replaced only if it appears the
-- expected number of times. If an anchor does not match, the whole migration aborts
-- and nothing is applied — a silent no-op is impossible.

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

-- ---- module-owned read functions -----------------------------------------
('fn_prestamos_listar',
 'p.user_id = v_user_id',
 '(p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))',
 1),

('fn_prestamo_detalle',
 'WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id',
 E'WHERE prestamo_id = p_prestamo_id\n      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),

('fn_prestamos_resumen',
 'p.user_id = v_user_id',
 '(p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))',
 1),

-- Two queries carry the predicate: the installments one and the single due date one.
('fn_prestamos_calendario',
 'p.user_id = v_user_id',
 '(p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))',
 2),

('fn_saneamiento_plan',
 'p.user_id = v_user_id',
 '(p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))',
 1),

-- Two CTEs: the active loans and the last scheduled installment.
('fn_saneamiento_progreso',
 'p.user_id = v_user_id',
 '(p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))',
 2),

('fn_saneamiento_simular',
 'WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id',
 E'WHERE prestamo_id = p_prestamo_id\n      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),

-- ---- legacy report functions ---------------------------------------------
('fn_simular_pago_extra',
 'FROM p_prestamos WHERE prestamo_id = p_deuda_id AND user_id = v_user_id',
 'FROM p_prestamos WHERE prestamo_id = p_deuda_id AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),

-- The only unaliased predicate of this function is the loan one; the p_caja and
-- p_tarjetas_credito ones carry their own alias and are left alone.
('fn_reporte_plan_ataque_deudas',
 'WHERE user_id = v_user_id AND tipo_flujo = ''debo''',
 'WHERE (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id)) AND tipo_flujo = ''debo''',
 1),

-- Two independent reads of p_prestamos, both with their own context.
('fn_reporte_mapa_acreedores',
 E'FROM p_prestamos\n            WHERE user_id = v_user_id',
 E'FROM p_prestamos\n            WHERE (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),

('fn_reporte_mapa_acreedores',
 E'FROM p_prestamos p\n        WHERE p.user_id = v_user_id',
 E'FROM p_prestamos p\n        WHERE (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))',
 1),

-- Both statements are the same text: the total debt and the monthly installment.
('fn_reporte_bola_nieve_estado',
 'WHERE user_id = v_user_id AND estado = ''activo''',
 'WHERE (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id)) AND estado = ''activo''',
 2),

('fn_reporte_escudo_tiempo',
 'FROM p_prestamos WHERE user_id = v_user_id',
 'FROM p_prestamos WHERE (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),

('fn_reporte_podadora_bcg',
 'FROM p_prestamos WHERE user_id = v_user_id',
 'FROM p_prestamos WHERE (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),

('fn_reporte_score_salud_financiera',
 'FROM p_prestamos WHERE user_id = v_user_id',
 'FROM p_prestamos WHERE (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))',
 1),

-- This function never filtered the loan side at all: it filtered the installments by
-- cd.user_id and then asked only whether the joined loan was a debt. The loan's own
-- ownership now enters through that same guard.
('fn_reporte_timeline_proyeccion',
 '(pr.prestamo_id IS NULL OR pr.tipo_flujo = ''debo'')',
 '(pr.prestamo_id IS NULL OR (pr.tipo_flujo = ''debo'' AND (pr.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND pr.hogar_id = v_hogar_id))))',
 1),

-- Already derives the household the way the precedent does; only the loan predicate
-- was missing it. It is excluded from the declaration/lookup pass below.
('fn_reporte_patrimonio_neto_consolidado',
 E'FROM p_prestamos\n    WHERE user_id = v_user_id AND tipo_flujo = ''debo''',
 E'FROM p_prestamos\n    WHERE (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id)) AND tipo_flujo = ''debo''',
 1);

DO $lectura$
DECLARE
    v_names text[] := ARRAY[
        'fn_prestamos_listar',
        'fn_prestamo_detalle',
        'fn_prestamos_resumen',
        'fn_prestamos_calendario',
        'fn_saneamiento_plan',
        'fn_saneamiento_progreso',
        'fn_saneamiento_simular',
        'fn_simular_pago_extra',
        'fn_reporte_plan_ataque_deudas',
        'fn_reporte_mapa_acreedores',
        'fn_reporte_bola_nieve_estado',
        'fn_reporte_escudo_tiempo',
        'fn_reporte_podadora_bcg',
        'fn_reporte_score_salud_financiera',
        'fn_reporte_timeline_proyeccion',
        'fn_reporte_patrimonio_neto_consolidado'
    ];
    v_ya_deriva constant text := 'fn_reporte_patrimonio_neto_consolidado';
    v_name      text;
    v_oid       oid;
    v_def       text;
    v_r         record;
    v_n         integer;
BEGIN
    FOREACH v_name IN ARRAY v_names LOOP
        -- Two of these names have a second overload that takes p_user_id uuid and does
        -- not resolve the caller from auth.uid(). Select the auth.uid() one.
        SELECT count(*) INTO v_n
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_name
          AND (v_name NOT IN ('fn_reporte_escudo_tiempo', 'fn_reporte_podadora_bcg')
               OR pg_get_function_identity_arguments(p.oid) = '');
        IF v_n <> 1 THEN
            RAISE EXCEPTION '%: se esperaba 1 sobrecarga y hay %', v_name, v_n;
        END IF;

        SELECT p.oid INTO v_oid
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_name
          AND (v_name NOT IN ('fn_reporte_escudo_tiempo', 'fn_reporte_podadora_bcg')
               OR pg_get_function_identity_arguments(p.oid) = '');

        v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

        -- 1. Declare the household and derive it the way the precedent does.
        IF v_name = v_ya_deriva THEN
            IF position('p_hogar_participantes' IN v_def) = 0 THEN
                RAISE EXCEPTION '%: se esperaba que ya derivara el hogar del llamador', v_name;
            END IF;
        ELSE
            IF position('v_hogar_id' IN v_def) > 0 THEN
                RAISE EXCEPTION '%: ya tiene v_hogar_id; la migracion ya fue aplicada', v_name;
            END IF;

            v_def := pg_temp.reemplazo(v_def,
                'v_user_id bigint;',
                E'v_user_id bigint;\n    v_hogar_id bigint;',
                1, v_name);

            v_def := pg_temp.reemplazo(v_def,
                'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();',
                E'SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();\n\n    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;',
                1, v_name);
        END IF;

        -- 2. Private OR co-owned.
        FOR v_r IN SELECT * FROM _t_ancla WHERE proname = v_name LOOP
            v_def := pg_temp.reemplazo(v_def, v_r.ancla, v_r.nuevo, v_r.esperados, v_name);
        END LOOP;

        IF position('hogar_id = v_hogar_id' IN v_def) = 0 THEN
            RAISE EXCEPTION '%: no quedo ninguna comparacion contra v_hogar_id', v_name;
        END IF;

        EXECUTE v_def;
        RAISE NOTICE '%: lectura ajustada a copropiedad', v_name;
    END LOOP;
END $lectura$;

DROP TABLE _t_ancla;

COMMIT;
