CREATE OR REPLACE FUNCTION public.fn_prestamos_resumen()
 RETURNS TABLE(direccion text, moneda text, pendiente numeric, pagado_registrado numeric, prestamos_activos integer, prestamos_saldados integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    RETURN QUERY
    SELECT p.tipo_flujo::text,
           trim(p.moneda_iso)::text,
           COALESCE(SUM(p.saldo_actual)      FILTER (WHERE p.estado <> 'eliminado' AND p.estado <> 'archivado'), 0),
           COALESCE(SUM(p.monto_pagado_acumulado) FILTER (WHERE p.estado <> 'eliminado' AND p.estado <> 'archivado'), 0),
           COUNT(*) FILTER (WHERE p.estado = 'activo')::integer,
           COUNT(*) FILTER (WHERE p.estado = 'pagado')::integer
    FROM public.p_prestamos p
    WHERE (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
      AND p.estado IN ('activo', 'pagado', 'pendiente', 'parcial')
    GROUP BY p.tipo_flujo, trim(p.moneda_iso)
    ORDER BY p.tipo_flujo, trim(p.moneda_iso);
END;
$function$
