-- Bloque D · un usuario vuelve tras varios ciclos y ORD los cierra en orden.
-- Todo en una transaccion que revierte: no queda un cierre en la base.
DO $blk$ DECLARE v jsonb := '[]'::jsonb; r jsonb; f jsonb; a numeric; b numeric; c numeric; u1 text;
BEGIN
  SELECT json_build_object('sub', u.auth_id)::text INTO u1 FROM public.usuarios u WHERE u.user_id = 1;
  PERFORM set_config('request.jwt.claims', u1, true);
  UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 1, fecha_activacion_base_cero = NULL,
         cierre_desde = '2025-01-01' WHERE user_id = 1;

  INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla) VALUES
    (1, 2, '2025-01-01', 100000, 1),
    (1, 2, '2025-02-01', 20000, 1),
    (1, 2, '2025-03-01', 0, 1);
  INSERT INTO public.p_caja (user_id, estructura_egreso_id, fecha, tipo, moneda, valor_egreso, valor_local) VALUES
    (1, 2, '2025-01-10', 'expense', 'ARS', 40000, 40000),
    (1, 2, '2025-02-10', 'expense', 'ARS', 5000, 5000),
    (1, 2, '2025-03-10', 'expense', 'ARS', 10000, 10000);

  r := public.fn_cerrar_ciclos_pendientes('2025-04-01');
  v := v || jsonb_build_array(jsonb_build_object('caso','P_cierra_en_orden','ok', (r->>'ok')::boolean AND (r->>'cerrados')::int = 4, 'detalle', r));

  SELECT (x->>'saldo_cierre')::numeric INTO a FROM jsonb_array_elements(public.fn_reporte_cierre_ciclo('2025-01-01')->'grupos') x WHERE (x->>'estructura_egreso_id')::bigint = 2;
  SELECT (x->>'saldo_cierre')::numeric INTO b FROM jsonb_array_elements(public.fn_reporte_cierre_ciclo('2025-02-01')->'grupos') x WHERE (x->>'estructura_egreso_id')::bigint = 2;
  SELECT (x->>'saldo_cierre')::numeric INTO c FROM jsonb_array_elements(public.fn_reporte_cierre_ciclo('2025-03-01')->'grupos') x WHERE (x->>'estructura_egreso_id')::bigint = 2;
  v := v || jsonb_build_array(jsonb_build_object('caso','P_arrastre_encadenado','ok', a = 60000 AND b = 75000 AND c = 65000,
      'detalle', jsonb_build_array(a,b,c)));

  r := public.fn_cerrar_ciclos_pendientes('2025-04-01');
  v := v || jsonb_build_array(jsonb_build_object('caso','P_no_repite','ok', (r->>'cerrados')::int = 0 AND (r->>'ya_estaban')::int = 4, 'detalle', r));

  -- dia ancla 21 sobre un ciclo vacio
  UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 21, cierre_desde = '2025-05-01' WHERE user_id = 1;
  r := public.fn_cerrar_ciclos_pendientes('2025-06-01');
  v := v || jsonb_build_array(jsonb_build_object('caso','P_ancla_21', 'ok', (r->>'ok')::boolean AND (r->>'cerrados')::int >= 1,
      'detalle', public.fn_reporte_cierre_ciclo('2025-05-01')->'ciclo'));

  RAISE EXCEPTION 'RESULTADO %', v::text;
END $blk$;
