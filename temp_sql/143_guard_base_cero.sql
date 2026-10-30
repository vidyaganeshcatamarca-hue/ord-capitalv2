-- 143: la guarda de base cero deja de saltearse en la primera asignacion de un sobre.
-- Auditoria F-02: con saldo -998.089 el servidor acepto un limite de 999.949 sobre un
-- sobre sin fila previa, y rechazo el mismo limite sobre un sobre con fila.
-- Causa: el SELECT ... INTO v_monto_previo no asigna nada si no hay fila, el COALESCE
-- de adentro nunca se evalua, y la comparacion con NULL no dispara el IF.

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

    INSERT INTO public.p_presupuestos (estructura_egreso_id, user_id, hogar_id, monto_limite, mes_periodo, dia_ancla)
    VALUES (p_estructura_egreso_id, v_user_id, v_hogar_id, p_monto_asignado, v_mes_truncado, v_dia_ancla)
    ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0)) 
    DO UPDATE SET monto_limite = EXCLUDED.monto_limite, dia_ancla = EXCLUDED.dia_ancla;
END;
$function$;
