CREATE OR REPLACE FUNCTION public.fn_reporte_movimientos_por_billetera(p_billetera_id bigint, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(p_caja_id bigint, fecha date, tipo text, monto numeric, nombre_categoria text, icono_categoria text, color_categoria text, detalle text, es_compartido boolean, billetera_contraria text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT 
        c.p_caja_id, c.fecha, c.tipo,
        CASE 
            WHEN c.billetera_origen_id = p_billetera_id AND c.tipo = 'expense' THEN -c.valor_egreso
            WHEN c.billetera_origen_id = p_billetera_id AND c.tipo = 'income' THEN c.valor_ingreso
            WHEN c.billetera_origen_id = p_billetera_id AND c.tipo = 'transfer' THEN -c.valor_egreso
            WHEN c.billetera_destino_id = p_billetera_id AND c.tipo = 'transfer' THEN c.valor_egreso
            WHEN c.billetera_origen_id = p_billetera_id AND c.tipo = 'opening' THEN c.valor_ingreso
            ELSE 0
        END::numeric AS monto,
        COALESCE(e.nombre_cuenta, 
            CASE c.tipo 
                WHEN 'transfer' THEN 'type_transfer'
                WHEN 'opening' THEN 'type_opening'
                WHEN 'adjustment' THEN 'type_adjustment'
                ELSE 'no_category'
            END
        )::text AS nombre_categoria,
        e.icono::text, e.color::text, c.detalle, c.es_compartido,
        CASE 
            WHEN c.tipo = 'transfer' AND c.billetera_origen_id = p_billetera_id THEN b_dest.nombre
            WHEN c.tipo = 'transfer' AND c.billetera_destino_id = p_billetera_id THEN b_orig.nombre
            ELSE NULL
        END::text
    FROM public.p_caja c
    LEFT JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    LEFT JOIN public.p_billeteras b_orig ON c.billetera_origen_id = b_orig.billetera_id
    LEFT JOIN public.p_billeteras b_dest ON c.billetera_destino_id = b_dest.billetera_id
    WHERE c.user_id = v_user_id AND (c.billetera_origen_id = p_billetera_id OR c.billetera_destino_id = p_billetera_id)
    ORDER BY c.fecha DESC, c.p_caja_id DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$
