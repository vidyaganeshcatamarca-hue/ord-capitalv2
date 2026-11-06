CREATE OR REPLACE FUNCTION public.fn_generar_insights_salud()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_scores jsonb;
    v_dim RECORD;
    v_insights jsonb := '[]'::jsonb;
    v_min_score int := 100;
    v_min_dim text := '';
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    v_scores := public.fn_reporte_score_salud_financiera();

    FOR v_dim IN 
        SELECT key AS dimension, value::int AS score 
        FROM jsonb_each(v_scores->'dimensiones')
        ORDER BY value::int ASC
        LIMIT 2
    LOOP
        IF v_dim.score < 80 THEN
            DECLARE
                v_key text;
                v_params jsonb;
            BEGIN
                CASE v_dim.dimension
                    WHEN 'proteccion' THEN
                        v_key := 'insight_low_shield';
                        v_params := jsonb_build_object('days', v_scores->'datos_detalle'->>'escudo_dias');
                    WHEN 'presupuesto' THEN
                        v_key := 'insight_budget_overspend';
                        v_params := jsonb_build_object('month', to_char(CURRENT_DATE, 'Month'));
                    WHEN 'deuda' THEN
                        v_key := 'insight_high_debt';
                        v_params := jsonb_build_object('amount', v_scores->'datos_detalle'->>'deuda_total');
                    WHEN 'crecimiento' THEN
                        v_key := 'insight_low_investment';
                        v_params := '{}'::jsonb;
                    WHEN 'ahorro' THEN
                        v_key := 'insight_savings_goal';
                        v_params := jsonb_build_object(
                            'actual', v_scores->'datos_detalle'->>'ahorro_actual',
                            'goal', v_scores->'datos_detalle'->>'ahorro_meta'
                        );
                END CASE;

                v_insights := v_insights || jsonb_build_object(
                    'priority', CASE WHEN v_dim.score < 40 THEN 'high' ELSE 'medium' END,
                    'dimension', v_dim.dimension,
                    'message_key', v_key,
                    'params', v_params,
                    'action_route', CASE v_dim.dimension
                        WHEN 'proteccion' THEN '/fondos'
                        WHEN 'presupuesto' THEN '/presupuestos'
                        WHEN 'deuda' THEN '/bola-nieve'
                        WHEN 'crecimiento' THEN '/inversiones'
                        WHEN 'ahorro' THEN '/sobres'
                    END
                );
            END;
        END IF;
    END LOOP;

    RETURN v_insights;
END;
$function$