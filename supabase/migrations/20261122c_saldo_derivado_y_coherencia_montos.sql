-- 20261122c_saldo_derivado_y_coherencia_montos.sql
--
-- Decisions 32A and 33A of 2026-11-20.
--
-- 32A. The outstanding balance is derived from the initial conditions and from the
--      registered operations. `fn_prestamo_editar` may only accept `p_saldo_al_ingreso`
--      while the loan has no live payments: that is the declared balance of a historical
--      loan. A loan settled by a payment is reopened by correcting or annulling that
--      payment, never by editing the balance. And an edit that changes nothing must fail
--      instead of answering "Conditions updated." over an untouched row.
--
-- 33A. When the wallet currency and the loan currency are the same, the accounting
--      identity is `monto_billetera = monto_aplicado + excedente_confirmado`. Any other
--      difference is unexplained money and is rejected before the cash row is written.
--      With different currencies the two amounts stay independent: ORD never invents an
--      exchange rate. A confirmed overpayment keeps working, because there the applied
--      amount is clamped to the outstanding balance and the excess travels as previously
--      unregistered interest.
--
-- Technique: the deployed bodies are read with pg_get_functiondef, CRLF normalised, and
-- each anchor is replaced only if it appears exactly once. A missing or duplicated anchor
-- aborts the whole migration before any function is replaced. A guard makes a second run
-- a no-op.

BEGIN;

DO $mig$
DECLARE
    v_oid    oid;
    v_body   text;
    v_new    text;
    v_n      int;

    a_saldo  text := $a$    -- When the interest is being cleared the agreed amount no longer exists, so it$a$;
    a_nulo   text := $a$    -- Recompute because saldo_al_ingreso may have changed. No cash, no new$a$;
    a_caja   text := $a$    -- The cash leg. 'expense' for a payment, 'income' for a collection, each with$a$;
    a_tipo   text := $a$    v_tipo := CASE WHEN v_pago.direccion = 'cobro' THEN 'income' ELSE 'expense' END;$a$;

    g_saldo text := $g$
    -- Decision 32A: the outstanding balance is derived. Only the DECLARED balance of a
    -- historical loan that still has no payments can be corrected here; a loan settled by
    -- a payment is reopened by correcting or annulling that payment.
    IF p_saldo_al_ingreso IS NOT NULL AND v_pagos > 0 THEN
        RAISE EXCEPTION 'error_saldo_derivado';
    END IF;

$g$;

    g_nulo text := $g$
    -- Decision 32A: never answer success for an edit that changed nothing. The schedule
    -- replacement below is a real change even when the row itself is untouched.
    IF p_cuotas IS NULL THEN
        PERFORM 1
          FROM public.p_prestamos p
         WHERE p.prestamo_id = p_prestamo_id
           AND ROW(p.entidad_nombre, p.nombre_prestamo, p.tipo_deuda, p.monto_original,
                   p.monto_total_deuda, p.condicion_interes, p.tasa_anual_tna,
                   p.tasa_informada, p.interes_total_acordado, p.proximo_vencimiento,
                   p.saldo_al_ingreso, p.modalidad, p.hogar_id, p.contraparte_user_id)
               IS NOT DISTINCT FROM
               ROW(v_prestamo.entidad_nombre, v_prestamo.nombre_prestamo,
                   v_prestamo.tipo_deuda, v_prestamo.monto_original,
                   v_prestamo.monto_total_deuda, v_prestamo.condicion_interes,
                   v_prestamo.tasa_anual_tna, v_prestamo.tasa_informada,
                   v_prestamo.interes_total_acordado, v_prestamo.proximo_vencimiento,
                   v_prestamo.saldo_al_ingreso, v_prestamo.modalidad, v_prestamo.hogar_id,
                   v_prestamo.contraparte_user_id);
        IF FOUND THEN
            RAISE EXCEPTION 'error_no_changes';
        END IF;
    END IF;

$g$;

    g_caja text := $g$
    -- Decision 33A: same currency, so the wallet and the loan must agree. The excess of a
    -- confirmed overpayment is part of the identity, not an exception to it.
    IF upper(trim(p_moneda_billetera)) = upper(trim(v_prestamo.moneda_iso))
       AND p_monto_billetera <> v_aplicado + COALESCE(v_excedente, 0) THEN
        RAISE EXCEPTION 'error_monto_incoherente';
    END IF;

$g$;
BEGIN
    -- ---------------------------------------------------------------- fn_prestamo_editar
    SELECT oid INTO v_oid FROM pg_proc
     WHERE proname = 'fn_prestamo_editar' AND pronamespace = 'public'::regnamespace;

    v_body := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

    IF position('error_saldo_derivado' in v_body) = 0 THEN
        v_new := v_body;

        SELECT (length(v_new) - length(replace(v_new, a_saldo, ''))) / length(a_saldo) INTO v_n;
        IF v_n <> 1 THEN RAISE EXCEPTION 'ancla saldo aparece % veces', v_n; END IF;
        v_new := replace(v_new, a_saldo, g_saldo || a_saldo);

        SELECT (length(v_new) - length(replace(v_new, a_nulo, ''))) / length(a_nulo) INTO v_n;
        IF v_n <> 1 THEN RAISE EXCEPTION 'ancla nulo aparece % veces', v_n; END IF;
        v_new := replace(v_new, a_nulo, g_nulo || a_nulo);

        EXECUTE v_new;
    END IF;

    -- --------------------------------------------------- fn_prestamo_registrar_pago
    SELECT oid INTO v_oid FROM pg_proc
     WHERE proname = 'fn_prestamo_registrar_pago' AND pronamespace = 'public'::regnamespace;

    v_body := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

    IF position('error_monto_incoherente' in v_body) = 0 THEN
        SELECT (length(v_body) - length(replace(v_body, a_caja, ''))) / length(a_caja) INTO v_n;
        IF v_n <> 1 THEN RAISE EXCEPTION 'ancla caja (registrar) aparece % veces', v_n; END IF;
        EXECUTE replace(v_body, a_caja, g_caja || a_caja);
    END IF;

    -- ---------------------------------------------------- fn_prestamo_corregir_pago
    SELECT oid INTO v_oid FROM pg_proc
     WHERE proname = 'fn_prestamo_corregir_pago' AND pronamespace = 'public'::regnamespace;

    v_body := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

    IF position('error_monto_incoherente' in v_body) = 0 THEN
        SELECT (length(v_body) - length(replace(v_body, a_tipo, ''))) / length(a_tipo) INTO v_n;
        IF v_n <> 1 THEN RAISE EXCEPTION 'ancla tipo (corregir) aparece % veces', v_n; END IF;
        EXECUTE replace(v_body, a_tipo, g_caja || a_tipo);
    END IF;
END
$mig$;

COMMIT;
