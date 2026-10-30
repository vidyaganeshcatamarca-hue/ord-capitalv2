-- 158: fn_asignar_presupuesto valida el techo del padre.
--
-- T3 de la feature de presupuesto en rubros padre (S2, S7, S15). Tres reglas:
--   1. Un hijo de un padre con presupuesto no puede pasarse de lo que queda libre del
--      techo, contando lo ya repartido en sus hermanos.
--   2. Bajar el presupuesto de un padre por debajo de lo repartido en sus hijos se
--      rechaza con el detalle de cuanto hay que recortar (no se toca a los hijos).
--   3. Sin presupuesto en el padre no hay techo: los hijos son independientes, como hoy.
--
-- Los errores salen con la forma que ya usa la base: {"key": ..., "params": {...}}, con
-- los numeros adentro para que la UI los interpole. Nada de texto hardcodeado (regla 9).
CREATE OR REPLACE FUNCTION public.fn_asignar_presupuesto(p_estructura_egreso_id bigint, p_monto_asignado numeric, p_mes_periodo date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_modo_presupuesto text;
    v_saldo_disponible numeric;
    v_monto_previo numeric := 0;
    v_mes_truncado date := date_trunc('month', p_mes_periodo);
    v_dia_ancla int2;
    v_padre_id bigint;
    v_techo_padre numeric;
    v_repartido numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    SELECT modo_presupuesto INTO v_modo_presupuesto FROM public.p_presupuestos_config WHERE user_id = v_user_id;
    
    SELECT dia_ancla INTO v_dia_ancla
    FROM public.p_presupuestos
    WHERE user_id = v_user_id AND mes_periodo = v_mes_truncado
    LIMIT 1;

    IF v_dia_ancla IS NULL THEN
        SELECT dia_ancla_ciclo INTO v_dia_ancla FROM public.p_presupuestos_config WHERE user_id = v_user_id;
        IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;
    END IF;
    
    IF v_modo_presupuesto = 'base_cero' THEN
        SELECT COALESCE(monto_limite, 0) INTO v_monto_previo
        FROM public.p_presupuestos 
        WHERE estructura_egreso_id = p_estructura_egreso_id AND mes_periodo = v_mes_truncado AND user_id = v_user_id;
          
        -- Sin fila previa el SELECT INTO de arriba no asigna nada: el COALESCE de
        -- adentro no se evalua. Sin esta linea v_monto_previo queda NULL, la
        -- comparacion da NULL y la guarda de base cero se saltea en la primera
        -- asignacion de cada sobre (auditoria F-02).
        v_monto_previo := COALESCE(v_monto_previo, 0);

        v_saldo_disponible := public.fn_obtener_saldo_a_asignar(p_mes_periodo);
        
        IF p_monto_asignado > (v_saldo_disponible + v_monto_previo) THEN
            RAISE EXCEPTION '{"key": "error_budget_insufficient_base_zero", "params": {}}';
        END IF;
    END IF;

    -- S2/S7/S15: el techo del padre.
    --
    -- Si el rubro tiene padre y ese padre tiene presupuesto mayor a cero en este ciclo,
    -- este hijo no puede pasarse de lo que queda libre del techo. Si el rubro ES padre,
    -- no se puede bajar su presupuesto por debajo de lo ya repartido en sus hijos: en vez
    -- de recortarles el presupuesto sin permiso, se rechaza y se dice cuanto recortar.
    --
    -- Sin presupuesto en el padre no hay techo: los hijos siguen siendo independientes,
    -- que es como funcionan hoy.
    SELECT padre_id INTO v_padre_id
      FROM public.p_estructuras_egresos
     WHERE estructura_id = p_estructura_egreso_id;

    IF v_padre_id IS NOT NULL THEN
        SELECT monto_limite INTO v_techo_padre
          FROM public.p_presupuestos
         WHERE estructura_egreso_id = v_padre_id
           AND mes_periodo = v_mes_truncado
           AND user_id = v_user_id;

        IF COALESCE(v_techo_padre, 0) > 0 THEN
            SELECT COALESCE(SUM(pr.monto_limite), 0) INTO v_repartido
              FROM public.p_presupuestos pr
              JOIN public.p_estructuras_egresos e ON e.estructura_id = pr.estructura_egreso_id
             WHERE e.padre_id = v_padre_id
               AND pr.mes_periodo = v_mes_truncado
               AND pr.user_id = v_user_id
               AND pr.estructura_egreso_id <> p_estructura_egreso_id;

            IF p_monto_asignado > (v_techo_padre - v_repartido) THEN
                RAISE EXCEPTION '%', json_build_object(
                    'key', 'error_budget_child_over_parent',
                    'params', json_build_object(
                        'disponible', GREATEST(v_techo_padre - v_repartido, 0),
                        'intento', p_monto_asignado,
                        'techo', v_techo_padre,
                        'repartido', v_repartido
                    )
                )::text;
            END IF;
        END IF;
    ELSE
        SELECT COALESCE(SUM(pr.monto_limite), 0) INTO v_repartido
          FROM public.p_presupuestos pr
          JOIN public.p_estructuras_egresos e ON e.estructura_id = pr.estructura_egreso_id
         WHERE e.padre_id = p_estructura_egreso_id
           AND pr.mes_periodo = v_mes_truncado
           AND pr.user_id = v_user_id;

        IF v_repartido > p_monto_asignado THEN
            RAISE EXCEPTION '%', json_build_object(
                'key', 'error_budget_parent_below_children',
                'params', json_build_object(
                    'repartido', v_repartido,
                    'intento', p_monto_asignado,
                    'recortar', v_repartido - p_monto_asignado
                )
            )::text;
        END IF;
    END IF;

    INSERT INTO public.p_presupuestos (estructura_egreso_id, user_id, hogar_id, monto_limite, mes_periodo, dia_ancla)
    VALUES (p_estructura_egreso_id, v_user_id, v_hogar_id, p_monto_asignado, v_mes_truncado, v_dia_ancla)
    ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0)) 
    DO UPDATE SET monto_limite = EXCLUDED.monto_limite, dia_ancla = EXCLUDED.dia_ancla;
END;
$function$
;
