CREATE OR REPLACE FUNCTION public.fn_reporte_hogar_feed()
 RETURNS TABLE(
    evento_id bigint,
    tipo_evento text,
    fecha date,
    hora text,
    monto numeric,
    descripcion text,
    rubro text,
    subcuenta text,
    pagado_por text,
    direccion text,
    color_padre text,
    icono_padre text,
    icono_subcuenta text,
    proyecto_id bigint,
    nombre_proyecto text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint; 
    v_hogar_id int8;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    IF v_hogar_id IS NULL THEN RETURN; END IF;

    -- GASTOS COMPARTIDOS (incluye aportes a proyectos: estructura_egreso_id puede ser NULL)
    RETURN QUERY
    SELECT 
        c.p_caja_id::int8 AS evento_id,
        'gasto_compartido'::text AS tipo_evento,
        c.fecha::date,
        to_char(c.creado_at, 'HH24:MI')::text AS hora,
        c.valor_egreso::numeric AS monto,
        COALESCE(c.detalle, c.nombre_cuenta_historico)::text AS descripcion,
        r.nombre_cuenta::text AS rubro,
        s.nombre_cuenta::text AS subcuenta,
        u.nombre::text AS pagado_por,
        NULL::text AS direccion,
        r.color::text AS color_padre,
        r.icono::text AS icono_padre,
        s.icono::text AS icono_subcuenta,
        c.proyecto_id::int8,
        p.nombre_proyecto::text
    FROM public.p_caja c
    INNER JOIN public.usuarios u ON c.pagado_por_user_id = u.user_id
    LEFT JOIN public.p_estructuras_egresos s ON c.estructura_egreso_id = s.estructura_id
    LEFT JOIN public.p_estructuras_egresos r ON s.padre_id = r.estructura_id
    LEFT JOIN public.p_proyectos_compartidos p ON c.proyecto_id = p.proyecto_id
    WHERE c.hogar_id = v_hogar_id 
      AND c.es_compartido = true
      AND u.user_id IN (SELECT user_id FROM p_hogar_participantes WHERE hogar_id = v_hogar_id)

    UNION ALL

    -- CONCILIACIONES (saldar balance / disolución — hitos de corte)
    SELECT 
        hc.conciliacion_id::int8 AS evento_id,
        'conciliacion'::text AS tipo_evento,
        hc.creado_at::date AS fecha,
        to_char(hc.creado_at, 'HH24:MI')::text AS hora,
        hc.monto_saldado::numeric AS monto,
        COALESCE(hc.nota, '')::text AS descripcion,
        NULL::text AS rubro,
        NULL::text AS subcuenta,
        u.nombre::text AS pagado_por,
        hc.direccion::text AS direccion,
        NULL::text AS color_padre,
        NULL::text AS icono_padre,
        NULL::text AS icono_subcuenta,
        NULL::int8 AS proyecto_id,
        NULL::text AS nombre_proyecto
    FROM p_hogar_conciliaciones hc
    INNER JOIN usuarios u ON hc.creado_por_user_id = u.user_id
    WHERE hc.hogar_id = v_hogar_id

    UNION ALL

    -- ABONOS (pagos parciales sin reset)
    SELECT 
        hp.pago_id::int8 AS evento_id,
        'abono'::text AS tipo_evento,
        hp.creado_at::date AS fecha,
        to_char(hp.creado_at, 'HH24:MI')::text AS hora,
        hp.monto::numeric AS monto,
        NULL::text AS descripcion,
        NULL::text AS rubro,
        NULL::text AS subcuenta,
        u_de.nombre::text AS pagado_por,
        NULL::text AS direccion,
        NULL::text AS color_padre,
        NULL::text AS icono_padre,
        NULL::text AS icono_subcuenta,
        NULL::int8 AS proyecto_id,
        NULL::text AS nombre_proyecto
    FROM p_hogar_pagos hp
    INNER JOIN usuarios u_de ON hp.de_user_id = u_de.user_id
    WHERE hp.hogar_id = v_hogar_id

    ORDER BY fecha DESC, hora DESC;
END;
$function$;