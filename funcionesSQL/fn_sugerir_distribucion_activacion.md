CREATE OR REPLACE FUNCTION public.fn_sugerir_distribucion_activacion()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_liquidez_actual numeric := 0;
    v_pct_nec numeric;
    v_pct_des numeric;
    v_pct_aho numeric;
    v_pct_diez numeric;
    v_sugerencias jsonb := '[]'::jsonb;
    v_meses_activos numeric := 1.0;
    r_cat RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    -- Calcular el número de meses activos con transacciones en los últimos 90 días (máximo 3, mínimo 1)
    SELECT COALESCE(NULLIF(COUNT(DISTINCT date_trunc('month', c.fecha)), 0), 1)::numeric
    INTO v_meses_activos
    FROM p_caja c
    WHERE (c.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id))
      AND c.tipo = 'expense'
      AND c.fecha >= CURRENT_DATE - INTERVAL '90 days';

    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_liquidez_actual
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false;

    SELECT porcentaje_necesidades, porcentaje_deseos, porcentaje_ahorro, porcentaje_diezmo
    INTO v_pct_nec, v_pct_des, v_pct_aho, v_pct_diez
    FROM p_presupuestos_config WHERE user_id = v_user_id;

    IF v_pct_nec IS NULL THEN
        v_pct_nec := 50; v_pct_des := 30; v_pct_aho := 20; v_pct_diez := 0;
    END IF;

    BEGIN
        FOR r_cat IN 
            SELECT e.estructura_id, e.nombre_cuenta, COALESCE(padre.tipo_cupo, e.tipo_cupo) AS tipo_cupo_efectivo,
                   COALESCE((
                       SELECT SUM(valor_egreso) 
                       FROM p_caja c 
                       WHERE c.estructura_egreso_id = e.estructura_id
                         AND c.tipo = 'expense'
                         AND c.fecha >= CURRENT_DATE - INTERVAL '90 days'
                         AND (c.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id))
                   ), 0) / v_meses_activos AS promedio_3m
            FROM p_estructuras_egresos e
            LEFT JOIN p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
            WHERE (e.padre_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM p_estructuras_egresos h WHERE h.padre_id = e.estructura_id))
              AND (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
              AND COALESCE(padre.tipo_cupo, e.tipo_cupo) IS NOT NULL
              AND LOWER(e.nombre_cuenta) NOT IN ('cat_mystery', 'cat_misterio', 'misterio', 'olvido')
        LOOP
            v_sugerencias := v_sugerencias || jsonb_build_object(
                'estructura_id', r_cat.estructura_id,
                'nombre', r_cat.nombre_cuenta,
                'tipo_cupo', r_cat.tipo_cupo_efectivo,
                'monto_sugerido', ROUND(r_cat.promedio_3m, 2)
            );
        END LOOP;
    END;

    RETURN jsonb_build_object(
        'liquidez_actual', v_liquidez_actual,
        'reglas_oro', jsonb_build_object(
            'necesidades', v_pct_nec,
            'deseos', v_pct_des,
            'ahorro_inversion', v_pct_aho,
            'diezmo', v_pct_diez
        ),
        'sugerencias', v_sugerencias,
        'mensaje_ux_key', 'suggestion_ux_message' -- ⭐ Normalizado a clave
    );
END;
$function$