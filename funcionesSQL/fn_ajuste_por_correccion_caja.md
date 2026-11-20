CREATE OR REPLACE FUNCTION public.fn_ajuste_por_correccion_caja()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_old_mes date;
    v_new_mes date;
    v_old_grupo bigint;
    v_new_grupo bigint;
    v_old_monto numeric := 0;
    v_new_monto numeric := 0;
    v_cerrado boolean;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.tipo = 'expense' THEN
        v_old_mes := date_trunc('month', OLD.fecha)::date;
        v_old_grupo := public.fn_grupo_de_estructura(OLD.estructura_egreso_id);
        v_old_monto := COALESCE(OLD.valor_local, OLD.valor_egreso, 0);
        SELECT EXISTS (SELECT 1 FROM public.p_presupuestos_cierre c
                        WHERE c.tipo = 'ciclo' AND c.mes_periodo = v_old_mes
                          AND COALESCE(c.user_id,0) = COALESCE(OLD.user_id,0)
                          AND COALESCE(c.hogar_id,0) = COALESCE(OLD.hogar_id,0)) INTO v_cerrado;
        IF v_cerrado AND v_old_monto <> 0 THEN
            PERFORM public.fn_registrar_ajuste_presupuesto(
                OLD.user_id, OLD.hogar_id, OLD.p_caja_id, v_old_grupo, v_old_mes, v_old_monto);
        END IF;
    END IF;

    IF TG_OP IN ('UPDATE', 'INSERT') AND NEW.tipo = 'expense' THEN
        v_new_mes := date_trunc('month', NEW.fecha)::date;
        v_new_grupo := public.fn_grupo_de_estructura(NEW.estructura_egreso_id);
        v_new_monto := COALESCE(NEW.valor_local, NEW.valor_egreso, 0);
        SELECT EXISTS (SELECT 1 FROM public.p_presupuestos_cierre c
                        WHERE c.tipo = 'ciclo' AND c.mes_periodo = v_new_mes
                          AND COALESCE(c.user_id,0) = COALESCE(NEW.user_id,0)
                          AND COALESCE(c.hogar_id,0) = COALESCE(NEW.hogar_id,0)) INTO v_cerrado;
        IF v_cerrado AND v_new_monto <> 0 THEN
            PERFORM public.fn_registrar_ajuste_presupuesto(
                NEW.user_id, NEW.hogar_id, NEW.p_caja_id, v_new_grupo, v_new_mes, -v_new_monto);
        END IF;
    END IF;

    RETURN NULL;
END;
$function$
