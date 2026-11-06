CREATE OR REPLACE FUNCTION public.fn_buscar_movimientos(p_fecha_inicio date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_cuenta_id bigint DEFAULT NULL::bigint, p_importe numeric DEFAULT NULL::numeric, p_detalle text DEFAULT NULL::text)
 RETURNS TABLE(p_caja_id bigint, fecha date, tipo text, valor_ingreso numeric, valor_egreso numeric, nombre_cuenta text, detalle text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    
    RETURN QUERY
    SELECT 
        c.p_caja_id, c.fecha, c.tipo, c.valor_ingreso, c.valor_egreso,
        e.nombre_cuenta::text, c.detalle
    FROM public.p_caja c
    LEFT JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id
      AND (p_fecha_inicio IS NULL OR c.fecha >= p_fecha_inicio)
      AND (p_fecha_fin IS NULL OR c.fecha <= p_fecha_fin)
      AND (p_cuenta_id IS NULL OR c.estructura_egreso_id = p_cuenta_id OR e.padre_id = p_cuenta_id OR c.cuenta_ingreso_id = p_cuenta_id)
      AND (p_importe IS NULL OR c.valor_ingreso = p_importe OR c.valor_egreso = p_importe)
      AND (p_detalle IS NULL OR c.detalle ILIKE '%' || p_detalle || '%')
    ORDER BY c.fecha DESC;
END; $function$