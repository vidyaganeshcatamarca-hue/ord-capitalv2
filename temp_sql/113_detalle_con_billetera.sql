-- 113 — fn_reporte_detalle_inversion expone billetera_origen_id
--
-- El detalle necesita saber si la posición se cargó como preexistente (sin
-- billetera) para ofrecer "Eliminar" solo donde fn_eliminar_inversion puede
-- funcionar: una posición con billetera tiene movimientos y se borra desde
-- Historial, que revierte cada operación (migración 105).
--
-- La función devuelve jsonb, así que agregar una clave es un cambio de cuerpo:
-- no hay DROP ni cambio de firma. El resto del cuerpo es el vigente en Supabase.

CREATE OR REPLACE FUNCTION public.fn_reporte_detalle_inversion(p_inversion_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_inversion RECORD;
    v_historial jsonb;
    v_rendimiento_nominal numeric;
    v_rendimiento_real numeric;
    v_valor_actual_teorico numeric;
    v_liquidado numeric := 0;
    -- Bloque de inflación calculado en vivo.
    v_infl jsonb := '{}'::jsonb;
    v_motivo text;
    v_fuente text;
    v_inflacion_disponible boolean := false;
    v_inflacion_6m numeric;
    -- Tasa ANUAL disponible (clave 'inflacion_anualizada' del bloque vivo).
    v_inflacion_anual numeric;
    -- Prorrateo por días de ESTA inversión.
    v_dias_tenencia numeric;
    v_inflacion_periodo numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT * INTO v_inversion
    FROM p_inversiones
    WHERE inversion_id = p_inversion_id AND user_id = v_user_id;

    IF v_inversion.inversion_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_investment_not_found", "params": {}}';
    END IF;

    v_liquidado := COALESCE(v_inversion.monto_liquidado, 0);

    v_valor_actual_teorico := CASE
        WHEN v_inversion.valor_mercado_actual IS NOT NULL THEN v_inversion.valor_mercado_actual
        WHEN v_inversion.tasa_anual_tna > 0 THEN
            v_inversion.monto_invertido_original + (v_inversion.monto_invertido_original * (v_inversion.tasa_anual_tna / 100) * (CURRENT_DATE - v_inversion.fecha_inicio) / 365)
        ELSE v_inversion.monto_invertido_original
    END;

    -- S16: el nominal se mide contra el capital ORIGINAL más lo ya retirado:
    -- lo que salió de la billetera fue un rescate, no una pérdida.
    v_rendimiento_nominal := CASE
        WHEN v_inversion.monto_invertido_original > 0
        THEN (((v_valor_actual_teorico + v_liquidado) - v_inversion.monto_invertido_original) / v_inversion.monto_invertido_original) * 100
        ELSE 0
    END;

    -- Inflación VIGENTE (calculada en lectura, no congelada).
    v_infl := public.fn_inflacion_vigente(v_user_id);
    v_motivo := v_infl ->> 'motivo';
    v_fuente := v_infl ->> 'fuente';
    v_inflacion_disponible := (v_motivo = 'ok');
    v_inflacion_6m := (v_infl ->> 'inflacion_6m')::numeric;
    -- La anualizada es la tasa ANUAL del bloque vivo. Si viniera nula (no hay
    -- ventana real para anualizar), se usa la acumulación de 12 meses, que ya
    -- ES una tasa anual: no se inventa ningún número.
    v_inflacion_anual := COALESCE(
        (v_infl ->> 'inflacion_anualizada')::numeric,
        (v_infl ->> 'inflacion_12m')::numeric
    );

    IF v_inflacion_disponible AND v_inflacion_anual IS NOT NULL
       AND v_inversion.fecha_inicio IS NOT NULL THEN
        -- Días de tenencia DE ESTA inversión.
        v_dias_tenencia := GREATEST((CURRENT_DATE - v_inversion.fecha_inicio), 0)::numeric;
        -- Inflación del PERÍODO que duró la inversión, a partir de la tasa
        -- ANUAL disponible (no se anualiza nada: la manual ya es anual).
        v_inflacion_periodo := (POWER(1 + (v_inflacion_anual / 100), v_dias_tenencia / 365.0) - 1) * 100;

        -- Real de ESTA inversión.
        v_rendimiento_real := ((1 + (v_rendimiento_nominal / 100)) / (1 + (v_inflacion_periodo / 100)) - 1) * 100;
    ELSE
        v_rendimiento_real := NULL;
        v_inflacion_disponible := false;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(mov)), '[]'::jsonb) INTO v_historial
    FROM (
        SELECT c.fecha,
               c.detalle,
               CASE
                   WHEN c.tipo = 'expense' THEN -c.valor_egreso
                   WHEN c.tipo = 'income' THEN c.valor_ingreso
                   ELSE 0
               END AS monto
        FROM p_caja c
        WHERE c.user_id = v_user_id
          AND c.metadata->>'inversion_id' = p_inversion_id::text
        ORDER BY c.fecha DESC
    ) mov;

    RETURN jsonb_build_object(
        'inversion_id', v_inversion.inversion_id,
        'nombre_activo', v_inversion.nombre_activo,
        'tipo_activo', CASE WHEN v_inversion.tasa_anual_tna > 0 THEN 'plazo_fijo' ELSE 'variable' END,
        'monto_invertido_original', v_inversion.monto_invertido_original,
        'monto_liquidado', v_liquidado,
        'billetera_origen_id', v_inversion.billetera_origen_id,
        'valor_actual_teorico', ROUND(v_valor_actual_teorico, 2),
        'valor_mercado_actual', v_inversion.valor_mercado_actual,
        'tasa_anual_tna', v_inversion.tasa_anual_tna,
        'moneda', COALESCE(v_inversion.moneda, 'ARS'),
        'ultima_conciliacion', v_inversion.ultima_conciliacion,
        'dias_desde_conciliacion', (CURRENT_DATE - v_inversion.ultima_conciliacion)::int,
        'estado_semaforo_key', CASE
            WHEN (CURRENT_DATE - v_inversion.ultima_conciliacion) <= 30 THEN 'green'
            WHEN (CURRENT_DATE - v_inversion.ultima_conciliacion) <= 45 THEN 'yellow'
            ELSE 'red'
        END,
        'estado_inversion', v_inversion.estado,
        'rendimiento_nominal', ROUND(v_rendimiento_nominal, 2),
        'rendimiento_real', CASE WHEN v_rendimiento_real IS NOT NULL THEN ROUND(v_rendimiento_real, 2) ELSE NULL END,
        'inflacion_disponible', v_inflacion_disponible,
        'inflacion_6m', CASE WHEN v_inflacion_disponible THEN ROUND(v_inflacion_6m, 2) ELSE NULL END,
        'fuente_inflacion', COALESCE(v_fuente, 'desactivado'),
        'motivo_inflacion', v_motivo,
        'ventana_6m_meses', (v_infl ->> 'ventana_6m_meses')::numeric,
        'historial', v_historial
    );
END;
$function$
;
