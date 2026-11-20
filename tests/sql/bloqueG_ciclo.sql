-- Bloque G · el periodo presupuestario respeta el dia ancla, con febrero y cambio de anio.
DO $blk$ DECLARE v jsonb := '[]'::jsonb; a int; i date; f date; m date; ok boolean; BEGIN
  FOREACH a IN ARRAY ARRAY[1,15,21,28] LOOP
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = a WHERE user_id = 1;
    i := public.fn_inicio_ciclo(1,'2026-02-01'); f := public.fn_fin_ciclo(1,'2026-02-01');
    m := public.fn_mes_ciclo(1,'2026-02-01');
    ok := (f - i + 1) BETWEEN 28 AND 31 AND date_trunc('month', i)::date = m
          -- con ancla 1 todo febrero es un solo ciclo; con ancla mayor, el 28 ya cae en el siguiente
          AND (a = 1 OR public.fn_inicio_ciclo(1,'2026-02-28') <> i);
    v := v || jsonb_build_array(jsonb_build_object('caso', 'G_ancla_' || a,
        'ok', ok, 'detalle', jsonb_build_array(i, f, m)));
  END LOOP;
  RAISE EXCEPTION 'RESULTADO %', v;
END $blk$;
