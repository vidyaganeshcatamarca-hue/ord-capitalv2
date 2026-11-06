CREATE OR REPLACE FUNCTION public.fn_exportar_pasaporte_financiero()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_score jsonb; v_patrimonio jsonb; v_data jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT * INTO v_score FROM public.fn_reporte_score_salud_financiera();
    SELECT * INTO v_patrimonio FROM public.fn_reporte_patrimonio_neto_consolidado();

    v_data := jsonb_build_object(
        'pasaporte_financiero', jsonb_build_object(
            'fecha_exportacion', now(),
            'usuario', (SELECT row_to_json(u) FROM (SELECT user_id, nombre, email, creado_at FROM public.usuarios WHERE user_id = v_user_id) u),
            'snapshot_actual', jsonb_build_object('score_salud', v_score, 'patrimonio_neto', v_patrimonio),
            'infraestructura', jsonb_build_object(
                'billeteras', (SELECT json_agg(row_to_json(b)) FROM public.p_billeteras b WHERE b.user_id = v_user_id),
                'categorias', (SELECT json_agg(row_to_json(e)) FROM public.p_estructuras_egresos e WHERE e.user_id = v_user_id)
            ),
            'historial_completo', jsonb_build_object(
                'caja', (SELECT json_agg(row_to_json(c)) FROM public.p_caja c WHERE c.user_id = v_user_id),
                'inversiones', (SELECT json_agg(row_to_json(i)) FROM public.p_inversiones i WHERE i.user_id = v_user_id),
                'prestamos', (SELECT json_agg(row_to_json(p)) FROM public.p_prestamos p WHERE p.user_id = v_user_id)
            )
        )
    );

    RETURN v_data;
END;
$function$