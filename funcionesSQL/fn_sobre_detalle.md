-- Detalle completo en un viaje: sobre, plan calculado, porciones e historial basico.
-- El historial incluye billetera_id ademas del nombre: la pantalla de correccion
-- necesita el id porque puede haber billeteras homonimas.
-- PRD: DF-10, DF-11, DF-15.

CREATE OR REPLACE FUNCTION public.fn_sobre_detalle(p_sobre_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_sobre public.p_sobres;
    v_saldo numeric;
    v_base numeric;
    v_plan record;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT * INTO v_sobre
    FROM public.p_sobres b
    WHERE b.sobre_id = p_sobre_id AND b.user_id = v_user_id;

    IF v_sobre.sobre_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_not_found", "params": {}}';
    END IF;

    v_saldo := public.fn_sobre_saldo(p_sobre_id);
    v_base := public.fn_sobre_saldo_base(p_sobre_id, v_sobre.plan_inicio_at);

    SELECT * INTO v_plan FROM public.fn_sobre_plan(
        v_sobre.monto_meta, v_saldo, v_base, v_sobre.fecha_objetivo, v_sobre.plan_inicio_at
    );

    RETURN jsonb_build_object(
        'sobre', jsonb_build_object(
            'sobre_id', v_sobre.sobre_id,
            'nombre', v_sobre.nombre,
            'moneda', v_sobre.moneda,
            'monto_meta', v_sobre.monto_meta,
            'fecha_objetivo', v_sobre.fecha_objetivo,
            'plan_inicio_at', v_sobre.plan_inicio_at,
            'orden', v_sobre.orden,
            'orden_manual', v_sobre.orden_manual,
            'archivado_at', v_sobre.archivado_at,
            'icono', v_sobre.icono
        ),
        'plan', jsonb_build_object(
            'saldo', v_saldo,
            'porcentaje_progreso', v_plan.porcentaje_progreso,
            'monto_faltante', v_plan.monto_faltante,
            'dias_restantes', v_plan.dias_restantes,
            'estado_key', v_plan.estado_key,
            'cuota_mensual', v_plan.cuota_mensual,
            'cuota_quincenal', v_plan.cuota_quincenal,
            'cuota_semanal', v_plan.cuota_semanal
        ),
        'porciones', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'billetera_id', p.billetera_id,
                'billetera_nombre', p.billetera_nombre,
                'moneda', p.moneda,
                'modalidad', p.modalidad,
                'saldo', p.saldo,
                'genera_rendimiento', p.genera_rendimiento
            ) ORDER BY p.saldo DESC)
            FROM public.fn_sobre_porciones(p_sobre_id) p
        ), '[]'::jsonb),
        'historial', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'movimiento_id', h.movimiento_id,
                'fecha', h.fecha,
                'tipo', h.tipo,
                'importe', h.importe,
                'billetera_nombre', h.billetera_nombre, 'billetera_id', h.billetera_id,
                'modalidad', h.modalidad
            ) ORDER BY h.fecha DESC, h.movimiento_id DESC)
            FROM (
                SELECT m.movimiento_id, m.fecha, m.tipo, m.importe, m.billetera_id, w.nombre AS billetera_nombre, m.modalidad
                FROM public.p_sobre_movimientos m
                JOIN public.p_billeteras w ON w.billetera_id = m.billetera_id
                WHERE m.sobre_id = p_sobre_id
                ORDER BY m.fecha DESC, m.movimiento_id DESC
                LIMIT 100
            ) h
        ), '[]'::jsonb)
    );
END;
$function$;
