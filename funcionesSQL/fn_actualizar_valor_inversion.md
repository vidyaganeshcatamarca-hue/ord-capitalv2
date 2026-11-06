CREATE OR REPLACE FUNCTION public.fn_actualizar_valor_inversion(
    p_inversion_id bigint,
    p_nuevo_valor numeric
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_nuevo_valor < 0 THEN
        RAISE EXCEPTION '{"key": "error_investment_value_negative", "params": {}}';
    END IF;

    -- Esquema real: valor_mercado_actual (no valor_actual), ultima_conciliacion
    UPDATE p_inversiones
    SET valor_mercado_actual = p_nuevo_valor,
        ultima_conciliacion = CURRENT_DATE
    WHERE inversion_id = p_inversion_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_investment_not_found", "params": {}}';
    END IF;

    RETURN jsonb_build_object(
        'success_key', 'success_investment_value_updated',
        'params', '{}'::jsonb
    );
END;
$function$
