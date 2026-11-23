-- 20261121g_prestamos_contraparte_integrante.sql
--
-- T21, classification half: 20261121f made the read layer project WHO the counterparty
-- of a loan is (contraparte_user_id, contraparte_nombre). That is necessary but not
-- sufficient for the Partner screen: the client knows its household id, never the
-- usuarios.user_id of the other member, and reading p_hogar_participantes from the client
-- is forbidden. So the classification is made where the household is already derived.
--
--   fn_prestamos_listar gains a third column at the END of its RETURNS TABLE:
--
--       contraparte_integrante boolean
--
--   true exactly when the loan names a counterparty, that counterparty belongs to the
--   caller's household, and it is not the caller itself. A caller with no household gets
--   false in every row (v_hogar_id IS NULL makes the EXISTS branch impossible), which is
--   the same degradation the read predicate already has.
--
-- The server classifies; the client never receives the partner's id. The id column stays
-- projected because the detail screen and the write path already depend on it, not
-- because the Partner screen needs it.
--
-- Same technique as 20261121f, because a RETURNS TABLE return type cannot be changed with
-- CREATE OR REPLACE: assert one overload and zero dependents, DROP, CREATE, re-grant
-- EXECUTE, and abort if the resulting ACL set differs from the one captured before.
--
-- The private-OR-co-owned predicate is not touched and is asserted to survive.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Preconditions and the ACL to reproduce
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _integrante_antes AS
SELECT p.oid,
       p.oid::regprocedure::text AS firma,
       p.proacl::text            AS acl_texto,
       ARRAY(
           SELECT x.grantee::text || ':' || x.privilege_type
           FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
           ORDER BY 1
       )                         AS acl_set
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'fn_prestamos_listar';

DO $$
DECLARE
    v_firmas text;
    v_deps   integer;
BEGIN
    SELECT string_agg(firma, ' | ' ORDER BY firma) INTO v_firmas FROM _integrante_antes;

    IF v_firmas IS DISTINCT FROM 'fn_prestamos_listar(text,boolean)' THEN
        RAISE EXCEPTION 'se esperaba exactamente una version de fn_prestamos_listar; encontrado: %',
            COALESCE(v_firmas, '(ninguna)');
    END IF;

    SELECT count(*) INTO v_deps
    FROM pg_depend d
    JOIN _integrante_antes a ON a.oid = d.refobjid
    WHERE d.refclassid = 'pg_proc'::regclass;

    IF v_deps <> 0 THEN
        RAISE EXCEPTION 'hay % objetos dependientes de fn_prestamos_listar; no se hace el DROP', v_deps;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname = 'fn_prestamos_listar'
          AND pg_get_function_result(p.oid) LIKE '%contraparte_integrante%'
    ) THEN
        RAISE EXCEPTION 'fn_prestamos_listar ya proyecta contraparte_integrante; la migracion ya fue aplicada';
    END IF;

    RAISE NOTICE 'precondiciones OK: una version, sin dependientes, columna nueva ausente';
END $$;

-- ---------------------------------------------------------------------------
-- 2. fn_prestamos_listar — DROP + CREATE, third column appended
-- ---------------------------------------------------------------------------

DROP FUNCTION public.fn_prestamos_listar(text, boolean);

CREATE FUNCTION public.fn_prestamos_listar(p_direccion text, p_incluir_saldados boolean DEFAULT false)
 RETURNS TABLE(prestamo_id bigint, direccion text, contraparte text, nombre text, moneda text, saldo_pendiente numeric, monto_original numeric, pagado_registrado numeric, estado text, estado_vencimiento text, proximo_vencimiento date, tasa numeric, tasa_informada boolean, modalidad text, tiene_cronograma boolean, contraparte_user_id bigint, contraparte_nombre text, contraparte_integrante boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    IF p_direccion IS NOT NULL AND p_direccion NOT IN ('debo', 'me_deben') THEN
        RAISE EXCEPTION 'error_invalid_direction';
    END IF;

    RETURN QUERY
    SELECT p.prestamo_id,
           p.tipo_flujo::text,
           p.entidad_nombre::text,
           COALESCE(p.nombre_prestamo, p.entidad_nombre)::text,
           trim(p.moneda_iso)::text,
           p.saldo_actual,
           p.monto_original,
           p.monto_pagado_acumulado,
           p.estado::text,
           public.fn_prestamos_estado_vencimiento(p.prestamo_id),
           p.proximo_vencimiento,
           p.tasa_anual_tna,
           p.tasa_informada,
           p.modalidad,
           EXISTS (SELECT 1 FROM public.p_prestamos_cuotas c WHERE c.prestamo_id = p.prestamo_id) AS tiene_cronograma,
           -- The named counterparty, if the loan declares one. LEFT JOIN on the primary
           -- key, so a loan without counterparty keeps NULL and no row is multiplied.
           p.contraparte_user_id,
           ct.nombre::text AS contraparte_nombre,
           -- The classification the Partner screen needs, decided here because only the
           -- server knows who belongs to the caller's household. True when the counterparty
           -- is a member of that household and is not the caller itself; false when the
           -- loan names nobody, when the counterparty is outside the household, and when
           -- the counterparty is the caller (a caller with no household always gets false).
           (p.contraparte_user_id IS NOT NULL
            AND v_hogar_id IS NOT NULL
            AND p.contraparte_user_id <> v_user_id
            AND EXISTS (SELECT 1
                        FROM public.p_hogar_participantes hp
                        WHERE hp.user_id = p.contraparte_user_id
                          AND hp.hogar_id = v_hogar_id)) AS contraparte_integrante
    FROM public.p_prestamos p
    LEFT JOIN public.usuarios ct ON ct.user_id = p.contraparte_user_id
    WHERE (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
      AND (p_direccion IS NULL OR p.tipo_flujo = p_direccion)
      AND p.estado <> 'eliminado'
      AND p.estado <> 'archivado'
      AND (COALESCE(p_incluir_saldados, false) OR p.estado <> 'pagado')
    ORDER BY
        -- Settled at the bottom, then the real debt pressure first.
        (p.estado = 'pagado') ASC,
        p.proximo_vencimiento ASC NULLS LAST,
        p.saldo_actual DESC,
        p.prestamo_id ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_prestamos_listar(text, boolean)
    TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The ACL is the same as before the drop, and the predicate survived
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    r     record;
    v_def text;
    v_res text;
BEGIN
    FOR r IN
        SELECT a.firma,
               a.acl_set,
               ARRAY(
                   SELECT x.grantee::text || ':' || x.privilege_type
                   FROM pg_proc p,
                        LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
                   WHERE p.pronamespace = 'public'::regnamespace
                     AND p.oid::regprocedure::text = a.firma
                   ORDER BY 1
               ) AS acl_ahora
        FROM _integrante_antes a
    LOOP
        IF r.acl_ahora IS DISTINCT FROM r.acl_set THEN
            RAISE EXCEPTION '%: la ACL cambio con la redefinicion. antes=% ahora=%',
                r.firma, r.acl_set, r.acl_ahora;
        END IF;
        RAISE NOTICE '%: ACL identica (%)', r.firma, array_to_string(r.acl_ahora, ', ');
    END LOOP;

    SELECT pg_get_functiondef(p.oid), pg_get_function_result(p.oid)
      INTO v_def, v_res
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.oid::regprocedure::text = 'fn_prestamos_listar(text,boolean)';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'fn_prestamos_listar(text,boolean) no quedo creada';
    END IF;

    IF position('SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;' IN v_def) = 0 THEN
        RAISE EXCEPTION 'fn_prestamos_listar: se perdio la derivacion del hogar del llamador';
    END IF;

    IF position('(p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))' IN v_def) = 0 THEN
        RAISE EXCEPTION 'fn_prestamos_listar: se perdio el predicado privado-o-coposeido';
    END IF;

    IF v_res NOT LIKE '%contraparte_integrante boolean)' THEN
        RAISE EXCEPTION 'fn_prestamos_listar: la columna contraparte_integrante no esta al final del RETURNS TABLE --> %', v_res;
    END IF;

    RAISE NOTICE 'predicado y columnas verificados';
END $$;

DROP TABLE _integrante_antes;

COMMIT;
