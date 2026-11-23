-- 20261121f_prestamos_contraparte_lectura.sql
--
-- T21, read half: the loan already names its counterparty member
-- (p_prestamos.contraparte_user_id, FK to usuarios, added by 20261121a) and the write
-- functions already persist it, but no read function projected it. Without that column
-- the Partner screen cannot list "the loans whose counterparty is the other member", and
-- matching entidad_nombre against a member's name would be inventing a link the
-- database does not claim.
--
--   fn_prestamos_listar   gains contraparte_user_id bigint and contraparte_nombre text
--                         at the END of its RETURNS TABLE, filled by a LEFT JOIN to
--                         usuarios. The join is on usuarios.user_id (primary key), so it
--                         cannot multiply rows; a loan with no counterparty keeps NULL
--                         in both columns.
--   fn_prestamo_detalle   returns the same two values inside its jsonb.
--
-- Changing a RETURNS TABLE return type is not possible with CREATE OR REPLACE, so the
-- list function is dropped and created. Before dropping, this migration asserts that
-- there is exactly one overload of the function and that no object depends on it;
-- after creating, it re-grants EXECUTE to the same grantees and asserts that the
-- resulting ACL set is identical to the one captured before the drop.
--
-- The private-OR-co-owned predicate is NOT touched here. It is asserted to survive:
-- a caller reads its own rows and the rows co-owned by its household, and a caller with
-- no household still degrades to user_id = v_user_id.
--
-- Both columns carry the same values for a private and for a co-owned loan: the
-- counterparty is a person named on the row, not a household concept, so co-ownership
-- does not change what they hold.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Preconditions and the ACL to reproduce, captured before the drop
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _contraparte_antes AS
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
  AND p.proname IN ('fn_prestamos_listar', 'fn_prestamo_detalle');

DO $$
DECLARE
    v_firmas text;
    v_deps   integer;
BEGIN
    SELECT string_agg(firma, ' | ' ORDER BY firma) INTO v_firmas FROM _contraparte_antes;

    IF v_firmas IS DISTINCT FROM
       'fn_prestamo_detalle(bigint) | fn_prestamos_listar(text,boolean)' THEN
        RAISE EXCEPTION 'se esperaba exactamente una version de cada funcion; encontrado: %',
            COALESCE(v_firmas, '(ninguna)');
    END IF;

    SELECT count(*) INTO v_deps
    FROM pg_depend d
    JOIN _contraparte_antes a ON a.oid = d.refobjid
    WHERE d.refclassid = 'pg_proc'::regclass;

    IF v_deps <> 0 THEN
        RAISE EXCEPTION 'hay % objetos dependientes de las funciones a redefinir; no se hace el DROP', v_deps;
    END IF;

    RAISE NOTICE 'precondiciones OK: una version de cada funcion, sin dependientes';
END $$;

-- ---------------------------------------------------------------------------
-- 2. fn_prestamos_listar — DROP + CREATE, two columns appended
-- ---------------------------------------------------------------------------

DROP FUNCTION public.fn_prestamos_listar(text, boolean);

CREATE FUNCTION public.fn_prestamos_listar(p_direccion text, p_incluir_saldados boolean DEFAULT false)
 RETURNS TABLE(prestamo_id bigint, direccion text, contraparte text, nombre text, moneda text, saldo_pendiente numeric, monto_original numeric, pagado_registrado numeric, estado text, estado_vencimiento text, proximo_vencimiento date, tasa numeric, tasa_informada boolean, modalidad text, tiene_cronograma boolean, contraparte_user_id bigint, contraparte_nombre text)
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
           ct.nombre::text AS contraparte_nombre
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
-- 3. fn_prestamo_detalle — same two values in the jsonb
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamo_detalle(p_prestamo_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_p       public.p_prestamos%ROWTYPE;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    SELECT * INTO v_p
    FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));
    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_debt_not_found';
    END IF;

    RETURN jsonb_build_object(
        'prestamo_id',        v_p.prestamo_id,
        'direccion',          v_p.tipo_flujo,
        'contraparte',        v_p.entidad_nombre,
        'nombre',             COALESCE(v_p.nombre_prestamo, v_p.entidad_nombre),
        -- The named counterparty, identical for a private and for a co-owned loan.
        'contraparte_user_id', v_p.contraparte_user_id,
        'contraparte_nombre', (SELECT ct.nombre::text FROM public.usuarios ct
                                WHERE ct.user_id = v_p.contraparte_user_id),
        'tipo_deuda',         v_p.tipo_deuda,
        'moneda',             trim(v_p.moneda_iso),
        'monto_original',     v_p.monto_original,
        'saldo_al_ingreso',   v_p.saldo_al_ingreso,
        'saldo_pendiente',    v_p.saldo_actual,
        'pagado_registrado',  v_p.monto_pagado_acumulado,
        'modalidad',          v_p.modalidad,
        'condicion_interes',  v_p.condicion_interes,
        'interes_total_acordado', v_p.interes_total_acordado,
        'tasa',               v_p.tasa_anual_tna,
        'tasa_informada',     v_p.tasa_informada,
        'estado',             v_p.estado,
        'estado_vencimiento', public.fn_prestamos_estado_vencimiento(v_p.prestamo_id),
        'proximo_vencimiento', v_p.proximo_vencimiento,
        'puntos_vinculo',     v_p.puntos_vinculo,
        'creado_at',          v_p.creado_at,
        'cuotas', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'cuota_id',           c.cuota_id,
                       'numero_cuota',       c.numero_cuota,
                       'fecha_vencimiento',  c.fecha_vencimiento,
                       'monto_cuota',        c.monto_cuota,
                       'capital_componente', c.capital_componente,
                       'interes_componente', c.interes_componente,
                       'vencida',            c.fecha_vencimiento <= CURRENT_DATE
                   ) ORDER BY c.numero_cuota)
            FROM public.p_prestamos_cuotas c
            WHERE c.prestamo_id = v_p.prestamo_id
        ), '[]'::jsonb),
        'pagos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'pago_id',          g.pago_id,
                       'direccion',        g.direccion,
                       'fecha',            g.fecha,
                       'p_caja_id',        g.p_caja_id,
                       'billetera_id',     g.billetera_id,
                       'moneda_billetera', g.moneda_billetera,
                       'monto_billetera',  g.monto_billetera,
                       'monto_aplicado',   g.monto_aplicado,
                       'capital_aplicado', g.capital_aplicado,
                       'interes_aplicado', g.interes_aplicado,
                       'interes_excedente', g.interes_excedente,
                       'nota',             g.nota,
                       'estado',           g.estado
                   ) ORDER BY g.fecha DESC, g.pago_id DESC)
            FROM public.p_prestamos_pagos g
            WHERE g.prestamo_id = v_p.prestamo_id
        ), '[]'::jsonb),
        'total_interes_excedente', COALESCE((
            SELECT SUM(g.interes_excedente)
            FROM public.p_prestamos_pagos g
            WHERE g.prestamo_id = v_p.prestamo_id AND g.estado = 'activo'
        ), 0)
    );
END;
$function$;

-- CREATE OR REPLACE keeps the existing ACL of this function; it is asserted below
-- anyway, so a silent change cannot pass.

-- ---------------------------------------------------------------------------
-- 4. The ACL is the same as before the drop, and the predicate survived
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    r        record;
    v_def    text;
    v_res    text;
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
        FROM _contraparte_antes a
    LOOP
        IF r.acl_ahora IS DISTINCT FROM r.acl_set THEN
            RAISE EXCEPTION '%: la ACL cambio con la redefinicion. antes=% ahora=%',
                r.firma, r.acl_set, r.acl_ahora;
        END IF;
        RAISE NOTICE '%: ACL identica (%)', r.firma, array_to_string(r.acl_ahora, ', ');
    END LOOP;

    -- fn_prestamos_listar: household derived, private-OR-co-owned predicate, new columns.
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

    IF v_res NOT LIKE '%contraparte_user_id bigint, contraparte_nombre text)' THEN
        RAISE EXCEPTION 'fn_prestamos_listar: las dos columnas nuevas no estan al final del RETURNS TABLE --> %', v_res;
    END IF;

    -- fn_prestamo_detalle: same predicate, both new keys in the jsonb.
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.oid::regprocedure::text = 'fn_prestamo_detalle(bigint)';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'fn_prestamo_detalle(bigint) no quedo creada';
    END IF;

    IF position('(user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))' IN v_def) = 0 THEN
        RAISE EXCEPTION 'fn_prestamo_detalle: se perdio el predicado privado-o-coposeido';
    END IF;

    IF position('''contraparte_user_id''' IN v_def) = 0
       OR position('''contraparte_nombre''' IN v_def) = 0 THEN
        RAISE EXCEPTION 'fn_prestamo_detalle: falta alguna de las dos claves nuevas en el jsonb';
    END IF;

    RAISE NOTICE 'predicado y columnas verificados en las dos funciones';
END $$;

DROP TABLE _contraparte_antes;

COMMIT;
