CREATE OR REPLACE FUNCTION public.fn_ejecutar_conciliacion(p_billetera_id bigint, p_saldo_real numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint; v_saldo_teorico numeric; v_diferencia numeric; 
    v_cuenta_misterio_padre_id int8; v_subcuenta_misterio_hija_id int8;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT saldo_actual INTO v_saldo_teorico FROM public.p_billeteras WHERE billetera_id = p_billetera_id AND user_id = v_user_id;
    IF v_saldo_teorico IS NULL THEN -- guard: billetera inexistente o ajena
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}'; 
    END IF;
    v_diferencia := p_saldo_real - v_saldo_teorico;
    
    -- Telemetria Tanda 3: registro SIEMPRE en p_conciliaciones (incluida
    -- diferencia = 0). Sin backfill historico: arranca desde el despliegue.
    INSERT INTO public.p_conciliaciones (user_id, billetera_id, fecha, saldo_teorico, saldo_real, diferencia)
    VALUES (v_user_id, p_billetera_id, now(), v_saldo_teorico, p_saldo_real, v_diferencia);
    
    -- Actualizar semáforo (fecha de conciliación) incluso si no hay diferencias
    IF v_diferencia = 0 THEN 
        UPDATE public.p_billeteras SET ultima_conciliacion_at = now() WHERE billetera_id = p_billetera_id;
        RETURN; 
    END IF;
    
    SELECT estructura_id INTO v_cuenta_misterio_padre_id FROM public.p_estructuras_egresos WHERE nombre_cuenta = 'cat_mystery' AND user_id = v_user_id AND padre_id IS NULL;
    SELECT estructura_id INTO v_subcuenta_misterio_hija_id FROM public.p_estructuras_egresos WHERE padre_id = v_cuenta_misterio_padre_id AND nombre_cuenta = 'no_detail' AND user_id = v_user_id;
    
    IF v_diferencia > 0 THEN 
        INSERT INTO public.p_caja (user_id, fecha, tipo, billetera_origen_id, valor_ingreso, valor_egreso, detalle) 
        VALUES (v_user_id, CURRENT_DATE, 'adjustment', p_billetera_id, v_diferencia, 0, 'adjustment_surplus');
    ELSE 
        INSERT INTO public.p_caja (user_id, fecha, tipo, billetera_origen_id, valor_ingreso, valor_egreso, estructura_egreso_id, detalle) 
        VALUES (v_user_id, CURRENT_DATE, 'adjustment', p_billetera_id, 0, ABS(v_diferencia), v_subcuenta_misterio_hija_id, 'adjustment_mystery'); 
    END IF;
    
    UPDATE public.p_billeteras SET ultima_conciliacion_at = now() WHERE billetera_id = p_billetera_id;
END;
$function$
