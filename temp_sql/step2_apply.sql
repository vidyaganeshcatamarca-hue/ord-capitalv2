CREATE OR REPLACE FUNCTION public.fn_reporte_cuarentena_pendientes()
 RETURNS TABLE(
    pendiente_id bigint,
    origen text,
    tipo text,
    estado text,
    monto numeric,
    fecha date,
    detalle text,
    metadata jsonb,
    creado_at timestamp with time zone,

    -- Categoría de egreso
    estructura_egreso_id bigint,
    categoria_nombre text,
    categoria_icono text,
    categoria_color text,

    -- Billetera de origen
    billetera_id bigint,
    billetera_nombre text,
    billetera_moneda text,

    -- Billetera destino (income, transfer)
    billetera_destino_id bigint,
    billetera_destino_nombre text,
    billetera_destino_moneda text,

    -- Tarjeta (card_expense)
    tarjeta_id bigint,
    tarjeta_nombre text,

    -- Cuenta de ingreso (income)
    cuenta_ingreso_id bigint,
    cuenta_ingreso_nombre text,

    -- Campos específicos por tipo
    moneda text,
    cuotas integer,
    destination_amount numeric,

    -- Recurrente (origen recurrente)
    recurrente_id bigint
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
        c.tipo,
        c.estado,
        c.monto,
        c.fecha,
        c.detalle,
        c.metadata,
        c.creado_at,

        c.estructura_egreso_id,
        e.nombre_cuenta AS categoria_nombre,
        e.icono AS categoria_icono,
        e.color AS categoria_color,

        c.billetera_id,
        b.nombre AS billetera_nombre,
        b.moneda AS billetera_moneda,

        c.billetera_destino_id,
        b_dest.nombre AS billetera_destino_nombre,
        b_dest.moneda AS billetera_destino_moneda,

        c.tarjeta_id,
        tc.nombre_tarjeta AS tarjeta_nombre,

        c.cuenta_ingreso_id,
        i.nombre AS cuenta_ingreso_nombre,

        c.moneda,
        c.cuotas,
        c.destination_amount,

        c.recurrente_id
    FROM p_caja_cuarentena c
    LEFT JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    LEFT JOIN p_billeteras b ON c.billetera_id = b.billetera_id
    LEFT JOIN p_billeteras b_dest ON c.billetera_destino_id = b_dest.billetera_id
    LEFT JOIN p_tarjetas_credito tc ON c.tarjeta_id = tc.tarjeta_id
    LEFT JOIN p_ingresos i ON c.cuenta_ingreso_id = i.producto_id
    WHERE c.user_id = v_user_id
      AND c.estado = 'pending'
    ORDER BY c.creado_at DESC;
END;
$function$;
