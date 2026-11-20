CREATE OR REPLACE FUNCTION public.fn_registrar_ajuste_presupuesto(p_user_id bigint, p_hogar_id bigint, p_caja_id bigint, p_grupo bigint, p_ciclo_corregido date, p_delta numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_inicio_actual date;
    v_mes_activo date;
BEGIN
    IF COALESCE(p_delta, 0) = 0 THEN RETURN; END IF;

    SELECT f.fecha_inicio INTO v_inicio_actual
      FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE) f;
    v_mes_activo := date_trunc('month', v_inicio_actual)::date;

    INSERT INTO public.p_presupuestos_cierre
        (user_id, hogar_id, mes_periodo, estructura_egreso_id, tipo,
         monto_limite, monto_gastado, saldo_cierre, motivo, ciclo_corregido, detalle)
    VALUES (p_user_id, p_hogar_id, v_mes_activo, p_grupo, 'ajuste',
            0, 0, p_delta, 'correccion_movimiento', p_ciclo_corregido,
            jsonb_build_object('caja_id', p_caja_id))
    ON CONFLICT (COALESCE(user_id, 0), COALESCE(hogar_id, 0), mes_periodo,
                 estructura_egreso_id, COALESCE(ciclo_corregido, '1900-01-01'::date),
                 COALESCE(detalle->>'caja_id', ''))
    WHERE tipo = 'ajuste'
    DO UPDATE SET saldo_cierre = public.p_presupuestos_cierre.saldo_cierre + EXCLUDED.saldo_cierre;
END;
$function$
