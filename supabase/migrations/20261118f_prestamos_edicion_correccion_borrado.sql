-- Loans / saneamiento rebuild — stage 5: T5 edit, T8 correction, T10 logical delete.
--
-- Three rules from the spec drive this file:
--   §2.4 / S11  editing conditions never alters recorded operations retroactively
--               and never creates a cash movement by itself.
--   AC-09       a wrong amount is corrected on the ORIGINAL operation, adjusting the
--               wallet and the balance, without duplicating income or expense.
--   §3.3 / S8   a settled loan can be removed from the visible history, without
--               deleting or reverting real cash movements.
--
-- One refactor first: the balance arithmetic moves out of the trigger into
-- fn_prestamos_aplicar_saldo, so the trigger and the edit RPC share one
-- implementation instead of two copies that can drift.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Single implementation of the balance arithmetic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamos_aplicar_saldo(p_prestamo_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_base     numeric;
    v_estado   text;
    v_aplicado numeric;
    v_saldo    numeric;
BEGIN
    SELECT COALESCE(saldo_al_ingreso, 0), estado
      INTO v_base, v_estado
    FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id;

    IF NOT FOUND OR v_estado = 'eliminado' THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(monto_aplicado), 0)
      INTO v_aplicado
    FROM public.p_prestamos_pagos
    WHERE prestamo_id = p_prestamo_id AND estado = 'activo';

    v_saldo := GREATEST(0, v_base - v_aplicado);

    UPDATE public.p_prestamos
       SET saldo_actual           = v_saldo,
           monto_pagado_acumulado = v_aplicado,
           estado = CASE
                        WHEN v_saldo = 0 AND estado IN ('activo', 'pendiente', 'parcial') THEN 'pagado'
                        WHEN v_saldo > 0 AND estado = 'pagado' THEN 'activo'
                        ELSE estado
                    END
     WHERE prestamo_id = p_prestamo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_prestamos_recalcular_saldo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.fn_prestamos_aplicar_saldo(COALESCE(NEW.prestamo_id, OLD.prestamo_id));
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- T5 · Edit conditions
--
-- Null means "leave as is", which is what lets the UI send only what the user
-- touched. Clearing the due date needs its own flag because null is already
-- taken.
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
    p_cuotas                 jsonb   DEFAULT NULL
) RETURNS void
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

    v_total := COALESCE(p_monto_original, v_prestamo.monto_original)
             + CASE WHEN COALESCE(p_condicion_interes, v_prestamo.condicion_interes) = 'importe_final'
                    THEN COALESCE(p_interes_total_acordado, v_prestamo.interes_total_acordado, 0)
                    ELSE 0 END;

    UPDATE public.p_prestamos
       SET entidad_nombre        = COALESCE(NULLIF(trim(p_contraparte), ''), entidad_nombre),
           nombre_prestamo       = COALESCE(p_nombre, nombre_prestamo),
           tipo_deuda            = COALESCE(p_tipo_deuda, tipo_deuda),
           monto_original        = COALESCE(p_monto_original, monto_original),
           monto_total_deuda     = v_total,
           condicion_interes     = COALESCE(p_condicion_interes, condicion_interes),
           tasa_anual_tna        = COALESCE(p_tasa_anual, tasa_anual_tna),
           tasa_informada        = COALESCE(p_tasa_informada, tasa_informada),
           interes_total_acordado = COALESCE(p_interes_total_acordado, interes_total_acordado),
           proximo_vencimiento   = CASE WHEN COALESCE(p_limpiar_vencimiento, false) THEN NULL
                                        ELSE COALESCE(p_proximo_vencimiento, proximo_vencimiento) END,
           saldo_al_ingreso      = COALESCE(p_saldo_al_ingreso, saldo_al_ingreso),
           modalidad             = v_modalidad
     WHERE prestamo_id = p_prestamo_id;

    -- Recompute because saldo_al_ingreso may have changed. No cash, no new
    -- operation: editing conditions is not a payment (§2.4).
    PERFORM public.fn_prestamos_aplicar_saldo(p_prestamo_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- T8 · Correct the amount of an already recorded operation (AC-09)
--
-- The original operation is edited in place. The cash row is adjusted, so the
-- wallet trigger reverts the old value and applies the new one: the net effect is
-- exactly the difference, with no second movement and no duplicated expense.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamo_corregir_pago(
    p_pago_id             bigint,
    p_billetera_id        bigint,
    p_monto_billetera     numeric,
    p_moneda_billetera    text,
    p_monto_aplicado      numeric,
    p_fecha               date    DEFAULT NULL,
    p_nota                text    DEFAULT NULL,
    p_confirmar_excedente boolean DEFAULT false,
    p_capital_aplicado    numeric DEFAULT NULL,
    p_interes_aplicado    numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id   bigint;
    v_pago      public.p_prestamos_pagos%ROWTYPE;
    v_prestamo  public.p_prestamos%ROWTYPE;
    v_otros     numeric;
    v_base      numeric;
    v_aplicado  numeric;
    v_excedente numeric;
    v_tipo      text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    IF p_monto_billetera IS NULL OR p_monto_billetera <= 0
       OR p_monto_aplicado IS NULL OR p_monto_aplicado < 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;
    IF p_moneda_billetera IS NULL OR length(trim(p_moneda_billetera)) = 0 THEN
        RAISE EXCEPTION 'error_missing_required_fields';
    END IF;

    SELECT * INTO v_pago
    FROM public.p_prestamos_pagos
    WHERE pago_id = p_pago_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_payment_not_found';
    END IF;
    IF v_pago.estado <> 'activo' THEN
        RAISE EXCEPTION 'error_payment_not_active';
    END IF;

    SELECT * INTO v_prestamo
    FROM public.p_prestamos
    WHERE prestamo_id = v_pago.prestamo_id
    FOR UPDATE;

    PERFORM 1 FROM public.p_billeteras
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND activa = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_wallet_not_found';
    END IF;

    SELECT COALESCE(SUM(monto_aplicado), 0) INTO v_otros
    FROM public.p_prestamos_pagos
    WHERE prestamo_id = v_pago.prestamo_id AND estado = 'activo' AND pago_id <> p_pago_id;

    v_base := COALESCE(v_prestamo.saldo_al_ingreso, 0);
    v_aplicado := p_monto_aplicado;

    IF v_otros + v_aplicado > v_base THEN
        v_excedente := v_otros + v_aplicado - v_base;
        IF NOT COALESCE(p_confirmar_excedente, false) THEN
            RAISE EXCEPTION 'error_overpayment_confirmation_required';
        END IF;
        v_aplicado := GREATEST(0, v_base - v_otros);
    ELSE
        v_excedente := NULL;
    END IF;

    v_tipo := CASE WHEN v_pago.direccion = 'cobro' THEN 'income' ELSE 'expense' END;

    -- Adjust the ORIGINAL cash row. The wallet trigger reverts OLD and applies NEW,
    -- so the balance moves by the difference only.
    UPDATE public.p_caja
       SET billetera_origen_id = p_billetera_id,
           valor_egreso  = CASE WHEN v_tipo = 'expense' THEN p_monto_billetera ELSE 0 END,
           valor_ingreso = CASE WHEN v_tipo = 'income'  THEN p_monto_billetera ELSE 0 END,
           fecha         = COALESCE(p_fecha, fecha),
           moneda        = trim(p_moneda_billetera),
           detalle       = COALESCE(p_nota, detalle)
     WHERE p_caja_id = v_pago.p_caja_id;

    UPDATE public.p_prestamos_pagos
       SET billetera_id        = p_billetera_id,
           moneda_billetera   = trim(p_moneda_billetera),
           monto_billetera    = p_monto_billetera,
           monto_aplicado     = v_aplicado,
           capital_aplicado   = COALESCE(p_capital_aplicado, capital_aplicado),
           interes_aplicado   = COALESCE(p_interes_aplicado, interes_aplicado),
           interes_excedente  = v_excedente,
           fecha              = COALESCE(p_fecha, fecha),
           nota               = COALESCE(p_nota, nota),
           corregido_at       = now()
     WHERE pago_id = p_pago_id;

    -- The p_prestamos_pagos trigger recomputes the loan balance.
END;
$$;

-- Remove an operation entirely. The cash leg is deleted, its cascade removes the
-- operation row, the wallet trigger returns the money and the balance is
-- recomputed. The record does not survive by design: the operation never happened.
CREATE OR REPLACE FUNCTION public.fn_prestamo_eliminar_pago(p_pago_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id bigint;
    v_caja    bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    SELECT p_caja_id INTO v_caja
    FROM public.p_prestamos_pagos
    WHERE pago_id = p_pago_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_payment_not_found';
    END IF;

    DELETE FROM public.p_caja WHERE p_caja_id = v_caja;
END;
$$;

-- ---------------------------------------------------------------------------
-- T10 · Remove a settled loan from the visible history (AC-08)
--
-- Logical deletion only. The row survives so p_caja.metadata.prestamo_id keeps
-- resolving; no cash movement is deleted or reverted.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prestamo_eliminar_historial(
    p_prestamo_id bigint,
    p_confirmar   boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id  bigint;
    v_estado   text;
    v_saldo    numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    IF NOT COALESCE(p_confirmar, false) THEN
        RAISE EXCEPTION 'error_confirmation_required';
    END IF;

    SELECT estado, saldo_actual INTO v_estado, v_saldo
    FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_debt_not_found';
    END IF;

    -- Only a settled loan leaves the history (§3.3). A live debt is never hidden.
    IF COALESCE(v_saldo, 0) > 0 THEN
        RAISE EXCEPTION 'error_debt_not_settled';
    END IF;

    UPDATE public.p_prestamos
       SET estado = 'eliminado', eliminado_at = now()
     WHERE prestamo_id = p_prestamo_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Reports that counted a 'cancelado' loan must not count an 'eliminado' one.
--
-- A logically deleted loan is no longer a pending obligation, so it cannot keep
-- inflating patrimonio, escudo, BCG or the attack plan. The replacement only ever
-- excludes MORE rows, so no report starts counting something it did not before.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_rec   record;
    v_def   text;
    v_patch integer := 0;
BEGIN
    FOR v_rec IN
        SELECT p.oid, p.proname, p.prosrc
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosrc ILIKE '%p_prestamos%'
          AND (p.prosrc LIKE '%estado != ''cancelado''%' OR p.prosrc LIKE '%estado <> ''cancelado''%')
    LOOP
        v_def := pg_get_functiondef(v_rec.oid);
        v_def := replace(v_def, 'estado != ''cancelado''', 'estado NOT IN (''cancelado'', ''eliminado'')');
        v_def := replace(v_def, 'estado <> ''cancelado''', 'estado NOT IN (''cancelado'', ''eliminado'')');
        EXECUTE v_def;
        v_patch := v_patch + 1;
        RAISE NOTICE 'filtro actualizado en %', v_rec.proname;
    END LOOP;

    IF v_patch = 0 THEN
        RAISE EXCEPTION 'no se encontro ningun filtro estado != cancelado sobre p_prestamos; revisar a mano';
    END IF;
END $$;

COMMIT;
