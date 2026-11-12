CREATE OR REPLACE FUNCTION public.fn_reporte_sobres_detalle(p_mes_periodo date DEFAULT date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))
 RETURNS TABLE(estructura_id bigint, nombre_categoria text, icono text, color text, tipo_cupo text, padre_id bigint, monto_asignado numeric, monto_gastado numeric, monto_disponible numeric, arrastre_mes_anterior numeric, estado_sobre text, metodo_sobregasto text, monto_asignado_anterior numeric, monto_gastado_anterior numeric, gasto_promedio_6m numeric, es_padre boolean, cuenta_en_totales boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_mes_truncado date := date_trunc('month', p_mes_periodo);
    v_mes_anterior date := v_mes_truncado - INTERVAL '1 month';
    v_f_inicio date;
    v_f_fin date;
    v_f_inicio_ant date;
    v_f_fin_ant date;
    v_dia_ancla int2;
    v_modo_presupuesto text;
    -- Ronda 7 (B2): cuando el usuario firmo el paso a base cero.
    v_fecha_activacion date;
    -- Desde que dia se cuentan los gastos del ciclo pedido.
    v_f_efectiva date;
    -- En base cero el arrastre no existe: cada ciclo arranca de cero.
    v_arrastre_cero boolean;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    SELECT dia_ancla_ciclo INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;
    IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;
    SELECT modo_presupuesto, fecha_activacion_base_cero
      INTO v_modo_presupuesto, v_fecha_activacion
      FROM p_presupuestos_config WHERE user_id = v_user_id;

    v_f_inicio := date_trunc('month', p_mes_periodo) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin := (v_f_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    v_f_inicio_ant := date_trunc('month', v_mes_anterior) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin_ant := (v_f_inicio_ant + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- B2/S2: base cero es un contrato con fecha. En base cero no hay arrastre en
    -- ningun ciclo (cada uno se asigna desde cero) y, en el ciclo en que el
    -- usuario se paso, los gastos se cuentan solo desde la activacion: los
    -- anteriores ya salieron de las billeteras y no se les puede pedir un sobre
    -- despues del hecho. Sin fecha de activacion no se inventa un corte: el
    -- gasto del ciclo se cuenta completo (usuarios anteriores a la columna).
    -- T5 (S6): en base cero el sobrante y el deficit pasan al ciclo siguiente. Pero solo
    -- entre dos ciclos que ya estaban en base cero: sin fecha de activacion no se puede
    -- saber donde empieza la era base cero (esos usuarios no arrastran), y el ciclo de
    -- activacion tampoco arrastra lo anterior, porque esos gastos son del modo viejo.
    v_arrastre_cero := (v_modo_presupuesto = 'base_cero'
                        AND (v_fecha_activacion IS NULL OR v_fecha_activacion > v_f_fin_ant));
    v_f_efectiva := v_f_inicio;
    IF v_fecha_activacion IS NOT NULL AND v_fecha_activacion BETWEEN v_f_inicio AND v_f_fin THEN
        v_f_efectiva := v_fecha_activacion;
    END IF;

    RETURN QUERY
    WITH gastos_mes AS (
        SELECT c.estructura_egreso_id, SUM(c.valor_egreso) as total_gastado, BOOL_OR(c.tarjeta_id IS NOT NULL) as hay_tarjeta, BOOL_OR(c.tarjeta_id IS NULL AND c.tipo = 'expense') as hay_debito
        FROM v_p_caja_reportable c WHERE c.tipo = 'expense' AND c.fecha >= v_f_efectiva AND c.fecha <= v_f_fin
          AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
        GROUP BY c.estructura_egreso_id
    ),
    arrastres AS (
        SELECT e.estructura_id as estructura_egreso_id,
               COALESCE(p.monto_limite, 0) as monto_asignado_anterior,
               COALESCE(gm.total_gastado, 0) as monto_gastado_anterior,
               -- Un rubro que no tenia presupuesto en el ciclo anterior no arrastra nada:
               -- si no, cada gasto sin sobre se convierte en una deuda falsa (0 - gasto).
               CASE WHEN v_arrastre_cero OR COALESCE(p.monto_limite, 0) <= 0 THEN 0
                    ELSE COALESCE(p.monto_limite, 0) - COALESCE(gm.total_gastado, 0) END as balance_mes_anterior
        FROM p_estructuras_egresos e
        LEFT JOIN p_presupuestos p ON e.estructura_id = p.estructura_egreso_id AND p.mes_periodo = v_mes_anterior AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
        LEFT JOIN LATERAL (
            SELECT SUM(valor_egreso) as total_gastado
            FROM v_p_caja_reportable
            WHERE estructura_egreso_id = e.estructura_id
              AND tipo = 'expense'
              AND fecha >= (date_trunc('month', v_mes_anterior) + ((COALESCE(p.dia_ancla, v_dia_ancla) - 1) * INTERVAL '1 day'))::date
              AND fecha <= ((date_trunc('month', v_mes_anterior) + ((COALESCE(p.dia_ancla, v_dia_ancla) - 1) * INTERVAL '1 day')) + INTERVAL '1 month' - INTERVAL '1 day')::date
              AND ((user_id = v_user_id AND es_compartido = false) OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id AND es_compartido = true))
        ) gm ON true
        WHERE (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
    ),
    -- S3 (ronda 10, dueño): «Los meses de uso de la app y si hay diferencia de días, toma
    -- los días y divide pasando a meses». El divisor es el tiempo REAL de uso y no la
    -- cantidad de meses de calendario que tuvieron gasto: antes un rubro con un solo mes
    -- de gasto promediaba dividiendo por 1, y un mes de 25 pesos pesaba como un mes entero.
    -- Ventana: desde el primer gasto registrado hasta el inicio del ciclo, con tope de 6
    -- meses. Un mes parcial pesa por sus días.
    gastos_6m AS (
        WITH uso AS (
            SELECT
                GREATEST(
                    (SELECT MIN(c2.fecha)::date
                       FROM v_p_caja_reportable c2
                      WHERE c2.tipo = 'expense'
                        AND ((c2.user_id = v_user_id AND c2.es_compartido = false)
                             OR (v_hogar_id IS NOT NULL AND c2.hogar_id = v_hogar_id AND c2.es_compartido = true))),
                    (v_f_inicio - INTERVAL '6 months')::date
                ) AS desde,
                v_f_inicio::date AS hasta
        ),
        divisor AS (
            SELECT GREATEST(
                       LEAST(6::numeric, (hasta - desde)::numeric / 30.4375),
                       1::numeric / 30.4375
                   ) AS meses
            FROM uso
        )
        SELECT e.estructura_id AS estructura_egreso_id,
               (COALESCE(SUM(c.valor_egreso), 0) / (SELECT meses FROM divisor))::numeric AS gasto_promedio_6m
        FROM p_estructuras_egresos e
        CROSS JOIN uso u
        LEFT JOIN v_p_caja_reportable c
               ON c.estructura_egreso_id = e.estructura_id
              AND c.tipo = 'expense'
              AND c.fecha >= u.desde
              AND c.fecha < u.hasta
              AND ((c.user_id = v_user_id AND c.es_compartido = false)
                   OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
        WHERE (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
        GROUP BY e.estructura_id
    ),
    -- Las filas de abajo son las de siempre (hijos y rubros sin hijos).
    filas(estructura_id, nombre_categoria, icono, color, tipo_cupo, padre_id, monto_asignado, monto_gastado, monto_disponible, arrastre_mes_anterior, estado_sobre, metodo_sobregasto, monto_asignado_anterior, monto_gastado_anterior, gasto_promedio_6m, es_padre, cuenta_en_totales) AS (
    SELECT e.estructura_id, e.nombre_cuenta::text, e.icono::text, e.color::text, COALESCE(padre.tipo_cupo, e.tipo_cupo)::text, e.padre_id,
           COALESCE(p.monto_limite, 0)::numeric, COALESCE(gm.total_gastado, 0)::numeric,
           (COALESCE(arr.balance_mes_anterior, 0) + COALESCE(p.monto_limite, 0) - COALESCE(gm.total_gastado, 0))::numeric,
           COALESCE(arr.balance_mes_anterior, 0)::numeric,
           CASE
               WHEN (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(arr.balance_mes_anterior, 0) END + COALESCE(p.monto_limite, 0)) = 0 AND COALESCE(gm.total_gastado, 0) = 0 THEN 'sin_movimiento'::text
               WHEN COALESCE(gm.total_gastado, 0) <= (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(arr.balance_mes_anterior, 0) END + COALESCE(p.monto_limite, 0)) * 0.70 THEN 'verde'::text
               WHEN COALESCE(gm.total_gastado, 0) <= (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(arr.balance_mes_anterior, 0) END + COALESCE(p.monto_limite, 0)) THEN 'amarillo_precaucion'::text
               ELSE 'rojo_excedido'::text
           END,
           CASE WHEN COALESCE(gm.total_gastado, 0) > (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(arr.balance_mes_anterior, 0) END + COALESCE(p.monto_limite, 0)) THEN
               CASE WHEN gm.hay_tarjeta AND NOT gm.hay_debito THEN 'credito'::text WHEN gm.hay_debito AND NOT gm.hay_tarjeta THEN 'debito'::text ELSE 'mixto'::text END
           ELSE NULL END,
           COALESCE(arr.monto_asignado_anterior, 0)::numeric,
           COALESCE(arr.monto_gastado_anterior, 0)::numeric,
           COALESCE(g6.gasto_promedio_6m, 0)::numeric,
           false AS es_padre,
           -- S15: una fila cuenta en los totales salvo que su padre tenga presupuesto
           -- mayor a cero en este mismo ciclo. Asi, cuando el padre recibe presupuesto,
           -- la asignacion del hijo deja de contarse por separado.
           NOT EXISTS (
               SELECT 1 FROM p_presupuestos pp
               WHERE pp.estructura_egreso_id = e.padre_id
                 AND pp.mes_periodo = v_mes_truncado
                 AND (pp.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND pp.hogar_id = v_hogar_id))
                 AND COALESCE(pp.monto_limite, 0) > 0
           ) AS cuenta_en_totales
    FROM p_estructuras_egresos e
    LEFT JOIN p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
    LEFT JOIN p_presupuestos p ON e.estructura_id = p.estructura_egreso_id AND p.mes_periodo = v_mes_truncado AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
    LEFT JOIN gastos_mes gm ON e.estructura_id = gm.estructura_egreso_id
    LEFT JOIN arrastres arr ON e.estructura_id = arr.estructura_egreso_id
    LEFT JOIN gastos_6m g6 ON e.estructura_id = g6.estructura_egreso_id
    WHERE (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
      AND (e.padre_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM p_estructuras_egresos h WHERE h.padre_id = e.estructura_id))
    )
    -- S6/S11: la fila del padre es la suma exacta de las filas de sus hijos. No tiene
    -- gasto propio (S4: los rubros padre con hijos no reciben gastos), no tiene arrastre
    -- propio y siempre cuenta en los totales, porque es el techo del grupo.
    SELECT * FROM (
    SELECT filas.* FROM filas
    UNION ALL
    SELECT e.estructura_id,
           e.nombre_cuenta::text,
           e.icono::text,
           e.color::text,
           COALESCE(abuelo.tipo_cupo, e.tipo_cupo)::text,
           e.padre_id,
           COALESCE(p.monto_limite, 0)::numeric,
           COALESCE(SUM(f.monto_gastado), 0)::numeric,
           (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(SUM(f.arrastre_mes_anterior), 0) END
            + COALESCE(p.monto_limite, 0) - COALESCE(SUM(f.monto_gastado), 0))::numeric,
           COALESCE(SUM(f.arrastre_mes_anterior), 0)::numeric,
           CASE
               WHEN (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(SUM(f.arrastre_mes_anterior), 0) END + COALESCE(p.monto_limite, 0)) = 0
                    AND COALESCE(SUM(f.monto_gastado), 0) = 0 THEN 'sin_movimiento'::text
               WHEN COALESCE(SUM(f.monto_gastado), 0) <= (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(SUM(f.arrastre_mes_anterior), 0) END + COALESCE(p.monto_limite, 0)) * 0.70 THEN 'verde'::text
               WHEN COALESCE(SUM(f.monto_gastado), 0) <= (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(SUM(f.arrastre_mes_anterior), 0) END + COALESCE(p.monto_limite, 0)) THEN 'amarillo_precaucion'::text
               ELSE 'rojo_excedido'::text
           END,
           CASE WHEN COALESCE(SUM(f.monto_gastado), 0) > (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(SUM(f.arrastre_mes_anterior), 0) END + COALESCE(p.monto_limite, 0)) THEN
               CASE
                   WHEN COUNT(*) FILTER (WHERE f.metodo_sobregasto = 'mixto') > 0 THEN 'mixto'::text
                   WHEN COUNT(*) FILTER (WHERE f.metodo_sobregasto = 'credito') > 0 AND COUNT(*) FILTER (WHERE f.metodo_sobregasto = 'debito') > 0 THEN 'mixto'::text
                   WHEN COUNT(*) FILTER (WHERE f.metodo_sobregasto = 'credito') > 0 THEN 'credito'::text
                   WHEN COUNT(*) FILTER (WHERE f.metodo_sobregasto = 'debito') > 0 THEN 'debito'::text
                   ELSE NULL
               END
           ELSE NULL END,
           COALESCE(SUM(f.monto_asignado_anterior), 0)::numeric,
           COALESCE(SUM(f.monto_gastado_anterior), 0)::numeric,
           COALESCE(SUM(f.gasto_promedio_6m), 0)::numeric,
           true,
           true
    FROM p_estructuras_egresos e
    LEFT JOIN p_estructuras_egresos abuelo ON abuelo.estructura_id = e.padre_id
    -- El padre aparece SIEMPRE que tenga hijos, tenga o no presupuesto: si no, no habria
    -- forma de asignarle uno desde la pantalla (el reporte era la unica fuente de la
    -- lista). Sin presupuesto su monto es 0 y suma 0 a los totales.
    LEFT JOIN p_presupuestos p ON p.estructura_egreso_id = e.estructura_id
         AND p.mes_periodo = v_mes_truncado
         AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
    JOIN filas f ON f.padre_id = e.estructura_id
    WHERE (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
    GROUP BY e.estructura_id, e.nombre_cuenta, e.icono, e.color, e.tipo_cupo, e.padre_id, abuelo.tipo_cupo, p.monto_limite
    ) u
    ORDER BY CASE u.tipo_cupo WHEN 'need' THEN 1 WHEN 'want' THEN 2 WHEN 'investment' THEN 3 WHEN 'saving' THEN 4 WHEN 'tithe' THEN 5 ELSE 6 END, u.monto_gastado DESC;
END;

$function$

-- NOTA (ronda 10, T14): el promedio de 6 meses pasó a medirse por DÍAS DE USO REAL.
-- Antes el CTE gastos_6m hacía AVG sobre las ventanas de mes calendario que tuvieran
-- gasto (WHERE agg.gasto_mensual > 0), así que un rubro con un solo mes de gasto
-- promediaba dividiendo por 1 y un mes de 25 pesos pesaba como un mes entero.
-- Ahora el divisor es LEAST(6, días cubiertos / 30,4375) y la ventana arranca en
-- MAX(primer gasto registrado, inicio del ciclo − 6 meses): los meses parciales pesan
-- por sus días y una cuenta joven divide por el tiempo que lleva usándose.
-- Decisión del dueño: «Los meses de uso de la app y si hay diferencia de días, toma los
-- días y divide pasando a meses» + «no hay ningún problema que tengamos un mes con 25
-- porque es real y eso debe afectar el promedio sí o sí».
-- La agregación de los rubros padre vive FUERA de ese CTE y quedó intacta: el promedio
-- de un padre sigue saliendo de sus hijos.
