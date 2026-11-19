-- Loans / saneamiento rebuild — stage 7: Saneamiento (T11, T12, T13, T14, T15).
--
-- Universe (§7.1, AC-19): only pending loans from "Debo". No Me deben, no credit
-- cards, no recurring expenses, no settled loans. This replaces the old plan, which
-- merged cards and invented virtual rates of 50 and 150.
--
-- Currency: the plan ranks WITHIN each currency. Comparing a 100.000 ARS debt with
-- a 100 USD debt is meaningless and the spec forbids summing them nominally.
--
-- Nothing here moves money or mutates a loan. Simulating and suggesting are reads.

BEGIN;

-- ---------------------------------------------------------------------------
-- T13 storage: the Vinculos answers, one row per loan and question
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.p_prestamos_vinculos (
    prestamo_id   bigint NOT NULL REFERENCES public.p_prestamos(prestamo_id) ON DELETE CASCADE,
    user_id       bigint NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    criterio      smallint NOT NULL,
    seleccionado  boolean NOT NULL DEFAULT false,
    actualizado_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (prestamo_id, criterio),
    CONSTRAINT p_prestamos_vinculos_criterio_check CHECK (criterio IN (1, 2, 3))
);

COMMENT ON TABLE public.p_prestamos_vinculos IS
    'Answers to the three Vinculos questions, stored per loan and question so the score is reproducible and re-askable. Never created at loan creation: only when the user asks for a Vinculos suggestion.';

ALTER TABLE public.p_prestamos_vinculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_security_definer_access ON public.p_prestamos_vinculos;
DROP POLICY IF EXISTS deny_direct_anon_access       ON public.p_prestamos_vinculos;
CREATE POLICY allow_security_definer_access ON public.p_prestamos_vinculos
    FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY deny_direct_anon_access ON public.p_prestamos_vinculos
    FOR ALL TO anon USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- T11 + T12 · The attack plan
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_saneamiento_plan(
    p_estrategia text DEFAULT 'math'
) RETURNS TABLE (
    prestamo_id        bigint,
    contraparte        text,
    nombre             text,
    moneda             text,
    saldo_pendiente    numeric,
    tasa               numeric,
    tasa_informada     boolean,
    proximo_vencimiento date,
    moneda_orden       text,
    es_personal        boolean,
    puntos_vinculo     smallint,
    estado_vencimiento text,
    prioridad          integer,
    comparte_prioridad boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id bigint;
    v_est     text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    v_est := COALESCE(NULLIF(trim(p_estrategia), ''), 'math');
    IF v_est NOT IN ('math', 'emotional', 'relationships') THEN
        RAISE EXCEPTION 'error_invalid_strategy';
    END IF;

    RETURN QUERY
    WITH base AS (
        SELECT p.prestamo_id,
               p.entidad_nombre::text AS contraparte,
               COALESCE(p.nombre_prestamo, p.entidad_nombre)::text AS nombre,
               trim(p.moneda_iso)::text AS moneda,
               p.saldo_actual AS saldo_pendiente,
               -- An uninformed rate orders as 0 % but is never presented as a real 0 %.
               CASE WHEN p.tasa_informada THEN p.tasa_anual_tna ELSE 0 END AS tasa,
               p.tasa_informada,
               p.proximo_vencimiento,
               (p.tipo_deuda = 'personal'
                OR p.tipo_entidad IN ('familiar', 'tercero', 'otro')) AS es_personal,
               p.puntos_vinculo,
               public.fn_prestamos_estado_vencimiento(p.prestamo_id) AS estado_vencimiento
        FROM public.p_prestamos p
        WHERE p.user_id = v_user_id
          AND p.tipo_flujo = 'debo'
          AND p.estado IN ('activo', 'pendiente', 'parcial')
          AND p.eliminado_at IS NULL
          AND COALESCE(p.saldo_actual, 0) > 0
    ),
    ordenado AS (
        SELECT b.*,
               CASE WHEN v_est = 'math' THEN
                        dense_rank() OVER (
                            PARTITION BY b.moneda
                            ORDER BY b.tasa DESC, b.saldo_pendiente DESC, b.prestamo_id ASC)
                    WHEN v_est = 'emotional' THEN
                        dense_rank() OVER (
                            PARTITION BY b.moneda
                            ORDER BY b.saldo_pendiente ASC, b.proximo_vencimiento ASC NULLS LAST,
                                     b.prestamo_id ASC)
                    ELSE
                        -- Personal creditors first, scored; institutions after, by the
                        -- nearest due date. NO prestamo_id here on purpose: the spec
                        -- requires tied scores to SHARE a rank so the user can break the
                        -- tie manually. Determinism for display comes from the outer
                        -- ORDER BY, which does not affect the rank.
                        dense_rank() OVER (
                            PARTITION BY b.moneda
                            ORDER BY b.es_personal DESC,
                                     CASE WHEN b.es_personal THEN COALESCE(b.puntos_vinculo, 0) END DESC,
                                     CASE WHEN NOT b.es_personal THEN b.proximo_vencimiento END ASC NULLS LAST)
               END AS rango
        FROM base b
    )
    SELECT o.prestamo_id, o.contraparte, o.nombre, o.moneda, o.saldo_pendiente,
           o.tasa, o.tasa_informada, o.proximo_vencimiento, o.moneda,
           o.es_personal, o.puntos_vinculo, o.estado_vencimiento,
           o.rango::integer,
           (v_est = 'relationships'
            AND o.es_personal
            AND (SELECT count(*) FROM ordenado x
                  WHERE x.moneda = o.moneda AND x.rango = o.rango) > 1) AS comparte_prioridad
    FROM ordenado o
    ORDER BY o.moneda, o.rango, o.prestamo_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- T13 · Vinculos questionnaire
--
-- Asked only when the user requests a Vinculos suggestion, never at loan creation
-- (§7.3). Weights are fixed by the approved spec: relationship 5, need 3, explicit
-- demand 3. Possible totals: 0, 3, 5, 6, 8, 11.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_saneamiento_vinculos_preguntas()
RETURNS TABLE (
    prestamo_id  bigint,
    contraparte  text,
    saldo_pendiente numeric,
    moneda       text,
    puntos       smallint,
    criterio_1   boolean,
    criterio_2   boolean,
    criterio_3   boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    RETURN QUERY
    SELECT p.prestamo_id,
           p.entidad_nombre::text,
           p.saldo_actual,
           trim(p.moneda_iso)::text,
           p.puntos_vinculo,
           COALESCE(v1.seleccionado, false),
           COALESCE(v2.seleccionado, false),
           COALESCE(v3.seleccionado, false)
    FROM public.p_prestamos p
    LEFT JOIN public.p_prestamos_vinculos v1 ON v1.prestamo_id = p.prestamo_id AND v1.criterio = 1
    LEFT JOIN public.p_prestamos_vinculos v2 ON v2.prestamo_id = p.prestamo_id AND v2.criterio = 2
    LEFT JOIN public.p_prestamos_vinculos v3 ON v3.prestamo_id = p.prestamo_id AND v3.criterio = 3
    WHERE p.user_id = v_user_id
      AND p.tipo_flujo = 'debo'
      AND p.estado IN ('activo', 'pendiente', 'parcial')
      AND p.eliminado_at IS NULL
      AND COALESCE(p.saldo_actual, 0) > 0
      -- Only personal creditors answer these questions. Institutions never score.
      AND (p.tipo_deuda = 'personal' OR p.tipo_entidad IN ('familiar', 'tercero', 'otro'))
    ORDER BY p.puntos_vinculo DESC NULLS LAST, p.entidad_nombre;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_saneamiento_vinculos_responder(
    p_respuestas jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id bigint;
    v_item    jsonb;
    v_prestamo bigint;
    v_crit    integer;
    v_puntos  smallint;
    v_total   integer := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    IF p_respuestas IS NULL OR jsonb_typeof(p_respuestas) <> 'array' THEN
        RAISE EXCEPTION 'error_missing_required_fields';
    END IF;

    -- Replace this user's answers wholesale: the questionnaire is a snapshot, not a
    -- permanent classification, so re-asking must be able to clear a previous answer.
    DELETE FROM public.p_prestamos_vinculos WHERE user_id = v_user_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_respuestas) LOOP
        v_prestamo := (v_item->>'prestamo_id')::bigint;

        PERFORM 1 FROM public.p_prestamos
        WHERE prestamo_id = v_prestamo AND user_id = v_user_id
          AND tipo_flujo = 'debo' AND eliminado_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'error_debt_not_found';
        END IF;

        FOR v_crit IN SELECT (jsonb_array_elements_text(COALESCE(v_item->'criterios', '[]'::jsonb)))::integer LOOP
            IF v_crit NOT IN (1, 2, 3) THEN
                RAISE EXCEPTION 'error_invalid_criterion';
            END IF;

            INSERT INTO public.p_prestamos_vinculos (prestamo_id, user_id, criterio, seleccionado)
            VALUES (v_prestamo, v_user_id, v_crit, true)
            ON CONFLICT (prestamo_id, criterio)
            DO UPDATE SET seleccionado = true, actualizado_at = now();
        END LOOP;
    END LOOP;

    -- Recompute the stored score. Weights: criterion 3 = 5, criteria 1 and 2 = 3.
    UPDATE public.p_prestamos p
       SET puntos_vinculo = COALESCE((
               SELECT SUM(CASE WHEN v.criterio = 3 THEN 5 ELSE 3 END)::smallint
               FROM public.p_prestamos_vinculos v
               WHERE v.prestamo_id = p.prestamo_id AND v.user_id = v_user_id AND v.seleccionado
           ), 0)
     WHERE p.user_id = v_user_id
       AND EXISTS (SELECT 1 FROM public.p_prestamos_vinculos v
                   WHERE v.prestamo_id = p.prestamo_id AND v.user_id = v_user_id);

    GET DIAGNOSTICS v_total = ROW_COUNT;
    RETURN v_total;
END;
$$;

-- ---------------------------------------------------------------------------
-- T14 · Honest simulation
--
-- Always: current balance, proposed amount, projected balance.
-- Months and interest only when the schedule supports them. Nothing is ever
-- rendered as 0 for lack of information (§7.4, P14, P15).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_saneamiento_simular(
    p_prestamo_id bigint,
    p_monto       numeric
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id bigint;
    v_p       public.p_prestamos%ROWTYPE;
    v_pagado  numeric;
    v_saldo   numeric;
    v_nuevo   numeric;
    v_n_pend  integer;
    v_n_cubiertas integer;
    v_int_ok  boolean;
    v_int_sum numeric;
    v_result  jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;
    IF p_monto IS NULL OR p_monto <= 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;

    SELECT * INTO v_p FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_debt_not_found';
    END IF;

    v_saldo := COALESCE(v_p.saldo_actual, 0);
    v_nuevo := GREATEST(0, v_saldo - p_monto);

    SELECT COALESCE(SUM(monto_aplicado), 0) INTO v_pagado
    FROM public.p_prestamos_pagos
    WHERE prestamo_id = p_prestamo_id AND estado = 'activo';

    v_result := jsonb_build_object(
        'saldo_pendiente',  v_saldo,
        'monto_propuesto',  p_monto,
        'saldo_proyectado', v_nuevo,
        'moneda',           trim(v_p.moneda_iso)
    );

    -- Months are only meaningful against a real schedule.
    IF v_p.modalidad <> 'cuotas' THEN
        RETURN v_result || jsonb_build_object(
            'meses_restantes', NULL,
            'meses_ahorrados', NULL,
            'intereses_ahorrados', NULL,
            'motivo', 'sin_cronograma');
    END IF;

    WITH prog AS (
        SELECT c.cuota_id, c.monto_cuota, c.interes_componente,
               SUM(c.monto_cuota) OVER (ORDER BY c.fecha_vencimiento, c.numero_cuota
                                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado
        FROM public.p_prestamos_cuotas c
        WHERE c.prestamo_id = p_prestamo_id
    )
    SELECT count(*) FILTER (WHERE acumulado > v_pagado),
           count(*) FILTER (WHERE acumulado > v_pagado AND acumulado <= v_pagado + p_monto),
           bool_and(interes_componente IS NOT NULL) FILTER (WHERE acumulado > v_pagado AND acumulado <= v_pagado + p_monto),
           SUM(interes_componente) FILTER (WHERE acumulado > v_pagado AND acumulado <= v_pagado + p_monto)
      INTO v_n_pend, v_n_cubiertas, v_int_ok, v_int_sum
    FROM prog;

    v_result := v_result || jsonb_build_object(
        'meses_restantes', v_n_pend,
        'meses_ahorrados', v_n_cubiertas,
        'intereses_ahorrados',
            CASE WHEN v_n_cubiertas = 0 THEN 0
                 WHEN COALESCE(v_int_ok, false) THEN v_int_sum
                 ELSE NULL END,
        'motivo',
            CASE WHEN v_n_cubiertas = 0 THEN 'el_pago_no_cancela_cuotas_completas'
                 WHEN COALESCE(v_int_ok, false) THEN NULL
                 ELSE 'interes_por_cuota_no_informado' END);

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- T15 · Progress without a misleading percentage
--
-- "Pagado registrado en ORD" is what was actually paid inside ORD. The denominator
-- is what was pending when each loan entered ORD, never the original amount, so
-- editing the original no longer moves the percentage (P16, S19). The finish date
-- comes from the real schedule or is absent; the old +6-month fallback is gone.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_saneamiento_progreso()
RETURNS TABLE (
    moneda                text,
    prestamos_activos     integer,
    saldo_pendiente       numeric,
    pagado_registrado     numeric,
    porcentaje            numeric,
    fecha_fin_estimada    date,
    motivo_sin_fecha      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    RETURN QUERY
    WITH activos AS (
        SELECT trim(p.moneda_iso)::text AS moneda,
               p.saldo_actual,
               p.saldo_al_ingreso,
               p.monto_pagado_acumulado,
               p.modalidad,
               p.prestamo_id
        FROM public.p_prestamos p
        WHERE p.user_id = v_user_id
          AND p.tipo_flujo = 'debo'
          AND p.estado IN ('activo', 'pendiente', 'parcial')
          AND p.eliminado_at IS NULL
    ),
    tot AS (
        SELECT a.moneda,
               count(*)::integer AS n,
               COALESCE(SUM(a.saldo_actual), 0) AS pendiente,
               COALESCE(SUM(a.monto_pagado_acumulado), 0) AS pagado,
               COALESCE(SUM(a.saldo_al_ingreso), 0) AS base,
               bool_and(a.modalidad = 'cuotas') AS todas_cronograma
        FROM activos a
        GROUP BY a.moneda
    ),
    ultima AS (
        SELECT trim(p.moneda_iso)::text AS moneda, MAX(c.fecha_vencimiento) AS fecha
        FROM public.p_prestamos_cuotas c
        JOIN public.p_prestamos p ON p.prestamo_id = c.prestamo_id
        WHERE p.user_id = v_user_id
          AND p.tipo_flujo = 'debo'
          AND p.estado IN ('activo', 'pendiente', 'parcial')
          AND p.eliminado_at IS NULL
        GROUP BY trim(p.moneda_iso)
    )
    SELECT t.moneda, t.n, t.pendiente, t.pagado,
           CASE WHEN t.base > 0 THEN ROUND(t.pagado / t.base * 100, 2) ELSE NULL END,
           CASE WHEN t.todas_cronograma THEN u.fecha ELSE NULL END,
           CASE WHEN t.todas_cronograma THEN NULL ELSE 'no_todos_los_prestamos_tienen_cronograma' END
    FROM tot t
    LEFT JOIN ultima u ON u.moneda = t.moneda
    ORDER BY t.moneda;
END;
$$;

COMMENT ON FUNCTION public.fn_saneamiento_progreso IS
    'Progress per currency. The percentage is what was paid inside ORD over what was pending when each loan entered ORD, so pre-existing repayments are never counted as ORD operations. A finish date is returned only when every active loan has a schedule; there is no invented fallback.';

COMMIT;
