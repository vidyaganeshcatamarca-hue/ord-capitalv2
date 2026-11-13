CREATE OR REPLACE FUNCTION public.fn_sobre_desarchivar(p_sobre_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_sobre   public.p_sobres;
    v_orden   integer;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT * INTO v_sobre FROM public.p_sobres b
    WHERE b.sobre_id = p_sobre_id AND b.user_id = v_user_id;
    IF v_sobre.sobre_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_not_found", "params": {}}';
    END IF;
    IF v_sobre.archivado_at IS NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_not_archived", "params": {}}';
    END IF;

    -- Reposiciona el sobre al final DE SU GRUPO. Con orden automatico la lista
    -- ordena por grupo (proyecto con fecha, proyecto sin fecha, libre) e ignora
    -- este valor; con orden manual si lo usa, y entonces queda al final de la
    -- lista. En ninguno de los dos casos se toca orden_manual.
    SELECT COALESCE(MAX(b.orden), 0) + 1 INTO v_orden
    FROM public.p_sobres b
    WHERE b.user_id = v_user_id AND b.archivado_at IS NULL;

    UPDATE public.p_sobres
       SET archivado_at = NULL, orden = v_orden, actualizado_at = now()
     WHERE sobre_id = p_sobre_id AND user_id = v_user_id;
END;
$function$;
