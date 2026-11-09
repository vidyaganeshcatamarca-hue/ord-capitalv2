-- Lista de sobres activos o archivados con todo lo que pinta la tarjeta.
-- Orden inicial DF-26: meta+fecha -> meta sin fecha -> fecha sin meta -> sin ambas;
-- si el usuario reordenó a mano manda su orden y no se reordena por progreso.
-- PRD: DF-06 (meta y fecha opcionales), DF-13, DF-19, DF-26.

CREATE OR REPLACE FUNCTION public.fn_sobres_listar(p_incluir_archivados boolean DEFAULT false)
 RETURNS TABLE(sobre_id bigint, nombre text, moneda text, saldo numeric, monto_meta numeric, fecha_objetivo date, plan_inicio_at date, porcentaje_progreso numeric, monto_faltante numeric, dias_restantes integer, estado_key text, cuota_mensual numeric, cuota_quincenal numeric, cuota_semanal numeric, orden integer, orden_manual boolean, archivado_at timestamp with time zone, tiene_rendimiento boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    WITH mov AS (
        SELECT m.sobre_id, m.billetera_id, m.modalidad, m.tipo, m.importe, m.genera_rendimiento
        FROM public.p_sobre_movimientos m
        WHERE m.user_id = v_user_id
    ),
    porciones AS (
        SELECT mov.sobre_id,
               mov.billetera_id,
               mov.modalidad,
               SUM(CASE WHEN mov.tipo = 'rescate' THEN -mov.importe ELSE mov.importe END) AS saldo_porcion,
               BOOL_OR(mov.genera_rendimiento AND mov.tipo <> 'rendimiento') AS genera
        FROM mov
        GROUP BY mov.sobre_id, mov.billetera_id, mov.modalidad
    ),
    resumen AS (
        SELECT porciones.sobre_id,
               COALESCE(SUM(porciones.saldo_porcion), 0) AS saldo,
               COALESCE(BOOL_OR(porciones.genera AND porciones.saldo_porcion > 0), false) AS tiene_rendimiento
        FROM porciones
        GROUP BY porciones.sobre_id
    )
    SELECT
        b.sobre_id,
        b.nombre,
        b.moneda,
        COALESCE(rs.saldo, 0),
        b.monto_meta,
        b.fecha_objetivo,
        b.plan_inicio_at,
        p.porcentaje_progreso,
        p.monto_faltante,
        p.dias_restantes,
        p.estado_key,
        p.cuota_mensual,
        p.cuota_quincenal,
        p.cuota_semanal,
        b.orden,
        b.orden_manual,
        b.archivado_at,
        COALESCE(rs.tiene_rendimiento, false)
    FROM public.p_sobres b
    LEFT JOIN resumen rs ON rs.sobre_id = b.sobre_id
    CROSS JOIN LATERAL public.fn_sobre_plan(
        b.monto_meta,
        COALESCE(rs.saldo, 0),
        public.fn_sobre_saldo_base(b.sobre_id, b.plan_inicio_at),
        b.fecha_objetivo,
        b.plan_inicio_at
    ) p
    WHERE b.user_id = v_user_id
      AND (p_incluir_archivados OR b.archivado_at IS NULL)
    ORDER BY
        (b.archivado_at IS NOT NULL),
        CASE
            WHEN b.orden_manual THEN b.orden
            WHEN b.monto_meta IS NOT NULL AND b.fecha_objetivo IS NOT NULL THEN 0
            WHEN b.monto_meta IS NOT NULL THEN 1
            WHEN b.fecha_objetivo IS NOT NULL THEN 2
            ELSE 3
        END,
        b.orden,
        b.sobre_id;
END;
$function$;
