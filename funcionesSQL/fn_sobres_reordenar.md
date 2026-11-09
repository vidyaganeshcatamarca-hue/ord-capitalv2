-- Guarda el orden manual elegido por arrastre. Exige que la lista sea exactamente la
-- de los sobres activos del usuario. PRD: DF-26, CA-25.

CREATE OR REPLACE FUNCTION public.fn_sobres_reordenar(p_sobre_ids bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_total integer;
    v_propios integer;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF p_sobre_ids IS NULL OR array_length(p_sobre_ids, 1) IS NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_order_empty", "params": {}}';
    END IF;

    SELECT COUNT(*) INTO v_total FROM unnest(p_sobre_ids) x;
    SELECT COUNT(*) INTO v_propios FROM public.p_sobres b
    WHERE b.user_id = v_user_id AND b.archivado_at IS NULL AND b.sobre_id = ANY(p_sobre_ids);

    IF v_total <> v_propios THEN
        RAISE EXCEPTION '{"key": "error_sobre_order_mismatch", "params": {}}';
    END IF;

    UPDATE public.p_sobres b
    SET orden = x.pos, orden_manual = true, actualizado_at = now()
    FROM (SELECT v.sobre_id, v.pos FROM unnest(p_sobre_ids) WITH ORDINALITY AS v(sobre_id, pos)) x
    WHERE b.sobre_id = x.sobre_id AND b.user_id = v_user_id;
END;
$function$;
