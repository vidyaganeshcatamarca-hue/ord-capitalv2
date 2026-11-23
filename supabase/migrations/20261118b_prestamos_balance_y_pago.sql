-- Loans / saneamiento rebuild — stage 1b: balance authority and the payment RPC.
--
-- Closes the two defects confirmed in the deployed bodies:
--   1. fn_registrar_pago_extra_deuda inserts the p_caja row BEFORE the UPDATE and
--      has no `IF NOT FOUND`, so a bogus id debits the wallet and reports success
--      while no loan is reduced.
--   2. The overpayment is clamped with GREATEST(0, saldo - monto), so the excess
--      silently disappears: the wallet is charged in full and the difference is
--      never recorded.
--
-- Design rule for this file: the loan balance is DERIVED, never hand-maintained.
-- A trigger recomputes saldo_actual and monto_pagado_acumulado from the surviving
-- payment rows, so every path — including deleting a p_caja from the Home screen —
-- leaves the loan coherent without depending on each RPC remembering to do it.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Idempotency for the module's system categories and income sources
--
--    p_estructuras_egresos has no UNIQUE(user_id, nombre_cuenta) and p_ingresos
--    has no unique key at all, so "create it if missing" could race into
--    duplicates. These partial indexes make the name itself the stable identity,
--    which is also what the spec asks for instead of ILIKE matching.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS ux_estructuras_egresos_cat_debt_payment
    ON public.p_estructuras_egresos (user_id)
    WHERE nombre_cuenta = 'cat_debt_payment' AND padre_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_estructuras_egresos_cat_loans_granted
    ON public.p_estructuras_egresos (user_id)
    WHERE nombre_cuenta = 'cat_loans_granted' AND padre_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_p_ingresos_loan_received
    ON public.p_ingresos (user_id) WHERE nombre = 'loan_received_income_name';

CREATE UNIQUE INDEX IF NOT EXISTS ux_p_ingresos_loan_collection
    ON public.p_ingresos (user_id) WHERE nombre = 'loan_collection_income_name';

-- ---------------------------------------------------------------------------
-- 2. Helpers that materialise a system category / income source on demand
--
--    Looked up by exact key, never by ILIKE. tipo_cupo is 'need' for both: paying
--    a debt and granting a loan are committed outflows, and 'investment' is
--    reserved by a partial unique index plus a blocking trigger.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamos_ensure_categoria_egreso(
    p_user_id  bigint,
    p_key      text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id bigint;
    v_icono text;
    v_color text;
BEGIN
    SELECT estructura_id INTO v_id
    FROM public.p_estructuras_egresos
    WHERE user_id = p_user_id AND nombre_cuenta = p_key AND padre_id IS NULL;

    IF FOUND THEN
        RETURN v_id;
    END IF;

    v_icono := CASE p_key
                   WHEN 'cat_debt_payment'  THEN '💳'
                   WHEN 'cat_loans_granted' THEN '🤝'
                   ELSE '🔹'
               END;
    v_color := CASE p_key
                   WHEN 'cat_debt_payment'  THEN '#EF4444'
                   WHEN 'cat_loans_granted' THEN '#0EA5E9'
                   ELSE '#64748B'
               END;

    INSERT INTO public.p_estructuras_egresos
        (user_id, nombre_cuenta, descripcion, tipo_cupo, icono, color, padre_id)
    VALUES
        (p_user_id, p_key, p_key, 'need', v_icono, v_color, NULL)
    RETURNING estructura_id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_prestamos_ensure_ingreso(
    p_user_id bigint,
    p_key     text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id bigint;
    v_icono text;
    v_color text;
BEGIN
    SELECT producto_id INTO v_id
    FROM public.p_ingresos
    WHERE user_id = p_user_id AND nombre = p_key;

    IF FOUND THEN
        RETURN v_id;
    END IF;

    v_icono := CASE p_key
                   WHEN 'loan_received_income_name'   THEN '💵'
                   WHEN 'loan_collection_income_name' THEN '💶'
                   ELSE '💰'
               END;
    v_color := CASE p_key
                   WHEN 'loan_received_income_name'   THEN '#22C55E'
                   WHEN 'loan_collection_income_name' THEN '#10B981'
                   ELSE '#22C55E'
               END;

    INSERT INTO public.p_ingresos
        (user_id, nombre, descripcion, icono, color, es_pasivo, activo)
    VALUES
        (p_user_id, p_key, p_key, v_icono, v_color, false, true)
    RETURNING producto_id INTO v_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. The balance authority
--
--    Recomputes from the surviving active payment rows. "Saldado" is 'pagado',
--    which the deployed CHECK already allowed. A correction that reopens a
--    settled loan puts it back to 'activo'. An 'eliminado' loan is never revived.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamos_recalcular_saldo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prestamo_id bigint;
    v_base        numeric;
    v_estado      text;
    v_aplicado    numeric;
    v_saldo       numeric;
BEGIN
    v_prestamo_id := COALESCE(NEW.prestamo_id, OLD.prestamo_id);

    SELECT COALESCE(saldo_al_ingreso, 0), estado
      INTO v_base, v_estado
    FROM public.p_prestamos
    WHERE prestamo_id = v_prestamo_id;

    IF NOT FOUND OR v_estado = 'eliminado' THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(monto_aplicado), 0)
      INTO v_aplicado
    FROM public.p_prestamos_pagos
    WHERE prestamo_id = v_prestamo_id AND estado = 'activo';

    v_saldo := GREATEST(0, v_base - v_aplicado);

    UPDATE public.p_prestamos
       SET saldo_actual           = v_saldo,
           monto_pagado_acumulado = v_aplicado,
           estado = CASE
                        WHEN v_saldo = 0 AND estado IN ('activo', 'pendiente', 'parcial') THEN 'pagado'
                        WHEN v_saldo > 0 AND estado = 'pagado' THEN 'activo'
                        ELSE estado
                    END
     WHERE prestamo_id = v_prestamo_id;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_prestamos_pagos_recalcular ON public.p_prestamos_pagos;
CREATE TRIGGER tr_prestamos_pagos_recalcular
    AFTER INSERT OR UPDATE OR DELETE ON public.p_prestamos_pagos
    FOR EACH ROW EXECUTE FUNCTION public.fn_prestamos_recalcular_saldo();

-- ---------------------------------------------------------------------------
-- 4. Register a payment (Debo) or a collection (Me deben)
--
--    Validates first and writes second. The p_caja insert happens only after
--    every precondition passed, which is what the old RPC got backwards.
--
--    Wallet placement: fn_actualizar_saldo_billetera_integral credits and debits
--    billetera_origen_id for BOTH 'income' and 'expense'; only 'transfer' reads
--    billetera_destino_id. So the wallet always goes in billetera_origen_id here.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamo_registrar_pago(
    p_prestamo_id         bigint,
    p_billetera_id        bigint,
    p_monto_billetera     numeric,
    p_moneda_billetera    text,
    p_monto_aplicado      numeric,
    p_fecha               date    DEFAULT CURRENT_DATE,
    p_nota                text    DEFAULT NULL,
    p_confirmar_excedente boolean DEFAULT false,
    p_capital_aplicado    numeric DEFAULT NULL,
    p_interes_aplicado    numeric DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id        bigint;
    v_prestamo       public.p_prestamos%ROWTYPE;
    v_direccion      text;
    v_saldo          numeric;
    v_aplicado       numeric;
    v_excedente      numeric;
    v_moneda_prestamo text;
    v_caja_id        bigint;
    v_pago_id        bigint;
    v_cat_id         bigint;
    v_ingreso_id     bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    IF p_monto_billetera IS NULL OR p_monto_billetera <= 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;
    IF p_monto_aplicado IS NULL OR p_monto_aplicado < 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;
    IF p_moneda_billetera IS NULL OR length(trim(p_moneda_billetera)) = 0 THEN
        RAISE EXCEPTION 'error_missing_required_fields';
    END IF;

    -- Lock the loan so two concurrent payments cannot both read the same balance.
    SELECT * INTO v_prestamo
    FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_debt_not_found';
    END IF;

    IF v_prestamo.estado NOT IN ('activo', 'pendiente', 'parcial', 'pagado') THEN
        RAISE EXCEPTION 'error_debt_not_payable';
    END IF;

    PERFORM 1
    FROM public.p_billeteras
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND activa = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_wallet_not_found';
    END IF;

    v_direccion       := CASE WHEN v_prestamo.tipo_flujo = 'me_deben' THEN 'cobro' ELSE 'pago' END;
    v_moneda_prestamo := trim(v_prestamo.moneda_iso);
    v_saldo           := COALESCE(v_prestamo.saldo_actual, 0);

    -- Overpayment: never clamped away, never inferred. Requires an explicit yes.
    IF p_monto_aplicado > v_saldo THEN
        v_excedente := p_monto_aplicado - v_saldo;
        IF NOT COALESCE(p_confirmar_excedente, false) THEN
            RAISE EXCEPTION 'error_overpayment_confirmation_required';
        END IF;
        v_aplicado := v_saldo;
    ELSE
        v_aplicado  := p_monto_aplicado;
        v_excedente := NULL;
    END IF;

    -- The cash leg. 'expense' for a payment, 'income' for a collection, each with
    -- its own single category. Whole amount, once, in billetera_origen_id.
    IF v_direccion = 'pago' THEN
        v_cat_id := public.fn_prestamos_ensure_categoria_egreso(v_user_id, 'cat_debt_payment');

        INSERT INTO public.p_caja
            (user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
             fecha, moneda, estructura_egreso_id, detalle, metadata)
        VALUES
            (v_user_id, 'expense', p_billetera_id, p_monto_billetera, 0,
             COALESCE(p_fecha, CURRENT_DATE), p_moneda_billetera, v_cat_id,
             COALESCE(p_nota, 'prestamo_pago'),
             jsonb_build_object('prestamo_id', p_prestamo_id, 'origen', 'prestamos'))
        RETURNING p_caja_id INTO v_caja_id;
    ELSE
        v_ingreso_id := public.fn_prestamos_ensure_ingreso(v_user_id, 'loan_collection_income_name');

        INSERT INTO public.p_caja
            (user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
             fecha, moneda, cuenta_ingreso_id, detalle, metadata)
        VALUES
            (v_user_id, 'income', p_billetera_id, 0, p_monto_billetera,
             COALESCE(p_fecha, CURRENT_DATE), p_moneda_billetera, v_ingreso_id,
             COALESCE(p_nota, 'prestamo_cobro'),
             jsonb_build_object('prestamo_id', p_prestamo_id, 'origen', 'prestamos'))
        RETURNING p_caja_id INTO v_caja_id;
    END IF;

    INSERT INTO public.p_prestamos_pagos
        (prestamo_id, user_id, p_caja_id, direccion, fecha,
         billetera_id, moneda_billetera, monto_billetera,
         moneda_prestamo, monto_aplicado,
         capital_aplicado, interes_aplicado, interes_excedente, nota)
    VALUES
        (p_prestamo_id, v_user_id, v_caja_id, v_direccion, COALESCE(p_fecha, CURRENT_DATE),
         p_billetera_id, p_moneda_billetera, p_monto_billetera,
         v_moneda_prestamo, v_aplicado,
         p_capital_aplicado, p_interes_aplicado, v_excedente, p_nota)
    RETURNING pago_id INTO v_pago_id;

    -- The trigger recomputes saldo_actual, monto_pagado_acumulado and 'pagado'.

    RETURN v_pago_id;
END;
$$;

COMMENT ON FUNCTION public.fn_prestamo_registrar_pago IS
    'Registers a payment (loan in Debo) or a collection (loan in Me deben). The wallet amount and the amount applied to the loan are independent, so a cross-currency operation never relies on an invented exchange rate. An overpayment requires p_confirmar_excedente and stores the excess as previously unregistered interest in a single operation.';

COMMIT;
