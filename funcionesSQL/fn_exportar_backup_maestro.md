CREATE OR REPLACE FUNCTION public.fn_exportar_backup_maestro()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_hogar_id bigint; v_data jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    v_data := jsonb_build_object(
        'version', '2.0', 'fecha_exportacion', now(),
        'usuario', (SELECT row_to_json(u) FROM (SELECT user_id, nombre, email, creado_at FROM public.usuarios WHERE user_id = v_user_id) u),
        'estructuras_egresos', (SELECT json_agg(row_to_json(e)) FROM public.p_estructuras_egresos e WHERE e.user_id = v_user_id),
        'presupuestos_config', (SELECT row_to_json(pc) FROM public.p_presupuestos_config pc WHERE pc.user_id = v_user_id),
        'grupo_familiar', (SELECT json_agg(row_to_json(gf)) FROM public.p_grupo_familiar gf WHERE gf.user_id = v_user_id),
        'billeteras', (SELECT json_agg(row_to_json(b)) FROM public.p_billeteras b WHERE b.user_id = v_user_id),
        'tarjetas_credito', (SELECT json_agg(row_to_json(t)) FROM public.p_tarjetas_credito t WHERE t.user_id = v_user_id),
        'inversiones', (SELECT json_agg(row_to_json(i)) FROM public.p_inversiones i WHERE i.user_id = v_user_id),
        'prestamos', (SELECT json_agg(row_to_json(p)) FROM public.p_prestamos p WHERE p.user_id = v_user_id),
        'presupuestos_mensuales', (SELECT json_agg(row_to_json(p)) FROM public.p_presupuestos p WHERE p.user_id = v_user_id),
        'gastos_recurrentes', (SELECT json_agg(row_to_json(r)) FROM public.p_gastos_recurrentes r WHERE r.user_id = v_user_id),
        'caja', (SELECT json_agg(row_to_json(c)) FROM public.p_caja c WHERE c.user_id = v_user_id),
        'cuotas_detalle', (SELECT json_agg(row_to_json(cd)) FROM public.p_cuotas_detalle cd WHERE cd.user_id = v_user_id),
        'compromisos_tarjeta', (SELECT json_agg(row_to_json(ct)) FROM public.p_compromisos_tarjeta ct WHERE ct.user_id = v_user_id),
        'hogar_participantes', CASE WHEN v_hogar_id IS NOT NULL THEN (SELECT json_agg(row_to_json(hp)) FROM public.p_hogar_participantes hp WHERE hp.hogar_id = v_hogar_id) ELSE NULL END,
        'proyectos_compartidos', CASE WHEN v_hogar_id IS NOT NULL THEN (SELECT json_agg(row_to_json(pc)) FROM public.p_proyectos_compartidos pc WHERE pc.hogar_id = v_hogar_id) ELSE NULL END
    );

    RETURN v_data;
END;
$function$