-- Rescate con reparto explicito entre porciones. Cada importe vuelve a SU
-- billetera de origen y la acredita en las dos modalidades.
-- p_asignaciones: [{"billetera_id": 1, "modalidad": "virtual", "importe": 60000}, ...]
-- PRD: DF-04, DF-05, DF-29.

CREATE OR REPLACE FUNCTION public.fn_sobre_rescatar(p_sobre_id bigint, p_asignaciones jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_sobre public.p_sobres;
    v_item jsonb;
    v_billetera_id bigint;
    v_modalidad text;
    v_importe numeric;
    v_disponible numeric;
    v_caja_id bigint;
    v_n integer := 0;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT * INTO v_sobre FROM public.p_sobres b
    WHERE b.sobre_id = p_sobre_id AND b.user_id = v_user_id;
    IF v_sobre.sobre_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_not_found", "params": {}}';
    END IF;
    IF v_sobre.archivado_at IS NOT NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_archived", "params": {}}';
    END IF;
    IF p_asignaciones IS NULL OR jsonb_typeof(p_asignaciones) <> 'array'
       OR jsonb_array_length(p_asignaciones) = 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_rescue_empty", "params": {}}';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_asignaciones) LOOP
        v_billetera_id := (v_item->>'billetera_id')::bigint;
        v_modalidad := v_item->>'modalidad';
        v_importe := (v_item->>'importe')::numeric;

        IF v_importe IS NULL OR v_importe <= 0 THEN
            RAISE EXCEPTION '{"key": "error_sobre_amount_invalid", "params": {}}';
        END IF;
        IF v_modalidad IS NULL OR v_modalidad NOT IN ('real','virtual') THEN
            RAISE EXCEPTION '{"key": "error_sobre_modality_invalid", "params": {}}';
        END IF;

        SELECT COALESCE(SUM(CASE WHEN m.tipo = 'rescate' THEN -m.importe ELSE m.importe END), 0)
        INTO v_disponible
        FROM public.p_sobre_movimientos m
        WHERE m.sobre_id = p_sobre_id
          AND m.billetera_id = v_billetera_id
          AND m.modalidad = v_modalidad;

        IF v_disponible <= 0 OR v_disponible < v_importe THEN
            RAISE EXCEPTION '{"key": "error_sobre_portion_insufficient", "params": {"disponible": "{{disponible}}"}}';
        END IF;

        -- Rescatar devuelve la plata a la billetera de origen en las dos
        -- modalidades, igual que el aporte la saca.
        v_caja_id := public.fn_sobre_pata_billetera(
            v_user_id, v_billetera_id, v_sobre.moneda, v_importe, false,
            'savings_envelope_rescate_real', p_sobre_id, v_sobre.nombre
        );

        INSERT INTO public.p_sobre_movimientos (
            sobre_id, user_id, tipo, importe, moneda, billetera_id, modalidad,
            genera_rendimiento, caja_movimiento_id
        ) VALUES (
            p_sobre_id, v_user_id, 'rescate', v_importe, v_sobre.moneda,
            v_billetera_id, v_modalidad, false, v_caja_id
        );
        v_n := v_n + 1;
    END LOOP;

    UPDATE public.p_sobres SET actualizado_at = now() WHERE sobre_id = p_sobre_id;
    RETURN v_n;
END;
$function$;
