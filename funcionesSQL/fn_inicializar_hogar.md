CREATE OR REPLACE FUNCTION public.fn_inicializar_hogar(p_pct_creador numeric, p_pct_invitado numeric)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id int8;
    v_codigo text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF (p_pct_creador + p_pct_invitado) != 100.00 THEN
        RAISE EXCEPTION '{"key": "error_sum_must_be_100", "params": {}}';
    END IF;

    v_codigo := floor(random() * (999999 - 100000 + 1) + 100000)::text;

    INSERT INTO p_hogares (porcentaje_usuario_creador, porcentaje_usuario_invitado, codigo_invitacion)
    VALUES (p_pct_creador, p_pct_invitado, v_codigo)
    RETURNING hogar_id INTO v_hogar_id;

    INSERT INTO p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar_id, v_user_id, 'creador');

    RETURN v_codigo;
END; $function$