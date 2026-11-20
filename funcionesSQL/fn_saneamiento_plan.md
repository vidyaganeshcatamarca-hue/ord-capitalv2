CREATE OR REPLACE FUNCTION public.fn_saneamiento_plan(p_estrategia text DEFAULT 'math'::text)
 RETURNS TABLE(prestamo_id bigint, contraparte text, nombre text, moneda text, saldo_pendiente numeric, tasa numeric, tasa_informada boolean, proximo_vencimiento date, moneda_orden text, es_personal boolean, puntos_vinculo smallint, estado_vencimiento text, prioridad integer, comparte_prioridad boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_est     text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    v_est := COALESCE(NULLIF(trim(p_estrategia), ''), 'math');
    IF v_est NOT IN ('math', 'emotional', 'relationships') THEN
        RAISE EXCEPTION 'error_invalid_strategy';
    END IF;

    RETURN QUERY
    WITH base AS (
        SELECT p.prestamo_id,
               p.entidad_nombre::text AS contraparte,
               COALESCE(p.nombre_prestamo, p.entidad_nombre)::text AS nombre,
               trim(p.moneda_iso)::text AS moneda,
               p.saldo_actual AS saldo_pendiente,
               -- An uninformed rate orders as 0 % but is never presented as a real 0 %.
               CASE WHEN p.tasa_informada THEN p.tasa_anual_tna ELSE 0 END AS tasa,
               p.tasa_informada,
               p.proximo_vencimiento,
               (p.tipo_deuda = 'personal'
                OR p.tipo_entidad IN ('familiar', 'tercero', 'otro')) AS es_personal,
               p.puntos_vinculo,
               public.fn_prestamos_estado_vencimiento(p.prestamo_id) AS estado_vencimiento
        FROM public.p_prestamos p
        WHERE (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
          AND p.tipo_flujo = 'debo'
          AND p.estado IN ('activo', 'pendiente', 'parcial')
          AND p.eliminado_at IS NULL
          AND COALESCE(p.saldo_actual, 0) > 0
    ),
    ordenado AS (
        SELECT b.*,
               CASE WHEN v_est = 'math' THEN
                        dense_rank() OVER (
                            PARTITION BY b.moneda
                            ORDER BY b.tasa DESC, b.saldo_pendiente DESC, b.prestamo_id ASC)
                    WHEN v_est = 'emotional' THEN
                        dense_rank() OVER (
                            PARTITION BY b.moneda
                            ORDER BY b.saldo_pendiente ASC, b.proximo_vencimiento ASC NULLS LAST,
                                     b.prestamo_id ASC)
                    ELSE
                        -- Personal creditors first, scored; institutions after, by the
                        -- nearest due date. NO prestamo_id here on purpose: the spec
                        -- requires tied scores to SHARE a rank so the user can break the
                        -- tie manually. Determinism for display comes from the outer
                        -- ORDER BY, which does not affect the rank.
                        dense_rank() OVER (
                            PARTITION BY b.moneda
                            ORDER BY b.es_personal DESC,
                                     CASE WHEN b.es_personal THEN COALESCE(b.puntos_vinculo, 0) END DESC,
                                     CASE WHEN NOT b.es_personal THEN b.proximo_vencimiento END ASC NULLS LAST)
               END AS rango
        FROM base b
    )
    SELECT o.prestamo_id, o.contraparte, o.nombre, o.moneda, o.saldo_pendiente,
           o.tasa, o.tasa_informada, o.proximo_vencimiento, o.moneda,
           o.es_personal, o.puntos_vinculo, o.estado_vencimiento,
           o.rango::integer,
           (v_est = 'relationships'
            AND o.es_personal
            AND (SELECT count(*) FROM ordenado x
                  WHERE x.moneda = o.moneda AND x.rango = o.rango) > 1) AS comparte_prioridad
    FROM ordenado o
    ORDER BY o.moneda, o.rango, o.prestamo_id;
END;
$function$
