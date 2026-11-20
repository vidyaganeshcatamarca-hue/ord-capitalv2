-- 20261120c_prestamo_editar_limpiar_interes.sql
--
-- T27 / S29. fn_prestamo_editar wrote every optional column with COALESCE, so an
-- existing interest figure could never be removed: the only way to "empty" the
-- field was to leave the old value in place. The user cleared it in the form and
-- the figure came back.
--
-- New parameter p_limpiar_interes boolean DEFAULT false. When it is true the call
-- ends with:
--     interes_total_acordado = NULL
--     tasa_anual_tna         = NULL
--     tasa_informada         = false
--     condicion_interes      = 'ninguno'
-- unless the caller passed a different p_condicion_interes in the same call, which
-- wins — a user who switches to "tasa" while clearing the negotiated amount must
-- not be rewritten back to 'ninguno'.
--
-- When it is false or omitted nothing changes, COALESCE included, byte for byte.
--
-- Because a parameter is added the signature changes, so the function is dropped
-- and recreated; EXECUTE is then granted back to anon, authenticated and
-- service_role. Return type stays void. Before dropping, the migration refuses to
-- run if anything depends on the old function, or if there is more than one
-- overload.

BEGIN;

DO $$
DECLARE
    v_oid   oid;
    v_count integer;
    v_deps  integer;
BEGIN
    SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_prestamo_editar';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'fn_prestamo_editar: se esperaba 1 sobrecarga y hay %', v_count;
    END IF;

    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_prestamo_editar';

    SELECT count(*) INTO v_deps
    FROM pg_depend d
    WHERE d.refclassid = 'pg_proc'::regclass
      AND d.refobjid = v_oid
      AND d.deptype <> 'i';

    IF v_deps > 0 THEN
        RAISE EXCEPTION 'fn_prestamo_editar: % objetos dependen de la funcion; no se dropea', v_deps;
    END IF;

    EXECUTE 'DROP FUNCTION public.fn_prestamo_editar(bigint, text, text, text, numeric, text, numeric, boolean, numeric, date, boolean, numeric, text, jsonb)';
END $$;

CREATE FUNCTION public.fn_prestamo_editar(
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
    p_limpiar_interes        boolean DEFAULT false
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
           modalidad             = v_modalidad
     WHERE prestamo_id = p_prestamo_id;

    -- Recompute because saldo_al_ingreso may have changed. No cash, no new
    -- operation: editing conditions is not a payment (§2.4).
    PERFORM public.fn_prestamos_aplicar_saldo(p_prestamo_id);
END;
$$;

COMMENT ON FUNCTION public.fn_prestamo_editar(
    bigint, text, text, text, numeric, text, numeric, boolean, numeric, date, boolean, numeric, text, jsonb, boolean
) IS
    'Edits a loan''s conditions. Optional columns use COALESCE so an omitted argument keeps its value; p_limpiar_interes = true is the explicit way to remove the agreed interest, the TNA and the informed flag.';

GRANT EXECUTE ON FUNCTION public.fn_prestamo_editar(
    bigint, text, text, text, numeric, text, numeric, boolean, numeric, date, boolean, numeric, text, jsonb, boolean
) TO anon, authenticated, service_role;

COMMIT;
