CREATE OR REPLACE FUNCTION public.fn_reporte_cierre_ciclo(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_mes date;
    v_marca jsonb;
    v_filas jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;

    v_mes := date_trunc('month', COALESCE(p_mes, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date))::date;

    SELECT to_jsonb(c) INTO v_marca
      FROM (SELECT c.mes_periodo, c.detalle AS ciclo, c.creado_at
              FROM public.p_presupuestos_cierre c
             WHERE c.tipo = 'ciclo' AND c.mes_periodo = v_mes
               AND COALESCE(c.user_id, 0) = v_user_id
               AND COALESCE(c.hogar_id, 0) = COALESCE(v_hogar_id, 0)) c;

    -- Una fila por grupo que manda plata, con su desglose adentro. `desglose` en false
    -- significa que ese cierre es de antes de guardar hijos: la pantalla tiene que decir
    -- «no disponible», no cero.
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.nombre), '[]'::jsonb) INTO v_filas
      FROM (
        SELECT c.estructura_egreso_id,
               e.nombre_cuenta AS nombre,
               c.monto_limite,
               c.monto_gastado,
               c.saldo_cierre,
               c.detalle,
               COALESCE((c.detalle->>'desglose')::boolean, false) AS desglose,
               COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                              'estructura_egreso_id', h.estructura_egreso_id,
                              'nombre', eh.nombre_cuenta,
                              'gasto', h.monto_gastado,
                              'techo', h.monto_techo,
                              'tiene_techo', h.monto_techo IS NOT NULL)
                          ORDER BY eh.nombre_cuenta)
                     FROM public.p_presupuestos_cierre h
                     LEFT JOIN public.p_estructuras_egresos eh
                            ON eh.estructura_id = h.estructura_egreso_id
                    WHERE h.padre_id = c.estructura_egreso_id
                      AND h.tipo = 'cierre'
                      AND h.mes_periodo = c.mes_periodo
                      AND COALESCE(h.user_id, 0) = COALESCE(c.user_id, 0)
                      AND COALESCE(h.hogar_id, 0) = COALESCE(c.hogar_id, 0)
               ), '[]'::jsonb) AS hijos
          FROM public.p_presupuestos_cierre c
          LEFT JOIN public.p_estructuras_egresos e
                 ON e.estructura_id = c.estructura_egreso_id
         WHERE c.tipo = 'cierre'
           AND c.padre_id IS NULL
           AND c.mes_periodo = v_mes
           AND COALESCE(c.user_id, 0) = v_user_id
           AND COALESCE(c.hogar_id, 0) = COALESCE(v_hogar_id, 0)
      ) x;

    RETURN jsonb_build_object('mes', v_mes, 'cerrado', v_marca IS NOT NULL,
                              'ciclo', v_marca, 'grupos', v_filas);
END;
$function$
