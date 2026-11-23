-- Loans / saneamiento rebuild — stage 2: read model and loan creation.
--
-- Covers the two RPC groups the screen needs before anything else can be built:
--   T3  fn_prestamos_resumen / fn_prestamos_listar / fn_prestamo_detalle
--   T4  fn_prestamo_crear (new loan and historical loan)
--
-- Rules enforced here and not in the UI:
--   * Debo and Me deben are never netted, and amounts in different currencies are
--     never summed nominally (§3.1, S3).
--   * A historical loan creates no cash movement (§2.2, AC-02).
--   * A loan that is born in ORD creates exactly one cash movement, never two
--     (§2.1: the loan record and the cash entry are one economic fact).
--   * Overdue is DERIVED from the schedule and the active payments, never stored
--     (§3.3, P9). "libre" can never be overdue (AC-10).

BEGIN;

-- ---------------------------------------------------------------------------
-- T3.1 — Derived due-status for one loan
--
-- exigible_vencido = accumulated obligations already due, minus accumulated
-- applicable payments, floored at zero. Payments are still applied freely to the
-- total balance (§4.1): this only asks how much of what was already due remains
-- unpaid, so it never forces a payment onto a specific installment.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamos_estado_vencimiento(p_prestamo_id bigint)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prestamo        public.p_prestamos%ROWTYPE;
    v_obligaciones    numeric := 0;
    v_pagos           numeric := 0;
    v_vencido         numeric;
    v_proximo         date;
BEGIN
    SELECT * INTO v_prestamo FROM public.p_prestamos WHERE prestamo_id = p_prestamo_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_prestamo.estado = 'eliminado' THEN
        RETURN 'eliminado';
    END IF;
    IF COALESCE(v_prestamo.saldo_actual, 0) = 0 THEN
        RETURN 'saldado';
    END IF;
    IF v_prestamo.modalidad = 'libre' THEN
        RETURN 'sin_fecha';
    END IF;

    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_obligaciones
    FROM public.p_prestamos_cuotas
    WHERE prestamo_id = p_prestamo_id AND fecha_vencimiento <= CURRENT_DATE;

    SELECT COALESCE(MIN(fecha_vencimiento), v_prestamo.proximo_vencimiento) INTO v_proximo
    FROM public.p_prestamos_cuotas
    WHERE prestamo_id = p_prestamo_id AND fecha_vencimiento > CURRENT_DATE;

    IF v_prestamo.modalidad = 'vencimiento_unico'
       AND v_prestamo.proximo_vencimiento IS NOT NULL
       AND v_prestamo.proximo_vencimiento <= CURRENT_DATE THEN
        v_obligaciones := COALESCE(v_prestamo.saldo_al_ingreso, 0);
        v_proximo := v_prestamo.proximo_vencimiento;
    END IF;

    SELECT COALESCE(SUM(monto_aplicado), 0) INTO v_pagos
    FROM public.p_prestamos_pagos
    WHERE prestamo_id = p_prestamo_id AND estado = 'activo';

    v_vencido := GREATEST(0, v_obligaciones - v_pagos);

    IF v_vencido > 0 THEN
        RETURN 'vencido';
    END IF;
    -- Seven days, the same window the existing notice mechanism already uses (P10).
    IF v_proximo IS NOT NULL AND v_proximo <= CURRENT_DATE + 7 THEN
        RETURN 'proximo_a_vencer';
    END IF;
    RETURN 'al_dia';
END;
$$;

-- ---------------------------------------------------------------------------
-- T3.2 — Summary: one row per direction and currency. Never netted.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamos_resumen()
RETURNS TABLE (
    direccion           text,
    moneda              text,
    pendiente           numeric,
    pagado_registrado   numeric,
    prestamos_activos   integer,
    prestamos_saldados  integer
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
    SELECT p.tipo_flujo::text,
           trim(p.moneda_iso)::text,
           COALESCE(SUM(p.saldo_actual)      FILTER (WHERE p.estado <> 'eliminado' AND p.estado <> 'archivado'), 0),
           COALESCE(SUM(p.monto_pagado_acumulado) FILTER (WHERE p.estado <> 'eliminado' AND p.estado <> 'archivado'), 0),
           COUNT(*) FILTER (WHERE p.estado = 'activo')::integer,
           COUNT(*) FILTER (WHERE p.estado = 'pagado')::integer
    FROM public.p_prestamos p
    WHERE p.user_id = v_user_id
      AND p.estado IN ('activo', 'pagado', 'pendiente', 'parcial')
    GROUP BY p.tipo_flujo, trim(p.moneda_iso)
    ORDER BY p.tipo_flujo, trim(p.moneda_iso);
END;
$$;

-- ---------------------------------------------------------------------------
-- T3.3 — List: active loans by direction, settled ones only on request
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamos_listar(
    p_direccion        text,
    p_incluir_saldados boolean DEFAULT false
)
RETURNS TABLE (
    prestamo_id        bigint,
    direccion          text,
    contraparte        text,
    nombre             text,
    moneda             text,
    saldo_pendiente    numeric,
    monto_original     numeric,
    pagado_registrado  numeric,
    estado             text,
    estado_vencimiento text,
    proximo_vencimiento date,
    tasa               numeric,
    tasa_informada     boolean,
    modalidad          text,
    tiene_cronograma   boolean
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
           EXISTS (SELECT 1 FROM public.p_prestamos_cuotas c WHERE c.prestamo_id = p.prestamo_id) AS tiene_cronograma
    FROM public.p_prestamos p
    WHERE p.user_id = v_user_id
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
$$;

-- ---------------------------------------------------------------------------
-- T3.4 — Detail: everything one loan is and has done
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamo_detalle(p_prestamo_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id bigint;
    v_p       public.p_prestamos%ROWTYPE;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    SELECT * INTO v_p
    FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_debt_not_found';
    END IF;

    RETURN jsonb_build_object(
        'prestamo_id',        v_p.prestamo_id,
        'direccion',          v_p.tipo_flujo,
        'contraparte',        v_p.entidad_nombre,
        'nombre',             COALESCE(v_p.nombre_prestamo, v_p.entidad_nombre),
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
$$;

-- ---------------------------------------------------------------------------
-- T4 — Create a loan: new (with its single cash movement) or historical (none)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamo_crear(
    p_direccion             text,
    p_contraparte           text,
    p_moneda                text,
    p_monto_original        numeric,
    p_modalidad             text,
    p_es_historico          boolean DEFAULT false,
    p_nombre                text    DEFAULT NULL,
    p_tipo_deuda            text    DEFAULT NULL,
    p_saldo_al_ingreso      numeric DEFAULT NULL,
    p_condicion_interes     text    DEFAULT 'desconocido',
    p_tasa_anual            numeric DEFAULT NULL,
    p_tasa_informada        boolean DEFAULT false,
    p_interes_total_acordado numeric DEFAULT NULL,
    p_proximo_vencimiento   date    DEFAULT NULL,
    p_billetera_id          bigint  DEFAULT NULL,
    p_monto_billetera       numeric DEFAULT NULL,
    p_moneda_billetera      text    DEFAULT NULL,
    p_fecha                 date    DEFAULT CURRENT_DATE,
    p_nota                  text    DEFAULT NULL,
    p_cuotas                jsonb   DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id   bigint;
    v_prestamo  bigint;
    v_saldo     numeric;
    v_total     numeric;
    v_caja_id   bigint;
    v_cat_id    bigint;
    v_ing_id    bigint;
    v_filas     integer;
    v_suma      numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    IF p_direccion IS NULL OR p_direccion NOT IN ('debo', 'me_deben') THEN
        RAISE EXCEPTION 'error_invalid_direction';
    END IF;
    IF p_contraparte IS NULL OR length(trim(p_contraparte)) = 0 THEN
        RAISE EXCEPTION 'error_missing_required_fields';
    END IF;
    IF p_moneda IS NULL OR length(trim(p_moneda)) <> 3 THEN
        RAISE EXCEPTION 'error_missing_required_fields';
    END IF;
    IF p_monto_original IS NULL OR p_monto_original <= 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;
    IF p_modalidad IS NULL OR p_modalidad NOT IN ('cuotas', 'vencimiento_unico', 'libre') THEN
        RAISE EXCEPTION 'error_invalid_modality';
    END IF;
    IF p_condicion_interes NOT IN ('ninguno', 'importe_final', 'tasa', 'desconocido') THEN
        RAISE EXCEPTION 'error_invalid_interest_condition';
    END IF;

    -- Pending balance at registration. For a historical loan it is the current
    -- balance, which is the whole point: it must not be inferred from the
    -- original amount.
    v_saldo := COALESCE(p_saldo_al_ingreso, p_monto_original);
    IF v_saldo < 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;

    v_total := p_monto_original
             + CASE WHEN p_condicion_interes = 'importe_final'
                    THEN COALESCE(p_interes_total_acordado, 0) ELSE 0 END;

    -- Schedule coherence: cuotas need a schedule, the other modalities refuse one.
    IF p_modalidad = 'cuotas' THEN
        IF p_cuotas IS NULL OR jsonb_array_length(p_cuotas) = 0 THEN
            RAISE EXCEPTION 'error_schedule_required';
        END IF;
    ELSE
        IF p_cuotas IS NOT NULL AND jsonb_array_length(p_cuotas) > 0 THEN
            RAISE EXCEPTION 'error_schedule_not_allowed';
        END IF;
    END IF;

    -- §2.2 / AC-02: a historical loan moves no money today.
    IF NOT COALESCE(p_es_historico, false) THEN
        IF p_billetera_id IS NULL OR p_monto_billetera IS NULL OR p_monto_billetera <= 0 THEN
            RAISE EXCEPTION 'error_missing_required_fields';
        END IF;

        PERFORM 1 FROM public.p_billeteras
        WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND activa = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'error_wallet_not_found';
        END IF;

        -- Receiving a loan is income; granting one is an expense. One movement,
        -- never two (§2.1). Wallet always in billetera_origen_id, because the
        -- deployed balance trigger reads that column for income AND expense.
        IF p_direccion = 'debo' THEN
            v_ing_id := public.fn_prestamos_ensure_ingreso(v_user_id, 'loan_received_income_name');

            INSERT INTO public.p_caja
                (user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
                 fecha, moneda, cuenta_ingreso_id, detalle, metadata)
            VALUES
                (v_user_id, 'income', p_billetera_id, 0, p_monto_billetera,
                 COALESCE(p_fecha, CURRENT_DATE),
                 COALESCE(NULLIF(trim(p_moneda_billetera), ''), trim(p_moneda)),
                 v_ing_id, COALESCE(p_nota, 'prestamo_recibido'),
                 jsonb_build_object('origen', 'prestamos', 'evento', 'alta_prestamo'))
            RETURNING p_caja_id INTO v_caja_id;
        ELSE
            v_cat_id := public.fn_prestamos_ensure_categoria_egreso(v_user_id, 'cat_loans_granted');

            INSERT INTO public.p_caja
                (user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
                 fecha, moneda, estructura_egreso_id, detalle, metadata)
            VALUES
                (v_user_id, 'expense', p_billetera_id, p_monto_billetera, 0,
                 COALESCE(p_fecha, CURRENT_DATE),
                 COALESCE(NULLIF(trim(p_moneda_billetera), ''), trim(p_moneda)),
                 v_cat_id, COALESCE(p_nota, 'prestamo_otorgado'),
                 jsonb_build_object('origen', 'prestamos', 'evento', 'alta_prestamo'))
            RETURNING p_caja_id INTO v_caja_id;
        END IF;
    END IF;

    INSERT INTO public.p_prestamos
        (user_id, entidad_nombre, nombre_prestamo, tipo_deuda, tipo_flujo,
         moneda_iso, monto_original, monto_total_deuda, saldo_actual,
         saldo_al_ingreso, monto_pagado_acumulado, modalidad, condicion_interes,
         interes_total_acordado, tasa_anual_tna, tasa_informada,
         proximo_vencimiento, estado, p_caja_id)
    VALUES
        (v_user_id, trim(p_contraparte), COALESCE(p_nombre, trim(p_contraparte)),
         p_tipo_deuda, p_direccion,
         trim(p_moneda), p_monto_original, v_total, v_saldo,
         v_saldo, 0, p_modalidad, p_condicion_interes,
         p_interes_total_acordado, COALESCE(p_tasa_anual, 0), COALESCE(p_tasa_informada, false),
         p_proximo_vencimiento, 'activo', v_caja_id)
    RETURNING prestamo_id INTO v_prestamo;

    IF p_modalidad = 'cuotas' THEN
        INSERT INTO public.p_prestamos_cuotas
            (prestamo_id, user_id, numero_cuota, fecha_vencimiento, monto_cuota,
             capital_componente, interes_componente, moneda)
        SELECT v_prestamo,
               v_user_id,
               COALESCE((e.item->>'numero_cuota')::integer, e.ord::integer),
               (e.item->>'fecha_vencimiento')::date,
               (e.item->>'monto_cuota')::numeric,
               NULLIF(e.item->>'capital_componente', '')::numeric,
               NULLIF(e.item->>'interes_componente', '')::numeric,
               trim(p_moneda)
        FROM jsonb_array_elements(p_cuotas) WITH ORDINALITY AS e(item, ord);

        GET DIAGNOSTICS v_filas = ROW_COUNT;
        IF v_filas = 0 THEN
            RAISE EXCEPTION 'error_schedule_required';
        END IF;

        SELECT COALESCE(SUM(monto_cuota), 0) INTO v_suma
        FROM public.p_prestamos_cuotas WHERE prestamo_id = v_prestamo;
        IF v_suma <= 0 THEN
            RAISE EXCEPTION 'error_schedule_required';
        END IF;
    END IF;

    RETURN v_prestamo;
END;
$$;

COMMENT ON FUNCTION public.fn_prestamo_crear IS
    'Creates a loan. A new loan writes exactly one cash movement (income when received, expense when granted); a historical loan writes none and only records the current pending balance, so past cash flows are never replayed.';

COMMIT;
