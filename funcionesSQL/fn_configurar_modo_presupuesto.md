CREATE OR REPLACE FUNCTION public.fn_configurar_modo_presupuesto(p_modo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_modo_actual text;
    v_fecha_activacion date;
    v_inicio_ciclo_actual date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF p_modo NOT IN ('base_cero', 'anticipado') THEN
        RAISE EXCEPTION '{"key": "error_budget_mode_invalid", "params": {}}';
    END IF;

    -- Agregar columna si no existe (por si acaso no fue añadida manualmente)
    BEGIN
        ALTER TABLE p_presupuestos_config ADD COLUMN IF NOT EXISTS fecha_activacion_base_cero date;
    EXCEPTION WHEN OTHERS THEN
        -- Ignorar si no hay permisos de DDL, asumimos que ya existe o se creará.
    END;

    SELECT modo_presupuesto, fecha_activacion_base_cero 
    INTO v_modo_actual, v_fecha_activacion
    FROM p_presupuestos_config WHERE user_id = v_user_id;

    SELECT fecha_inicio INTO v_inicio_ciclo_actual FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);

    IF v_modo_actual = 'base_cero' AND p_modo = 'anticipado' THEN
        -- Si cambió a base cero ESTE ciclo presupuestario, no puede volver a anticipado hasta el ciclo que viene
        IF v_fecha_activacion IS NOT NULL AND v_fecha_activacion >= v_inicio_ciclo_actual THEN
            RAISE EXCEPTION '{"key": "error_base_cero_locked", "params": {}}';
        END IF;
    END IF;

    IF p_modo = 'base_cero' AND COALESCE(v_modo_actual, '') != 'base_cero' THEN
        -- Reiniciar todas las asignaciones al cambiar de modo
        UPDATE p_presupuestos 
        SET monto_limite = 0 
        WHERE user_id = v_user_id AND mes_periodo = date_trunc('month', CURRENT_DATE);

        INSERT INTO p_presupuestos_config (user_id, modo_presupuesto, fecha_activacion_base_cero)
        VALUES (v_user_id, p_modo, CURRENT_DATE)
        ON CONFLICT (user_id) 
        DO UPDATE SET modo_presupuesto = EXCLUDED.modo_presupuesto, fecha_activacion_base_cero = EXCLUDED.fecha_activacion_base_cero;
    ELSIF COALESCE(v_modo_actual, '') != p_modo THEN
        -- Reiniciar todas las asignaciones al cambiar de modo (de base_cero a anticipado u otro cambio)
        UPDATE p_presupuestos 
        SET monto_limite = 0 
        WHERE user_id = v_user_id AND mes_periodo = date_trunc('month', CURRENT_DATE);

        INSERT INTO p_presupuestos_config (user_id, modo_presupuesto)
        VALUES (v_user_id, p_modo)
        ON CONFLICT (user_id) 
        DO UPDATE SET modo_presupuesto = EXCLUDED.modo_presupuesto;
    ELSE
        -- Solo actualizar (aunque sean iguales, por si acaso)
        INSERT INTO p_presupuestos_config (user_id, modo_presupuesto)
        VALUES (v_user_id, p_modo)
        ON CONFLICT (user_id) 
        DO UPDATE SET modo_presupuesto = EXCLUDED.modo_presupuesto;
    END IF;
END;
$function$