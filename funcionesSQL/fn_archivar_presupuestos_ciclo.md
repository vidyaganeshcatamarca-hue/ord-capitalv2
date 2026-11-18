CREATE OR REPLACE FUNCTION public.fn_archivar_presupuestos_ciclo(p_user_id bigint, p_mes_periodo date, p_motivo text, p_modo_origen text, p_modo_destino text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_filas integer := 0;
BEGIN
    INSERT INTO public.p_presupuestos_historial (
        presupuesto_id, estructura_egreso_id, user_id, hogar_id,
        mes_periodo, dia_ancla, monto_limite, motivo, modo_origen, modo_destino)
    SELECT p.presupuesto_id, p.estructura_egreso_id, p.user_id, p.hogar_id,
           p.mes_periodo, p.dia_ancla, p.monto_limite, p_motivo, p_modo_origen, p_modo_destino
    FROM public.p_presupuestos p
    WHERE p.user_id = p_user_id
      AND p.mes_periodo = p_mes_periodo
      AND p.monto_limite <> 0;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    RETURN v_filas;
END;
$function$
