CREATE OR REPLACE FUNCTION public.fn_configurar_gastos_fijos(p_gastos_fijos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_gasto jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- Limpiar configuración anterior
    DELETE FROM p_gastos_fijos_config WHERE user_id = v_user_id;

    -- Insertar nueva configuración
    FOR v_gasto IN SELECT * FROM jsonb_array_elements(p_gastos_fijos)
    LOOP
        INSERT INTO p_gastos_fijos_config (
            user_id, estructura_egreso_id, monto_mensual, es_fijo
        ) VALUES (
            v_user_id,
            (v_gasto->>'estructura_id')::bigint,
            (v_gasto->>'monto_mensual')::numeric,
            (v_gasto->>'es_fijo')::boolean
        );
    END LOOP;
END;
$function$
