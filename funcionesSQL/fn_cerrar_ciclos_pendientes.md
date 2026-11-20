CREATE OR REPLACE FUNCTION public.fn_cerrar_ciclos_pendientes(p_hasta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_desde date;
    v_tope date;
    v_mes date;
    v_cerrados int := 0;
    v_ya int := 0;
    v_abiertos int := 0;
    r jsonb;
    v_inicio_actual date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    -- El ciclo vigente nunca se cierra.
    SELECT f.fecha_inicio INTO v_inicio_actual
      FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE) f;

    -- Punto de inicio documentado. Si el usuario todavia no lo tiene, arranca en el ciclo
    -- vigente: no se reconstruye nada hacia atras por sorpresa.
    SELECT COALESCE(c.cierre_desde, date_trunc('month', v_inicio_actual)::date)
      INTO v_desde
      FROM public.p_presupuestos_config c WHERE c.user_id = v_user_id;
    IF v_desde IS NULL THEN
        v_desde := date_trunc('month', v_inicio_actual)::date;
    END IF;

    -- Tope: el ciclo anterior al vigente (o el que pida quien llama, si es anterior).
    v_tope := date_trunc('month', (v_inicio_actual - INTERVAL '1 day'))::date;
    IF p_hasta IS NOT NULL AND date_trunc('month', p_hasta)::date < v_tope THEN
        v_tope := date_trunc('month', p_hasta)::date;
    END IF;

    v_mes := v_desde;
    WHILE v_mes <= v_tope LOOP
        BEGIN
            r := public.fn_cerrar_ciclo_presupuesto(v_mes);
            IF COALESCE((r->>'cerrado')::boolean, false) THEN
                v_cerrados := v_cerrados + 1;
            ELSIF (r->>'motivo') = 'ya_cerrado' THEN
                v_ya := v_ya + 1;
            ELSE
                v_abiertos := v_abiertos + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Si un ciclo no se puede cerrar, se corta aca: seguir propagaria un arrastre
            -- equivocado a todos los siguientes.
            RETURN jsonb_build_object('ok', false, 'detenido_en', v_mes,
                                      'error', SQLERRM, 'cerrados', v_cerrados);
        END;
        v_mes := (v_mes + INTERVAL '1 month')::date;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'desde', v_desde, 'hasta', v_tope,
                              'cerrados', v_cerrados, 'ya_estaban', v_ya,
                              'no_cerrados', v_abiertos);
END;
$function$
