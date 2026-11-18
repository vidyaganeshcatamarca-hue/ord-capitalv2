-- Etapa 4, parte 1: moneda y cruce del ciclo.
--
-- Corre en una transacción que termina en RAISE EXCEPTION: no deja una fila.
-- Comprueba dos reglas:
--   A · el gasto de un sobre entra con su equivalente en moneda local, no con el nominal.
--   B · la bolsa del padre descuenta ese mismo equivalente.
--   C · el reporte mensual encuentra los presupuestos aunque el ciclo no empiece el día 1.
--   D · los avisos de categoría en rojo devuelven lo mismo con cualquier día de arranque.
DO $t$
DECLARE
    v_jwt text; v_uid bigint; r jsonb := '[]'::jsonb;
    v_ciclo date := date_trunc('month', CURRENT_DATE)::date;
    v_hoja bigint;
    v_local numeric := 0; v_nominal numeric := 0;
    v_gastado numeric := 0;
    v_padre bigint; v_pot_antes numeric := 0; v_pot_despues numeric := 0;
    v_report record;
    v_c15 int := 0; v_c1 int := 0;
    v_a15 int := 0; v_a1 int := 0;
    v_dia int := EXTRACT(DAY FROM CURRENT_DATE)::int;
BEGIN
    SELECT user_id, auth_id::text INTO v_uid, v_jwt
      FROM public.usuarios WHERE auth_id IS NOT NULL ORDER BY user_id LIMIT 1;
    IF v_uid IS NULL THEN RAISE EXCEPTION 'no hay usuario para probar'; END IF;
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_jwt, 'role', 'authenticated')::text, true);

    -- Hoja del ciclo donde el importe local y el nominal NO coinciden: es el único
    -- lugar donde el cambio se puede observar. Si no hay ninguna, el caso lo dice.
    SELECT c.estructura_egreso_id INTO v_hoja
      FROM public.v_p_caja_reportable c
     WHERE c.user_id = v_uid
       AND c.tipo = 'expense'
       AND c.estructura_egreso_id IS NOT NULL
       AND c.fecha >= v_ciclo
       AND c.fecha < (v_ciclo + INTERVAL '1 month')
     GROUP BY c.estructura_egreso_id
    HAVING SUM(c.valor_egreso) <> SUM(COALESCE(c.valor_local, c.valor_egreso))
     ORDER BY abs(SUM(c.valor_egreso) - SUM(COALESCE(c.valor_local, c.valor_egreso))) DESC
     LIMIT 1;

    IF v_hoja IS NULL THEN
        r := r || jsonb_build_object('caso', 'A gasto con equivalente', 'ok', false,
            'error', 'no hay ningun gasto del ciclo con importe local distinto del nominal');
    ELSE
        SELECT SUM(COALESCE(c.valor_local, c.valor_egreso)), SUM(c.valor_egreso)
          INTO v_local, v_nominal
          FROM public.v_p_caja_reportable c
         WHERE c.user_id = v_uid
           AND c.tipo = 'expense'
           AND c.estructura_egreso_id = v_hoja
           AND c.fecha >= v_ciclo
           AND c.fecha < (v_ciclo + INTERVAL '1 month');

        SELECT monto_gastado INTO v_gastado
          FROM public.fn_reporte_sobres_detalle(v_ciclo) WHERE estructura_id = v_hoja;

        -- La igualdad dice que usa el local; que local <> nominal dice que la
        -- igualdad discrimina y no es casualidad.
        r := r || jsonb_build_object('caso', 'A gasto con equivalente', 'ok',
            (v_gastado = v_local AND v_local <> v_nominal),
            'hoja', v_hoja, 'reporte', v_gastado, 'local', v_local, 'nominal', v_nominal);
    END IF;

    -- B · la bolsa del padre descuenta el gasto de sus hijos con el importe local.
    -- Se prueba por comportamiento: se suma un millón al equivalente local del primer
    -- gasto de un hijo, sin tocar el nominal, y la bolsa tiene que bajar exactamente eso.
    -- Asi el caso falla si la bolsa ignora a los hijos (etapa 2) o si usa el nominal.
    SELECT e.padre_id INTO v_padre FROM public.p_estructuras_egresos e WHERE e.estructura_id = v_hoja;
    IF v_padre IS NULL THEN
        r := r || jsonb_build_object('caso', 'B bolsa con equivalente', 'ok', false,
            'error', 'la hoja elegida no tiene padre');
    ELSE
        v_pot_antes := public.fn_disponible_transferible(v_padre, v_ciclo);

        UPDATE public.p_caja c
           SET valor_local = COALESCE(c.valor_local, c.valor_egreso) + 1000000
         WHERE c.ctid = (
               SELECT x.ctid
                 FROM public.p_caja x
                 JOIN public.p_estructuras_egresos e ON e.estructura_id = x.estructura_egreso_id
                WHERE x.user_id = v_uid
                  AND x.tipo = 'expense'
                  AND e.padre_id = v_padre
                  AND x.fecha >= v_ciclo
                  AND x.fecha < (v_ciclo + INTERVAL '1 month')
                  AND COALESCE(x.metadata->>'transfer_double_insert', 'false') <> 'true'
                LIMIT 1);

        v_pot_despues := public.fn_disponible_transferible(v_padre, v_ciclo);

        r := r || jsonb_build_object('caso', 'B bolsa con equivalente', 'ok',
            (v_pot_antes - v_pot_despues = 1000000),
            'padre', v_padre, 'bolsa_antes', v_pot_antes, 'bolsa_despues', v_pot_despues,
            'baja', v_pot_antes - v_pot_despues, 'esperado', 1000000);
    END IF;

    -- C · el reporte mensual encuentra los presupuestos con el ciclo arrancando el 15
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 15 WHERE user_id = v_uid;
    UPDATE public.p_presupuestos SET dia_ancla = 15
     WHERE user_id = v_uid AND mes_periodo = v_ciclo AND dia_ancla IS NOT NULL;
    SELECT count(*) INTO v_c15 FROM public.fn_reporte_presupuestos_mensuales();

    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 1 WHERE user_id = v_uid;
    UPDATE public.p_presupuestos SET dia_ancla = 1
     WHERE user_id = v_uid AND mes_periodo = v_ciclo AND dia_ancla IS NOT NULL;
    SELECT count(*) INTO v_c1 FROM public.fn_reporte_presupuestos_mensuales();

    r := r || jsonb_build_object('caso', 'C reporte mensual cruza el ciclo', 'ok',
        (v_c15 > 0 AND (v_dia < 15 OR v_c15 = v_c1)),
        'filas_ancla_15', v_c15, 'filas_ancla_1', v_c1, 'dia_de_hoy', v_dia);

    -- D · los avisos en rojo devuelven lo mismo con cualquier día de arranque
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 15 WHERE user_id = v_uid;
    SELECT count(*) INTO v_a15 FROM public.fn_aviso_categoria_en_rojo();
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 1 WHERE user_id = v_uid;
    SELECT count(*) INTO v_a1 FROM public.fn_aviso_categoria_en_rojo();

    r := r || jsonb_build_object('caso', 'D avisos en rojo cruzan el ciclo', 'ok',
        (v_a15 = v_a1), 'avisos_ancla_15', v_a15, 'avisos_ancla_1', v_a1);

    RAISE EXCEPTION 'RESULTADO %', r::text;
END;
$t$;
