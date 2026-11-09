-- Vuelve al orden automatico: la lista deja de mandar por orden manual y se
-- agrupa por tipo (proyecto con fecha, proyecto sin fecha, ahorro libre).
-- Renumera por fecha de alta para que dentro de cada grupo el orden sea el
-- natural y no el que quedo del ultimo arrastre. Es la contracara de
-- fn_sobres_reordenar, que pone orden_manual en true. PRD: DF-26.

CREATE OR REPLACE FUNCTION public.fn_sobres_orden_automatico()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE public.p_sobres b
    SET orden = x.pos,
        orden_manual = false,
        actualizado_at = now()
    FROM (
        SELECT v.sobre_id, row_number() OVER (ORDER BY v.sobre_id) AS pos
        FROM public.p_sobres v
        WHERE v.user_id = v_user_id
    ) x
    WHERE b.sobre_id = x.sobre_id
      AND b.user_id = v_user_id;
END;
$function$;
