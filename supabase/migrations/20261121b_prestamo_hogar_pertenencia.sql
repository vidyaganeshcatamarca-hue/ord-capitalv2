-- 20261121b_prestamo_hogar_pertenencia.sql
--
-- T29 / S30, first half: the write side may only attach a loan to a household the
-- caller belongs to.
--
-- Until now p_hogar_id was checked by the foreign key alone, and a foreign key only
-- proves that the household EXISTS. Any authenticated caller could therefore write
-- hogar_id of a household they are not a member of, which turns co-ownership into a
-- way to hand a private loan to a stranger's household — or to dump one's own debt
-- into somebody else's picture.
--
-- The guard requires a row in p_hogar_participantes for the pair
-- (hogar_id, caller). The error key error_hogar_no_pertenece already exists in
-- src/locales/{es,en,pt}.ts; nothing new is added to the message catalogue.
--
-- In fn_prestamo_editar the guard is applied to the value that will actually be
-- WRITTEN, not to the raw argument. A call that leaves the household untouched (null
-- argument without the p_limpiar_hogar flag) writes the stored value back and needs
-- no guard; a call that clears the household writes null and needs no guard either.
--
-- Both signatures are unchanged by this migration, so CREATE OR REPLACE keeps the
-- existing ACL, ownership and OID. Nothing else in either body moves.

BEGIN;

DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('fn_prestamo_crear', 'fn_prestamo_editar');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'se esperaban 2 funciones (crear, editar) y hay %', v_count;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. fn_prestamo_crear — guard before anything is written
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamo_crear(
    p_direccion            text,
    p_contraparte          text,
    p_moneda               text,
    p_monto_original       numeric,
    p_modalidad            text,
    p_es_historico         boolean DEFAULT false,
    p_nombre               text    DEFAULT NULL,
    p_tipo_deuda           text    DEFAULT NULL,
    p_saldo_al_ingreso     numeric DEFAULT NULL,
    p_condicion_interes    text    DEFAULT 'desconocido',
    p_tasa_anual           numeric DEFAULT NULL,
    p_tasa_informada       boolean DEFAULT false,
    p_interes_total_acordado numeric DEFAULT NULL,
    p_proximo_vencimiento  date    DEFAULT NULL,
    p_billetera_id         bigint  DEFAULT NULL,
    p_monto_billetera      numeric DEFAULT NULL,
    p_moneda_billetera     text    DEFAULT NULL,
    p_fecha                date    DEFAULT CURRENT_DATE,
    p_nota                 text    DEFAULT NULL,
    p_cuotas               jsonb   DEFAULT NULL,
    p_hogar_id             bigint  DEFAULT NULL,
    p_contraparte_user_id  bigint  DEFAULT NULL
)
RETURNS bigint
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

    -- p_hogar_id marks co-ownership by a household, so the caller must be one of its
    -- members. The foreign key only proves the household exists, never that the caller
    -- belongs to it.
    IF p_hogar_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.p_hogar_participantes hp
        WHERE hp.hogar_id = p_hogar_id AND hp.user_id = v_user_id
    ) THEN
        RAISE EXCEPTION '{"key": "error_hogar_no_pertenece", "params": {}}';
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

    -- hogar_id marks co-ownership by a household; contraparte_user_id names one
    -- concrete counterparty. They are independent and either may be null.
    INSERT INTO public.p_prestamos
        (user_id, entidad_nombre, nombre_prestamo, tipo_deuda, tipo_flujo,
         moneda_iso, monto_original, monto_total_deuda, saldo_actual,
         saldo_al_ingreso, monto_pagado_acumulado, modalidad, condicion_interes,
         interes_total_acordado, tasa_anual_tna, tasa_informada,
         proximo_vencimiento, estado, p_caja_id, hogar_id, contraparte_user_id)
    VALUES
        (v_user_id, trim(p_contraparte), COALESCE(p_nombre, trim(p_contraparte)),
         p_tipo_deuda, p_direccion,
         trim(p_moneda), p_monto_original, v_total, v_saldo,
         v_saldo, 0, p_modalidad, p_condicion_interes,
         p_interes_total_acordado, COALESCE(p_tasa_anual, 0), COALESCE(p_tasa_informada, false),
         p_proximo_vencimiento, 'activo', v_caja_id, p_hogar_id, p_contraparte_user_id)
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

COMMENT ON FUNCTION public.fn_prestamo_crear(
    text, text, text, numeric, text, boolean, text, text, numeric, text, numeric,
    boolean, numeric, date, bigint, numeric, text, date, text, jsonb, bigint, bigint
) IS
    'Registers a loan and, unless it is historical, its single cash movement. p_hogar_id makes the row co-owned by that household and requires the caller to be one of its members; p_contraparte_user_id names one concrete counterparty. Either may be null.';

-- ---------------------------------------------------------------------------
-- 2. fn_prestamo_editar — guard on the value that will actually be written
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamo_editar(
    p_prestamo_id            bigint,
    p_contraparte            text    DEFAULT NULL,
    p_nombre                 text    DEFAULT NULL,
    p_tipo_deuda             text    DEFAULT NULL,
    p_monto_original         numeric DEFAULT NULL,
    p_condicion_interes      text    DEFAULT NULL,
    p_tasa_anual             numeric DEFAULT NULL,
    p_tasa_informada         boolean DEFAULT NULL,
    p_interes_total_acordado numeric DEFAULT NULL,
    p_proximo_vencimiento    date    DEFAULT NULL,
    p_limpiar_vencimiento    boolean DEFAULT false,
    p_saldo_al_ingreso       numeric DEFAULT NULL,
    p_modalidad              text    DEFAULT NULL,
    p_cuotas                 jsonb   DEFAULT NULL,
    p_limpiar_interes        boolean DEFAULT false,
    p_hogar_id               bigint  DEFAULT NULL,
    p_contraparte_user_id    bigint  DEFAULT NULL,
    p_limpiar_hogar          boolean DEFAULT false,
    p_limpiar_contraparte    boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id   bigint;
    v_prestamo  public.p_prestamos%ROWTYPE;
    v_pagos     integer;
    v_total     numeric;
    v_modalidad text;
    v_limpiar   boolean;
    v_condicion text;
    v_hogar     bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    SELECT * INTO v_prestamo
    FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_debt_not_found';
    END IF;
    IF v_prestamo.estado = 'eliminado' THEN
        RAISE EXCEPTION 'error_debt_not_found';
    END IF;

    -- The household this call would end up writing. Clearing wins over the argument,
    -- exactly as the UPDATE below does, so the guard judges the written value and not
    -- the raw parameter: a call that leaves the household untouched, or clears it,
    -- writes no foreign household and needs no membership.
    v_hogar := CASE WHEN COALESCE(p_limpiar_hogar, false) THEN NULL
                    ELSE COALESCE(p_hogar_id, v_prestamo.hogar_id) END;

    IF v_hogar IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.p_hogar_participantes hp
          WHERE hp.hogar_id = v_hogar AND hp.user_id = v_user_id
    ) THEN
        RAISE EXCEPTION '{"key": "error_hogar_no_pertenece", "params": {}}';
    END IF;

    SELECT count(*) INTO v_pagos
    FROM public.p_prestamos_pagos
    WHERE prestamo_id = p_prestamo_id AND estado = 'activo';

    IF p_condicion_interes IS NOT NULL
       AND p_condicion_interes NOT IN ('ninguno', 'importe_final', 'tasa', 'desconocido') THEN
        RAISE EXCEPTION 'error_invalid_interest_condition';
    END IF;
    IF p_modalidad IS NOT NULL AND p_modalidad NOT IN ('cuotas', 'vencimiento_unico', 'libre') THEN
        RAISE EXCEPTION 'error_invalid_modality';
    END IF;
    IF p_saldo_al_ingreso IS NOT NULL AND p_saldo_al_ingreso < 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;

    v_modalidad := COALESCE(p_modalidad, v_prestamo.modalidad);

    -- Clearing wins over the COALESCE, except for the condition itself: a caller
    -- that passes one in the same call keeps it.
    v_limpiar   := COALESCE(p_limpiar_interes, false);
    v_condicion := CASE WHEN v_limpiar
                        THEN COALESCE(p_condicion_interes, 'ninguno')
                        ELSE COALESCE(p_condicion_interes, v_prestamo.condicion_interes) END;

    -- The schedule can only be replaced together with the modality that owns it.
    IF v_pagos > 0 AND p_modalidad IS NOT NULL AND p_modalidad <> v_prestamo.modalidad THEN
        RAISE EXCEPTION 'error_cannot_change_modality_with_payments';
    END IF;

    IF p_cuotas IS NOT NULL THEN
        IF v_modalidad <> 'cuotas' THEN
            RAISE EXCEPTION 'error_schedule_not_allowed';
        END IF;
        DELETE FROM public.p_prestamos_cuotas WHERE prestamo_id = p_prestamo_id;
        INSERT INTO public.p_prestamos_cuotas
            (prestamo_id, user_id, numero_cuota, fecha_vencimiento, monto_cuota,
             capital_componente, interes_componente, moneda)
        SELECT p_prestamo_id,
               v_user_id,
               COALESCE((e.item->>'numero_cuota')::integer, e.ord::integer),
               (e.item->>'fecha_vencimiento')::date,
               (e.item->>'monto_cuota')::numeric,
               NULLIF(e.item->>'capital_componente', '')::numeric,
               NULLIF(e.item->>'interes_componente', '')::numeric,
               trim(v_prestamo.moneda_iso)
        FROM jsonb_array_elements(p_cuotas) WITH ORDINALITY AS e(item, ord);
    ELSIF v_modalidad = 'cuotas' AND p_modalidad IS NOT NULL AND v_prestamo.modalidad <> 'cuotas' THEN
        RAISE EXCEPTION 'error_schedule_required';
    END IF;

    -- When the interest is being cleared the agreed amount no longer exists, so it
    -- must not be added to the total debt either.
    v_total := COALESCE(p_monto_original, v_prestamo.monto_original)
             + CASE WHEN v_condicion = 'importe_final'
                    THEN CASE WHEN v_limpiar
                              THEN COALESCE(p_interes_total_acordado, 0)
                              ELSE COALESCE(p_interes_total_acordado, v_prestamo.interes_total_acordado, 0) END
                    ELSE 0 END;

    -- p_limpiar_hogar / p_limpiar_contraparte follow the same convention the file
    -- already uses for p_limpiar_vencimiento and p_limpiar_interes: null means leave
    -- as is, and an explicit boolean is the only way to clear a value that was set.
    UPDATE public.p_prestamos
       SET entidad_nombre        = COALESCE(NULLIF(trim(p_contraparte), ''), entidad_nombre),
           nombre_prestamo       = COALESCE(p_nombre, nombre_prestamo),
           tipo_deuda            = COALESCE(p_tipo_deuda, tipo_deuda),
           monto_original        = COALESCE(p_monto_original, monto_original),
           monto_total_deuda     = v_total,
           condicion_interes     = v_condicion,
           tasa_anual_tna        = CASE WHEN v_limpiar THEN NULL
                                        ELSE COALESCE(p_tasa_anual, tasa_anual_tna) END,
           tasa_informada        = CASE WHEN v_limpiar THEN false
                                        ELSE COALESCE(p_tasa_informada, tasa_informada) END,
           interes_total_acordado = CASE WHEN v_limpiar THEN NULL
                                         ELSE COALESCE(p_interes_total_acordado, interes_total_acordado) END,
           proximo_vencimiento   = CASE WHEN COALESCE(p_limpiar_vencimiento, false) THEN NULL
                                        ELSE COALESCE(p_proximo_vencimiento, proximo_vencimiento) END,
           saldo_al_ingreso      = COALESCE(p_saldo_al_ingreso, saldo_al_ingreso),
           modalidad             = v_modalidad,
           hogar_id              = v_hogar,
           contraparte_user_id   = CASE WHEN COALESCE(p_limpiar_contraparte, false) THEN NULL
                                        ELSE COALESCE(p_contraparte_user_id, contraparte_user_id) END
     WHERE prestamo_id = p_prestamo_id;

    -- Recompute because saldo_al_ingreso may have changed. No cash, no new
    -- operation: editing conditions is not a payment (§2.4).
    PERFORM public.fn_prestamos_aplicar_saldo(p_prestamo_id);
END;
$$;

COMMENT ON FUNCTION public.fn_prestamo_editar(
    bigint, text, text, text, numeric, text, numeric, boolean, numeric, date, boolean,
    numeric, text, jsonb, boolean, bigint, bigint, boolean, boolean
) IS
    'Edits a loan''s conditions. Optional columns use COALESCE so an omitted argument keeps its value; p_limpiar_interes, p_limpiar_vencimiento, p_limpiar_hogar and p_limpiar_contraparte are the explicit way to remove a value that was set. Writing a non-null hogar_id requires the caller to be a member of that household.';

COMMIT;
