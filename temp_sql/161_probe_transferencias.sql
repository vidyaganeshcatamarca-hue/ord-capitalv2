-- Prueba transaccional de 160: cuatro escenarios, termina en RAISE y revierte todo.

DO $$
DECLARE v_p bigint; v_c1 bigint; v_c2 bigint; v_hoja bigint; v_hijos bigint[]; v_mes date := '2026-10-01'::date;
        s1 text; s2 text; s3 text; s4 text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=1),'role','authenticated')::text, true);
  SELECT e.padre_id INTO v_p FROM p_estructuras_egresos e WHERE e.user_id=1 AND e.padre_id IS NOT NULL GROUP BY 1 ORDER BY 1 LIMIT 1;
  SELECT array_agg(estructura_id ORDER BY estructura_id) INTO v_hijos FROM p_estructuras_egresos WHERE padre_id=v_p AND user_id=1;
  v_c1 := v_hijos[1]; v_c2 := v_hijos[2];
  -- una hoja raiz: sin padre y sin hijos, asi no la alcanza ningun techo
  SELECT estructura_id INTO v_hoja FROM p_estructuras_egresos e
   WHERE e.user_id=1 AND e.padre_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM p_estructuras_egresos h WHERE h.padre_id=e.estructura_id)
   ORDER BY estructura_id LIMIT 1;

  -- S1: el destino hijo no tiene lugar (libre = 0), transferencia de 1.000
  DELETE FROM p_presupuestos WHERE user_id=1 AND mes_periodo=v_mes AND estructura_egreso_id = ANY(v_hijos || v_p || v_hoja);
  PERFORM fn_asignar_presupuesto(v_p, 200000, v_mes); PERFORM fn_asignar_presupuesto(v_c1, 200000, v_mes);
  BEGIN PERFORM fn_transferir_entre_sobres(v_p, v_c2, 1000, v_mes); s1:='ACEPTA'; EXCEPTION WHEN OTHERS THEN s1:=SQLERRM; END;

  -- S2: el destino tiene 100.000 libres, la misma transferencia entra
  DELETE FROM p_presupuestos WHERE user_id=1 AND mes_periodo=v_mes AND estructura_egreso_id = ANY(v_hijos || v_p || v_hoja);
  PERFORM fn_asignar_presupuesto(v_p, 200000, v_mes); PERFORM fn_asignar_presupuesto(v_c1, 100000, v_mes);
  BEGIN PERFORM fn_transferir_entre_sobres(v_p, v_c2, 1000, v_mes); s2:='ACEPTA'; EXCEPTION WHEN OTHERS THEN s2:=SQLERRM; END;

  -- S3: el origen es el padre y no puede quedar debajo de lo repartido; el destino es una hoja raiz
  DELETE FROM p_presupuestos WHERE user_id=1 AND mes_periodo=v_mes AND estructura_egreso_id = ANY(v_hijos || v_p || v_hoja);
  PERFORM fn_asignar_presupuesto(v_p, 200000, v_mes); PERFORM fn_asignar_presupuesto(v_c1, 200000, v_mes);
  BEGIN PERFORM fn_transferir_entre_sobres(v_p, v_hoja, 1000, v_mes); s3:='ACEPTA'; EXCEPTION WHEN OTHERS THEN s3:=SQLERRM; END;

  -- S4: sin presupuesto en el padre, la transferencia entre hijos sigue libre
  DELETE FROM p_presupuestos WHERE user_id=1 AND mes_periodo=v_mes AND estructura_egreso_id = ANY(v_hijos || v_p || v_hoja);
  PERFORM fn_asignar_presupuesto(v_c1, 60000, v_mes);
  BEGIN PERFORM fn_transferir_entre_sobres(v_c1, v_c2, 1000, v_mes); s4:='ACEPTA'; EXCEPTION WHEN OTHERS THEN s4:=SQLERRM; END;

  RAISE EXCEPTION 'S1 destino sin lugar | %\nS2 destino con lugar | %\nS3 origen padre sin lugar | %\nS4 padre sin presupuesto | %', s1, s2, s3, s4;
END $$;