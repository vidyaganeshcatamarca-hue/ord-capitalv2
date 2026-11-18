CREATE OR REPLACE FUNCTION public.fn_repetir_presupuestos_ciclo(p_mes date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_modo text;
    v_inicio date;
    v_mes date;
    v_mes_ant date;
    v_creadas int := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT modo_presupuesto INTO v_modo FROM public.p_presupuestos_config WHERE user_id = v_user_id;
    -- Base cero no repite: el arrastre ya trae el saldo del ciclo anterior.
    IF COALESCE(v_modo, '') <> 'anticipado' THEN RETURN 0; END IF;

    -- El ciclo activo lo decide el servidor con la fecha de hoy, nunca la pantalla:
    -- asi navegar a un ciclo pasado no puede escribir filas retroactivas.
    SELECT fecha_inicio INTO v_inicio
      FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
    IF v_inicio IS NULL THEN RETURN 0; END IF;

    -- Si la pantalla pide otro ciclo, no se hace nada: esto es solo para el vigente.
    IF p_mes IS NOT NULL AND date_trunc('month', p_mes) <> date_trunc('month', v_inicio) THEN
        RETURN 0;
    END IF;

    -- p_presupuestos se indexa por el primer dia del mes del ciclo, no por el dia del
    -- ancla: por eso se trunca.
    v_mes := date_trunc('month', v_inicio)::date;
    v_mes_ant := (v_mes - INTERVAL '1 month')::date;

    -- Sin ciclo anterior asignado no hay nada que repetir.
    IF NOT EXISTS (SELECT 1 FROM public.p_presupuestos p
                    WHERE p.user_id = v_user_id
                      AND p.mes_periodo = v_mes_ant
                      AND COALESCE(p.monto_limite, 0) <> 0) THEN
        RETURN 0;
    END IF;

    -- Si el ciclo activo ya tiene plata asignada, el usuario ya lo armo: no se toca.
    IF EXISTS (SELECT 1 FROM public.p_presupuestos p
                WHERE p.user_id = v_user_id
                  AND p.mes_periodo = v_mes
                  AND COALESCE(p.monto_limite, 0) <> 0) THEN
        RETURN 0;
    END IF;

    INSERT INTO public.p_presupuestos (user_id, hogar_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla)
    SELECT v_user_id, p.hogar_id, p.estructura_egreso_id, v_mes, p.monto_limite, p.dia_ancla
      FROM public.p_presupuestos p
     WHERE p.user_id = v_user_id
       AND p.mes_periodo = v_mes_ant
       AND COALESCE(p.monto_limite, 0) > 0
       AND NOT EXISTS (
           SELECT 1 FROM public.p_presupuestos x
            WHERE x.user_id = v_user_id
              AND x.mes_periodo = v_mes
              AND x.estructura_egreso_id = p.estructura_egreso_id);
    GET DIAGNOSTICS v_creadas = ROW_COUNT;

    -- El rastro: la repeticion no es magia, tiene que poder leerse despues.
    IF v_creadas > 0 THEN
        INSERT INTO public.p_presupuestos_historial
            (estructura_egreso_id, user_id, hogar_id, mes_periodo, dia_ancla, monto_limite, motivo, creado_at)
        SELECT p.estructura_egreso_id, v_user_id, p.hogar_id, v_mes, p.dia_ancla, p.monto_limite,
               'repeticion_mensual', now()
          FROM public.p_presupuestos p
         WHERE p.user_id = v_user_id
           AND p.mes_periodo = v_mes
           AND COALESCE(p.monto_limite, 0) > 0
           AND NOT EXISTS (
               SELECT 1 FROM public.p_presupuestos_historial h
                WHERE h.user_id = v_user_id
                  AND h.mes_periodo = v_mes
                  AND h.estructura_egreso_id = p.estructura_egreso_id
                  AND h.motivo = 'repeticion_mensual');
    END IF;

    RETURN v_creadas;
END;
$function$
