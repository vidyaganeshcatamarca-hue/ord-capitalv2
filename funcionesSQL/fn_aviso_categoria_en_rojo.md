CREATE OR REPLACE FUNCTION public.fn_aviso_categoria_en_rojo()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_cfg        record;
    v_inicio     date;
    v_fin        date;
    v_hogar      bigint;
    v_categorias integer;
    v_exceso     numeric;
    v_encolados  integer := 0;
    v_id         bigint;
BEGIN
    FOR v_cfg IN
        SELECT c.user_id, COALESCE(c.dia_ancla_ciclo, 1)::integer AS dia_ancla
        FROM public.p_presupuestos_config c
        WHERE c.modo_presupuesto = 'base_cero'
    LOOP
        -- Misma formula que fn_obtener_fechas_ciclo_presupuesto.
        IF EXTRACT(DAY FROM CURRENT_DATE) >= v_cfg.dia_ancla THEN
            v_inicio := date_trunc('month', CURRENT_DATE) + ((v_cfg.dia_ancla - 1) * INTERVAL '1 day');
        ELSE
            v_inicio := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month') + ((v_cfg.dia_ancla - 1) * INTERVAL '1 day');
        END IF;
        v_fin := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

        SELECT hp.hogar_id INTO v_hogar
        FROM public.p_hogar_participantes hp
        WHERE hp.user_id = v_cfg.user_id
        LIMIT 1;

        SELECT COUNT(*)::integer, COALESCE(SUM(x.exceso), 0)
          INTO v_categorias, v_exceso
        FROM (
            SELECT p.monto_limite,
                   COALESCE(con.total, 0) AS consumido,
                   COALESCE(con.total, 0) - p.monto_limite AS exceso
            FROM public.p_presupuestos p
            LEFT JOIN (
                SELECT COALESCE(e.padre_id, e.estructura_id) AS rubro_id,
                       SUM(c.valor_egreso) AS total
                FROM public.p_caja c
                INNER JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
                WHERE c.fecha BETWEEN v_inicio AND v_fin
                  AND c.tipo = 'expense'
                  AND ((c.user_id = v_cfg.user_id AND c.es_compartido = false)
                       OR (v_hogar IS NOT NULL AND c.hogar_id = v_hogar AND c.es_compartido = true))
                GROUP BY COALESCE(e.padre_id, e.estructura_id)
            ) con ON con.rubro_id = p.estructura_egreso_id
            WHERE p.mes_periodo = v_inicio
              AND p.monto_limite > 0
              AND (p.user_id = v_cfg.user_id OR (v_hogar IS NOT NULL AND p.hogar_id = v_hogar))
        ) x
        WHERE x.consumido > x.monto_limite;

        IF v_categorias > 0 THEN
            v_id := public.fn_encolar_aviso(
                p_user_id    => v_cfg.user_id,
                p_tipo       => 'categoria_en_rojo',
                p_categoria  => 'presupuesto',
                p_metadata   => jsonb_build_object(
                                    'categorias', v_categorias,
                                    'exceso', v_exceso,
                                    'ciclo_inicio', v_inicio),
                p_prioridad  => 25::smallint,
                p_dedupe_key => 'categoria_en_rojo:' || to_char(CURRENT_DATE, 'YYYYMMDD'),
                p_expira_at  => (CURRENT_DATE + 1)::timestamptz
            );

            IF v_id IS NOT NULL THEN
                v_encolados := v_encolados + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN v_encolados;
END;
$function$
