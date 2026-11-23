CREATE OR REPLACE FUNCTION public.fn_prestamo_crear(p_direccion text, p_contraparte text, p_moneda text, p_monto_original numeric, p_modalidad text, p_es_historico boolean DEFAULT false, p_nombre text DEFAULT NULL::text, p_tipo_deuda text DEFAULT NULL::text, p_saldo_al_ingreso numeric DEFAULT NULL::numeric, p_condicion_interes text DEFAULT 'desconocido'::text, p_tasa_anual numeric DEFAULT NULL::numeric, p_tasa_informada boolean DEFAULT false, p_interes_total_acordado numeric DEFAULT NULL::numeric, p_proximo_vencimiento date DEFAULT NULL::date, p_billetera_id bigint DEFAULT NULL::bigint, p_monto_billetera numeric DEFAULT NULL::numeric, p_moneda_billetera text DEFAULT NULL::text, p_fecha date DEFAULT CURRENT_DATE, p_nota text DEFAULT NULL::text, p_cuotas jsonb DEFAULT NULL::jsonb, p_hogar_id bigint DEFAULT NULL::bigint, p_contraparte_user_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
