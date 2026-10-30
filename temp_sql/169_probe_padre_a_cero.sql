-- 169: verificación transaccional de 168.
--
-- Corre dentro de un DO que termina en RAISE EXCEPTION, así que no queda nada:
-- el mensaje del RAISE es el resultado. Se miran cuatro cosas:
--   1. un padre con hijos repartidos SÍ acepta que lo pongan en 0
--   2. ese 0 devuelve la plata al disponible (saldo después = saldo antes + techo previo)
--   3. un padre por debajo de lo repartido pero mayor que 0 SIGUE rechazando
--   4. con el padre sin techo, un hijo se puede asignar igual
DO $$
DECLARE
    v_mes date := date_trunc('month', current_date)::date;
    v_techo numeric := 0;
    v_rep numeric := 0;
    v_saldo_antes numeric;
    v_saldo_despues numeric;
    v_monto_despues numeric;
    v_msg text;
    v_hijo bigint;
    v_res jsonb := '{}'::jsonb;
    v_padre bigint;
BEGIN
    -- auth.uid() tiene que resolver al usuario 1 dentro de esta transacción.
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', 'b90d1f17-f691-491a-a840-522510e67640', 'role', 'authenticated')::text,
        true
    );

    -- El padre de prueba: el que YA tiene presupuesto propio y además hijos, para
    -- poder medir que el 0 devuelve esa plata al pozo. Se busca en p_presupuestos y
    -- no por los hijos: el monto que importa es el del padre.
    SELECT pr.estructura_egreso_id INTO v_padre
      FROM p_presupuestos pr
     WHERE pr.user_id = 1 AND pr.mes_periodo = v_mes AND pr.monto_limite > 0
       AND EXISTS (SELECT 1 FROM p_estructuras_egresos h
                    WHERE h.padre_id = pr.estructura_egreso_id AND h.user_id = 1)
     ORDER BY pr.monto_limite DESC
     LIMIT 1;

    IF v_padre IS NULL THEN
        RAISE EXCEPTION '{"result":"FAIL","detail":"no hay padre con presupuesto propio e hijos repartidos"}';
    END IF;

    SELECT COALESCE((SELECT monto_limite FROM p_presupuestos
                      WHERE estructura_egreso_id = v_padre AND user_id = 1 AND mes_periodo = v_mes), 0)
      INTO v_techo;

    SELECT COALESCE(SUM(pr.monto_limite), 0) INTO v_rep
      FROM p_presupuestos pr
      JOIN p_estructuras_egresos e ON e.estructura_id = pr.estructura_egreso_id
     WHERE e.padre_id = v_padre AND pr.user_id = 1 AND pr.mes_periodo = v_mes;

    v_saldo_antes := public.fn_obtener_saldo_a_asignar(current_date);

    -- 1. padre a 0
    BEGIN
        PERFORM public.fn_asignar_presupuesto(v_padre, 0, current_date);
        v_res := v_res || jsonb_build_object('padre_a_cero', 'ACEPTA');
    EXCEPTION WHEN OTHERS THEN
        v_res := v_res || jsonb_build_object('padre_a_cero', 'RECHAZA', 'msg', SQLERRM);
    END;

    SELECT COALESCE((SELECT monto_limite FROM p_presupuestos
                      WHERE estructura_egreso_id = v_padre AND user_id = 1 AND mes_periodo = v_mes), -1)
      INTO v_monto_despues;

    v_saldo_despues := public.fn_obtener_saldo_a_asignar(current_date);

    v_res := v_res || jsonb_build_object(
        'padre', v_padre,
        'techo_previo', v_techo,
        'repartido_hijos', v_rep,
        'monto_despues', v_monto_despues,
        'saldo_antes', v_saldo_antes,
        'saldo_despues', v_saldo_despues,
        'saldo_devuelto', v_saldo_despues - v_saldo_antes
    );

    -- 2. padre por debajo de lo repartido, pero mayor que 0 → sigue rechazando
    BEGIN
        PERFORM public.fn_asignar_presupuesto(v_padre, GREATEST(1, v_rep - 100), current_date);
        v_res := v_res || jsonb_build_object('padre_debajo', 'ACEPTA_MAL');
    EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        v_res := v_res || jsonb_build_object('padre_debajo', 'RECHAZA',
            'key', split_part(v_msg, '"key" : "', 2), 'msg', left(v_msg, 160));
    END;

    -- 3. con el padre en 0, un hijo se sigue pudiendo asignar
    SELECT e.estructura_id INTO v_hijo
      FROM p_estructuras_egresos e
     WHERE e.padre_id = v_padre AND e.user_id = 1
     ORDER BY e.estructura_id LIMIT 1;

    BEGIN
        PERFORM public.fn_asignar_presupuesto(v_hijo, 500, current_date);
        v_res := v_res || jsonb_build_object('hijo_con_padre_en_cero', 'ACEPTA');
    EXCEPTION WHEN OTHERS THEN
        v_res := v_res || jsonb_build_object('hijo_con_padre_en_cero', 'RECHAZA', 'msg', SQLERRM);
    END;

    RAISE EXCEPTION '%', jsonb_build_object('result',
        CASE WHEN v_res->>'padre_a_cero' = 'ACEPTA'
              AND v_monto_despues = 0
              -- Al soltar el techo del padre, los hijos sin presupuesto propio pasan a
              -- contar solos (S15): vuelve al pozo el techo menos lo que los hijos se
              -- quedan. Con cat_health en 2.000 y 1.005 en los hijos, vuelven 995.
              AND (v_saldo_despues - v_saldo_antes) = GREATEST(v_techo - v_rep, 0)
              AND v_res->>'padre_debajo' = 'RECHAZA'
              AND (v_res->>'key' LIKE 'error_budget_parent_below_children%')
              AND v_techo > 0
              AND v_res->>'hijo_con_padre_en_cero' = 'ACEPTA'
             THEN 'PASS' ELSE 'FAIL' END,
        'detail', v_res)::text;
END $$;
