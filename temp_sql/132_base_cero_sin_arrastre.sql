-- 132 — Base cero: sin arrastre y con corte en la fecha de activación
--
-- Tanda 2 de la corrección de base cero (odd/tasks/base-cero-logica.md, S2).
--
-- QUÉ ESTABA MAL
-- 1. `arrastres` calculaba `monto_limite - gastado` del mes anterior y lo sumaba a
--    `monto_disponible` SIEMPRE: el modo de presupuesto solo se usaba para pintar
--    `estado_sobre`, no para el saldo. Con los datos del user 1 quedaban vivos
--    −2.443.777 de arrastres de septiembre en un ciclo que arrancó de cero.
-- 2. `gastos_mes` sumaba `p_caja` desde el inicio del ciclo sin mirar la fecha de
--    activación: al pasarse a base cero el 27/10, 24 movimientos por 2.287.700
--    contaban como gasto del ciclo y todos los sobres nacían en rojo.
--    La columna `fecha_activacion_base_cero` existía desde el principio y nadie
--    la leía.
--
-- QUÉ HACE AHORA
--   - En base cero, `arrastre_mes_anterior` es 0 en todos los ciclos: el modo se
--     define por asignar cada peso desde cero, no por arrastrar saldos. Los
--     ciclos que el usuario vivió en modo anticipado no cambian para cuando los
--     mira en el historial.
--   - En el ciclo en que se activó, `monto_gastado` cuenta solo los movimientos
--     con `fecha >= fecha_activacion_base_cero`. Los anteriores no se borran ni se
--     tocan: siguen en `p_caja`, simplemente no se les exige un sobre.
--   - Sin fecha de activación (usuarios anteriores a la columna) no se inventa un
--     corte: se mantiene el gasto completo del ciclo. Solo se apaga el arrastre,
--     que en base cero nunca corresponde.
--   - `monto_asignado_anterior` y `monto_gastado_anterior` NO se tocan: son la
--     historia que usan las sugerencias de asignación.
--
-- Nada de esto migra datos: es el reporte. La tanda no escribe una sola fila.
--
-- ANTES (user 1, ciclo 1/10–31/10, activado el 27/10):
--   arrastre −2.443.777 | gastado 2.287.700 | disponible 2.378.745
-- DESPUÉS:
--   arrastre 0 | gastado 0 | disponible 2.627.275 (= liquidez real)

CREATE OR REPLACE FUNCTION public.fn_reporte_sobres_detalle(p_mes_periodo date DEFAULT date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))
 RETURNS TABLE(estructura_id bigint, nombre_categoria text, icono text, color text, tipo_cupo text, padre_id bigint, monto_asignado numeric, monto_gastado numeric, monto_disponible numeric, arrastre_mes_anterior numeric, estado_sobre text, metodo_sobregasto text, monto_asignado_anterior numeric, monto_gastado_anterior numeric, gasto_promedio_6m numeric)
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
    v_arrastre_cero := (v_modo_presupuesto = 'base_cero');
    v_f_efectiva := v_f_inicio;
    IF v_fecha_activacion IS NOT NULL AND v_fecha_activacion BETWEEN v_f_inicio AND v_f_fin THEN
        v_f_efectiva := v_fecha_activacion;
    END IF;

    RETURN QUERY
    WITH gastos_mes AS (
        SELECT c.estructura_egreso_id, SUM(c.valor_egreso) as total_gastado, BOOL_OR(c.tarjeta_id IS NOT NULL) as hay_tarjeta, BOOL_OR(c.tarjeta_id IS NULL AND c.tipo = 'expense') as hay_debito
        FROM p_caja c WHERE c.tipo = 'expense' AND c.fecha >= v_f_efectiva AND c.fecha <= v_f_fin
          AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
        GROUP BY c.estructura_egreso_id
    ),
    arrastres AS (
        SELECT e.estructura_id as estructura_egreso_id,
               COALESCE(p.monto_limite, 0) as monto_asignado_anterior,
               COALESCE(gm.total_gastado, 0) as monto_gastado_anterior,
               CASE WHEN v_arrastre_cero THEN 0
                    ELSE COALESCE(p.monto_limite, 0) - COALESCE(gm.total_gastado, 0) END as balance_mes_anterior
        FROM p_estructuras_egresos e
        LEFT JOIN p_presupuestos p ON e.estructura_id = p.estructura_egreso_id AND p.mes_periodo = v_mes_anterior AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
        LEFT JOIN LATERAL (
            SELECT SUM(valor_egreso) as total_gastado
            FROM p_caja
            WHERE estructura_egreso_id = e.estructura_id
              AND tipo = 'expense'
              AND fecha >= (date_trunc('month', v_mes_anterior) + ((COALESCE(p.dia_ancla, v_dia_ancla) - 1) * INTERVAL '1 day'))::date
              AND fecha <= ((date_trunc('month', v_mes_anterior) + ((COALESCE(p.dia_ancla, v_dia_ancla) - 1) * INTERVAL '1 day')) + INTERVAL '1 month' - INTERVAL '1 day')::date
              AND ((user_id = v_user_id AND es_compartido = false) OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id AND es_compartido = true))
        ) gm ON true
        WHERE (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
    ),
    -- Last 6 completed cycles (window k = [v_f_inicio - k months,
    -- v_f_inicio - (k-1) months - 1 day]); window 1 = the previous cycle.
    gastos_6m AS (
        SELECT agg.estructura_id as estructura_egreso_id,
               AVG(agg.gasto_mensual)::numeric AS gasto_promedio_6m
        FROM (
            SELECT e.estructura_id, g.i,
                   COALESCE((
                       SELECT SUM(c.valor_egreso)
                       FROM p_caja c
                       WHERE c.estructura_egreso_id = e.estructura_id
                         AND c.tipo = 'expense'
                         AND c.fecha >= (v_f_inicio - (g.i * INTERVAL '1 month'))::date
                         AND c.fecha <= (v_f_inicio - ((g.i - 1) * INTERVAL '1 month') - INTERVAL '1 day')::date
                         AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
                   ), 0) AS gasto_mensual
            FROM p_estructuras_egresos e
            CROSS JOIN generate_series(1, 6) AS g(i)
            WHERE (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
        ) agg
        WHERE agg.gasto_mensual > 0
        GROUP BY agg.estructura_id
    )
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
           COALESCE(g6.gasto_promedio_6m, 0)::numeric
    FROM p_estructuras_egresos e
    LEFT JOIN p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
    LEFT JOIN p_presupuestos p ON e.estructura_id = p.estructura_egreso_id AND p.mes_periodo = v_mes_truncado AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
    LEFT JOIN gastos_mes gm ON e.estructura_id = gm.estructura_egreso_id
    LEFT JOIN arrastres arr ON e.estructura_id = arr.estructura_egreso_id
    LEFT JOIN gastos_6m g6 ON e.estructura_id = g6.estructura_egreso_id
    WHERE (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
      AND (e.padre_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM p_estructuras_egresos h WHERE h.padre_id = e.estructura_id))
    ORDER BY CASE COALESCE(padre.tipo_cupo, e.tipo_cupo) WHEN 'need' THEN 1 WHEN 'want' THEN 2 WHEN 'investment' THEN 3 WHEN 'saving' THEN 4 WHEN 'tithe' THEN 5 ELSE 6 END, COALESCE(gm.total_gastado, 0) DESC;
END;

$function$;
