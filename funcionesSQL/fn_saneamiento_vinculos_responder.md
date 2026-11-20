CREATE OR REPLACE FUNCTION public.fn_saneamiento_vinculos_responder(p_respuestas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_item    jsonb;
    v_prestamo bigint;
    v_crit    integer;
    v_puntos  smallint;
    v_total   integer := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
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
        WHERE prestamo_id = v_prestamo AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))
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
    -- p_prestamos_vinculos is keyed (prestamo_id, criterio): the answers belong to the
    -- LOAN, not to each member. Filtering the aggregate by user_id made a co-owned loan
    -- shrink to whoever answered last, or skip the recompute when every criterion
    -- collided. Every answer recorded for the loan counts; on a private loan the two
    -- readings are identical, because exactly one user can have answered it.
    UPDATE public.p_prestamos p
       SET puntos_vinculo = COALESCE((
               SELECT SUM(CASE WHEN v.criterio = 3 THEN 5 ELSE 3 END)::smallint
               FROM public.p_prestamos_vinculos v
               WHERE v.prestamo_id = p.prestamo_id AND v.seleccionado
           ), 0)
     WHERE (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
       AND EXISTS (SELECT 1 FROM public.p_prestamos_vinculos v
                   WHERE v.prestamo_id = p.prestamo_id);

    GET DIAGNOSTICS v_total = ROW_COUNT;
    RETURN v_total;
END;
$function$
