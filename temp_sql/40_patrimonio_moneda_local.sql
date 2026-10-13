-- WU3b: el patrimonio del Home pasa a agrupar por moneda (cada moneda con la suya,
-- sin conversion). El bucket "total" es la moneda local del pais confirmado; para
-- usuarios sin configuracion regional (los argentinos viejos) sigue siendo ARS y el
-- resultado es identico al de la funcion anterior. Se agrega totales_por_moneda:
-- las builds viejas de produccion ignoran la clave extra.
CREATE OR REPLACE FUNCTION public.fn_reporte_patrimonio_neto()
 RETURNS TABLE(total_pesos numeric, total_dolares numeric, totales_por_moneda jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id int8;
    v_moneda_local text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    -- Local currency of the confirmed country. Users without a regional config keep
    -- the previous behaviour: their local bucket is ARS.
    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_moneda_local
    FROM public.p_config_region r WHERE r.user_id = v_user_id;
    v_moneda_local := COALESCE(v_moneda_local, 'ARS');

    RETURN QUERY
    WITH por_moneda AS (
        SELECT b.moneda,
               COALESCE(SUM(b.saldo_actual), 0) AS total
        FROM public.p_billeteras b
        WHERE b.activa = true
          AND (
              b.user_id = v_user_id
              OR (
                  v_hogar_id IS NOT NULL
                  AND b.es_compartida = true
                  AND b.user_id IN (
                      SELECT hp.user_id FROM p_hogar_participantes hp WHERE hp.hogar_id = v_hogar_id
                  )
              )
          )
        GROUP BY b.moneda
    )
    SELECT
        COALESCE((SELECT total FROM por_moneda WHERE moneda = v_moneda_local), 0)::numeric AS total_pesos,
        COALESCE((SELECT total FROM por_moneda WHERE moneda = 'USD' AND 'USD' <> v_moneda_local), 0)::numeric AS total_dolares,
        COALESCE((
            SELECT jsonb_agg(jsonb_build_object('moneda', m.moneda, 'total', m.total) ORDER BY (m.moneda = v_moneda_local) DESC, m.moneda)
            FROM por_moneda m
        ), '[]'::jsonb) AS totales_por_moneda;
END;
$function$