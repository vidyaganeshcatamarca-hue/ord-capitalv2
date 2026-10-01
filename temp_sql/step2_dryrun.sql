BEGIN;

CREATE OR REPLACE FUNCTION public.fn_reporte_cuarentena_pendientes_v2(
    p_filtro_origen text DEFAULT 'todos'::text
)
 RETURNS TABLE(
    pendiente_id bigint,
    origen text,
    monto numeric,
    fecha date,
    detalle text,
    estructura_egreso_id bigint,
    categoria_nombre text,
    categoria_icono text,
    categoria_color text,
    billetera_id bigint,
    billetera_nombre text,
    billetera_destino_id bigint,
    billetera_destino_nombre text,
    tarjeta_id bigint,
    tarjeta_nombre text,
    cuenta_ingreso_id bigint,
    cuenta_ingreso_nombre text,
    tipo text,
    moneda text,
    cuotas integer,
    destination_amount numeric,
    recurrente_id bigint,
    metadata jsonb,
    creado_at timestamp with time zone,
    estado text
)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    RETURN QUERY
    SELECT
        c.pendiente_id,
        c.origen,
        c.monto,
        c.fecha,
        c.detalle,
        c.estructura_egreso_id,
        e.nombre_cuenta AS categoria_nombre,
        e.icono AS categoria_icono,
        e.color AS categoria_color,
        c.billetera_id,
        b.nombre AS billetera_nombre,
        c.billetera_destino_id,
        b_dest.nombre AS billetera_destino_nombre,
        c.tarjeta_id,
        tc.nombre_tarjeta AS tarjeta_nombre,
        c.cuenta_ingreso_id,
        i.nombre AS cuenta_ingreso_nombre,
        c.tipo,
        c.moneda,
        c.cuotas,
        c.destination_amount,
        c.recurrente_id,
        c.metadata,
        c.creado_at,
        c.estado
    FROM p_caja_cuarentena c
    LEFT JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    LEFT JOIN p_billeteras b ON c.billetera_id = b.billetera_id
    LEFT JOIN p_billeteras b_dest ON c.billetera_destino_id = b_dest.billetera_id
    LEFT JOIN p_tarjetas_credito tc ON c.tarjeta_id = tc.tarjeta_id
    LEFT JOIN p_ingresos i ON c.cuenta_ingreso_id = i.producto_id
    WHERE c.user_id = v_user_id
      AND c.estado = 'pending'
      AND (p_filtro_origen = 'todos' OR c.origen = p_filtro_origen)
    ORDER BY c.creado_at DESC;
END;
$function$;

ROLLBACK;
