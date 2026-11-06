CREATE OR REPLACE FUNCTION public.fn_configurar_porcentajes_hogar(p_pct_creador numeric, p_pct_invitado numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_pct_creador + p_pct_invitado != 100 THEN
        RAISE EXCEPTION '{"key": "error_home_percentage_sum", "params": {}}';
    END IF;

    IF p_pct_creador < 0 OR p_pct_invitado < 0 THEN
        RAISE EXCEPTION '{"key": "error_home_percentage_negative", "params": {}}';
    END IF;

    SELECT hogar_id INTO v_hogar_id
    FROM p_hogar_participantes
    WHERE user_id = v_user_id;

    IF v_hogar_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_home_not_found", "params": {}}';
    END IF;

    UPDATE p_hogares
    SET
        porcentaje_usuario_creador = p_pct_creador,
        porcentaje_usuario_invitado = p_pct_invitado
    WHERE hogar_id = v_hogar_id;
END;
$function$
