CREATE OR REPLACE FUNCTION public.fn_reporte_desglose_balance()
 RETURNS TABLE(estructura_id bigint, nombre_categoria text, icono text, color text, total_categoria numeric, pagado_creador numeric, pagado_invitado numeric, esperado_creador numeric, esperado_invitado numeric, diferencia_creador numeric, diferencia_invitado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_ultimo_corte timestamp with time zone;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT hogar_id INTO v_hogar_id
    FROM p_hogar_participantes
    WHERE user_id = v_user_id;

    IF v_hogar_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(MAX(creado_at), '1900-01-01'::timestamp)
    INTO v_ultimo_corte
    FROM p_hogar_conciliaciones
    WHERE hogar_id = v_hogar_id;

    RETURN QUERY
    WITH movimientos AS (
        SELECT
            COALESCE(c.estructura_egreso_id, 0) AS egreso_id,
            COALESCE(c.proyecto_id, 0) AS proy_id,
            c.pagado_por_user_id,
            c.valor_egreso,
            COALESCE(c.porcentaje_creador_snapshot, 50.00) AS pct_creador_snapshot,
            COALESCE(c.porcentaje_invitado_snapshot, 50.00) AS pct_invitado_snapshot
        FROM p_caja c
        WHERE c.hogar_id = v_hogar_id
          AND c.es_compartido = true
          AND c.tipo = 'expense'
          AND c.fecha >= v_ultimo_corte::date
    ),
    agregado AS (
        SELECT
            CASE
                WHEN m.egreso_id > 0 THEN m.egreso_id
                ELSE m.proy_id
            END AS entidad_id,
            CASE
                WHEN m.egreso_id > 0 THEN 'category'
                ELSE 'project'
            END AS tipo_entidad,
            ROUND(SUM(m.valor_egreso), 2) AS total,
            ROUND(SUM(CASE WHEN hp.rol = 'creador' THEN m.valor_egreso ELSE 0 END), 2) AS pag_creador,
            ROUND(SUM(CASE WHEN hp.rol = 'invitado' THEN m.valor_egreso ELSE 0 END), 2) AS pag_invitado,
            ROUND(SUM(m.valor_egreso * (m.pct_creador_snapshot / 100.0)), 2) AS esp_creador,
            ROUND(SUM(m.valor_egreso * (m.pct_invitado_snapshot / 100.0)), 2) AS esp_invitado
        FROM movimientos m
        JOIN p_hogar_participantes hp
          ON hp.hogar_id = v_hogar_id
         AND hp.user_id = m.pagado_por_user_id
        GROUP BY
            CASE
                WHEN m.egreso_id > 0 THEN m.egreso_id
                ELSE m.proy_id
            END,
            CASE
                WHEN m.egreso_id > 0 THEN 'category'
                ELSE 'project'
            END
    )
    SELECT
        a.entidad_id,
        COALESCE(e.nombre_cuenta, pc.nombre_proyecto, 'no_category')::text,
        COALESCE(e.icono, 'target')::text,
        COALESCE(e.color, '#6366F1')::text,
        a.total::numeric,
        a.pag_creador::numeric,
        a.pag_invitado::numeric,
        a.esp_creador::numeric,
        a.esp_invitado::numeric,
        ROUND(a.pag_creador - a.esp_creador, 2)::numeric,
        ROUND(a.pag_invitado - a.esp_invitado, 2)::numeric
    FROM agregado a
    LEFT JOIN p_estructuras_egresos e
      ON a.tipo_entidad = 'category'
     AND a.entidad_id = e.estructura_id
    LEFT JOIN p_proyectos_compartidos pc
      ON a.tipo_entidad = 'project'
     AND a.entidad_id = pc.proyecto_id
    ORDER BY a.total DESC;
END;
$function$
