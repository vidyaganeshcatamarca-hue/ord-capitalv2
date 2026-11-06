CREATE OR REPLACE FUNCTION public.fn_exportar_datos_usuario_rango(p_fecha_inicio date, p_fecha_fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_data jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    v_data := jsonb_build_object(
        'metadatos', jsonb_build_object('fecha_exportacion', now(), 'rango_inicio', p_fecha_inicio, 'rango_fin', p_fecha_fin),
        'perfil', (SELECT row_to_json(u) FROM public.usuarios u WHERE user_id = v_user_id),
        'billeteras', (SELECT json_agg(row_to_json(b)) FROM public.p_billeteras b WHERE b.user_id = v_user_id),
        'estructuras_egresos', (SELECT json_agg(row_to_json(ee)) FROM public.p_estructuras_egresos ee WHERE ee.user_id = v_user_id),
        'caja', (SELECT json_agg(row_to_json(c)) FROM public.p_caja c WHERE c.user_id = v_user_id AND c.fecha BETWEEN p_fecha_inicio AND p_fecha_fin),
        'cuotas_detalle', (SELECT json_agg(row_to_json(cd)) FROM public.p_cuotas_detalle cd WHERE cd.user_id = v_user_id AND cd.fecha_estimada_pago BETWEEN p_fecha_inicio AND p_fecha_fin),
        'proyectos', (SELECT json_agg(row_to_json(p)) FROM public.p_proyectos_compartidos p WHERE p.hogar_id IN (SELECT hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id))
    );

    RETURN v_data;
END;
$function$