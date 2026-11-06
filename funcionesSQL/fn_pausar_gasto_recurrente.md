CREATE OR REPLACE FUNCTION public.fn_pausar_gasto_recurrente(p_recurrente_id bigint, p_activo boolean, p_motivo_pausa text DEFAULT NULL::text, p_fecha_base date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_motivo  text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_activo IS FALSE THEN
        v_motivo := COALESCE(p_motivo_pausa, 'pausado_por_usuario');
        IF v_motivo NOT IN ('pausado_por_usuario','billetera_eliminada',
                            'categoria_movida','subcuenta_creada') THEN
            RAISE EXCEPTION '{"key": "error_recurrent_motivo_invalid", "params": {}}';
        END IF;
    ELSE
        v_motivo := NULL;   -- reactivar limpia la razón y el sello de tiempo
    END IF;

    UPDATE public.p_gastos_recurrentes
       SET activo       = p_activo,
           motivo_pausa = v_motivo,
           pausado_at   = CASE WHEN p_activo IS FALSE THEN now() ELSE NULL END
     WHERE recurrente_id = p_recurrente_id
       AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_recurrent_not_found", "params": {}}';
    END IF;

    -- Pausar significa «no lo generes»: al reactivar, el puntero se recalcula
    -- desde HOY. Sin esto, una recurrencia pausada tres meses generaría todo ese
    -- atraso de golpe en la primera apertura después de reactivarla.
    IF p_activo IS TRUE THEN
        UPDATE public.p_gastos_recurrentes r
           SET proxima_ocurrencia = public.fn_recurrente_proxima_ocurrencia(
                   r.modo, r.dias_semana, r.dias_mes, r.fechas_anio,
                   r.fecha_unica, r.tarjeta_id, COALESCE(p_fecha_base, CURRENT_DATE))
         WHERE r.recurrente_id = p_recurrente_id;
    END IF;
END;
$function$
