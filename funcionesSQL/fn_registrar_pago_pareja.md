CREATE OR REPLACE FUNCTION public.fn_registrar_pago_pareja(p_monto numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id int8;
    v_para_user_id int8;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    SELECT user_id INTO v_para_user_id FROM p_hogar_participantes WHERE hogar_id = v_hogar_id AND user_id != v_user_id;

    IF v_hogar_id IS NOT NULL AND v_para_user_id IS NOT NULL THEN
        INSERT INTO p_hogar_pagos (hogar_id, de_user_id, para_user_id, monto)
        VALUES (v_hogar_id, v_user_id, v_para_user_id, p_monto);
    END IF;
END; $function$