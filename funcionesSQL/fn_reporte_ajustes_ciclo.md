CREATE OR REPLACE FUNCTION public.fn_reporte_ajustes_ciclo(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_mes date;
    v_filas jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    v_mes := date_trunc('month', COALESCE(p_mes, public.fn_mes_ciclo(v_user_id, CURRENT_DATE)))::date;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.grupo, x.creado_at), '[]'::jsonb) INTO v_filas
      FROM (
        SELECT a.estructura_egreso_id                                   AS grupo,
               e.nombre_cuenta                                          AS grupo_nombre,
               a.saldo_cierre                                           AS importe,
               a.motivo,
               a.ciclo_corregido,
               a.creado_at,
               (a.detalle->>'caja_id')::bigint                          AS caja_id,
               c.fecha                                                  AS movimiento_fecha,
               c.tipo                                                   AS movimiento_tipo,
               COALESCE(c.valor_local, c.valor_egreso)                  AS movimiento_importe,
               c.nombre_cuenta_historico                                AS movimiento_descripcion
          FROM public.p_presupuestos_cierre a
          LEFT JOIN public.p_estructuras_egresos e ON e.estructura_id = a.estructura_egreso_id
          LEFT JOIN public.p_caja c
                 ON c.p_caja_id = (a.detalle->>'caja_id')::bigint
                AND COALESCE(c.user_id, 0) = COALESCE(a.user_id, 0)
         WHERE a.tipo = 'ajuste'
           AND a.mes_periodo = v_mes
           AND COALESCE(a.user_id, 0) = v_user_id
           AND COALESCE(a.hogar_id, 0) = COALESCE(v_hogar_id, 0)
           AND a.saldo_cierre <> 0
      ) x;

    RETURN jsonb_build_object('mes', v_mes, 'ajustes', COALESCE(v_filas, '[]'::jsonb),
                              'total', COALESCE((SELECT SUM((y->>'importe')::numeric)
                                                    FROM jsonb_array_elements(COALESCE(v_filas,'[]'::jsonb)) y), 0));
END;
$function$
