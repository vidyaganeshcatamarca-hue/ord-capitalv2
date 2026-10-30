-- 168: asignar 0 a un rubro devuelve la plata al pozo.
--
-- Pedido del dueno: en la hoja de asignar, escribir 0 dejaba el boton gris y no
-- habia forma de soltar un presupuesto. En el frontend el campo es aditivo
-- (asignado + monto), asi que el 0 se trata como "dejar en cero" y ejecutarAsignacion
-- ya acepta 0.
--
-- Del lado de la base el unico bloqueo era el guard del padre, que rechaza un monto
-- menor a lo ya repartido entre los hijos. Un padre en 0 significa "sin techo" (el
-- guard de los hijos ya se saltea cuando el techo es 0), asi que el 0 es la unica
-- forma legitima de bajar por debajo de lo repartido.
-- 164: en base cero, reservar a un hijo dentro del techo del padre no toca el pozo.
--
-- Defecto encontrado preparando las pruebas de UI sobre el usuario 198 (base cero, padre
-- 4265 con 5 hijos): con el padre asignado en 2.000 sobre un pozo de 2.109,91, asignar
-- 500 a un hijo se rechazaba con error_budget_insufficient_base_zero. Es una porcion del
-- techo del padre, no plata nueva (S14), asi que el guard del pozo no corresponde y ademas
-- dejaba la feature inservible en base cero.
--
-- Ahora la busqueda del padre y su techo se hace antes del guard, y el guard se saltea
-- cuando el rubro vive dentro de un techo. El techo sigue validando (S2/S7).
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
    
    -- S14: reservar a un hijo de un padre con presupuesto no gasta plata: es una
    -- porcion del techo del padre. Por eso el padre se busca antes del guard de base
    -- cero, para poder saltearlo cuando el rubro vive dentro de un techo.
    SELECT padre_id INTO v_padre_id
      FROM public.p_estructuras_egresos
     WHERE estructura_id = p_estructura_egreso_id;

    IF v_padre_id IS NOT NULL THEN
        SELECT monto_limite INTO v_techo_padre
          FROM public.p_presupuestos
         WHERE estructura_egreso_id = v_padre_id
           AND mes_periodo = v_mes_truncado
           AND user_id = v_user_id;
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
        
        -- El guard del pozo no aplica cuando el rubro esta dentro del techo de un padre
        -- con presupuesto: esa plata ya salio del pozo al asignar el padre, y volver a
        -- pedirla aca rechazaria cualquier asignacion a un hijo (S14).
        IF COALESCE(v_techo_padre, 0) = 0
           AND p_monto_asignado > (v_saldo_disponible + v_monto_previo) THEN
            RAISE EXCEPTION '{"key": "error_budget_insufficient_base_zero", "params": {}}';
        END IF;
    END IF;

    -- S2/S7/S15: el techo del padre (ya resuelto arriba, antes del guard del pozo).
    IF v_padre_id IS NOT NULL THEN
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

        -- Dueno (2026-10-30): poner 0 en un padre tiene que quitarle el presupuesto
        -- y devolver la plata al pozo. Sin esta excepcion el guard lo rechazaba justo
        -- cuando hacia falta poder soltarlo: un padre en 0 ya no impone techo.
        IF p_monto_asignado > 0 AND v_repartido > p_monto_asignado THEN
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
