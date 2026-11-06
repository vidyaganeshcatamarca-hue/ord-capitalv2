CREATE OR REPLACE FUNCTION public.fn_actualizar_estrategia_bola_nieve(p_estrategia text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_estrategia NOT IN ('math', 'emotional', 'relationships') THEN
        RAISE EXCEPTION '{"key": "error_invalid_strategy", "params": {}}';
    END IF;

    INSERT INTO public.p_config_bola_nieve (user_id, estrategia_activa, fecha_inicio_plan)
    VALUES (v_user_id, p_estrategia, CURRENT_DATE)
    ON CONFLICT (user_id)
    DO UPDATE SET estrategia_activa = EXCLUDED.estrategia_activa, actualizado_at = now();
END;
$function$
