CREATE OR REPLACE FUNCTION public.fn_prestamo_editar(p_prestamo_id bigint, p_contraparte text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_tipo_deuda text DEFAULT NULL::text, p_monto_original numeric DEFAULT NULL::numeric, p_condicion_interes text DEFAULT NULL::text, p_tasa_anual numeric DEFAULT NULL::numeric, p_tasa_informada boolean DEFAULT NULL::boolean, p_interes_total_acordado numeric DEFAULT NULL::numeric, p_proximo_vencimiento date DEFAULT NULL::date, p_limpiar_vencimiento boolean DEFAULT false, p_saldo_al_ingreso numeric DEFAULT NULL::numeric, p_modalidad text DEFAULT NULL::text, p_cuotas jsonb DEFAULT NULL::jsonb, p_limpiar_interes boolean DEFAULT false, p_hogar_id bigint DEFAULT NULL::bigint, p_contraparte_user_id bigint DEFAULT NULL::bigint, p_limpiar_hogar boolean DEFAULT false, p_limpiar_contraparte boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id   bigint;
    v_hogar_id  bigint;
    v_prestamo  public.p_prestamos%ROWTYPE;
    v_pagos     integer;
    v_total     numeric;
    v_modalidad text;
    v_limpiar   boolean;
    v_condicion text;
    v_hogar     bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    SELECT * INTO v_prestamo
    FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))
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
$function$
