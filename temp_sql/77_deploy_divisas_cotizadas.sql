-- temp_sql/77_deploy_divisas_cotizadas.sql
-- =====================================================================
-- T8/S9 - Catalogo de monedas cotizadas para los selectores de extras.
--   * fn_obtener_divisas_cotizadas(): nombres de p_divisas con una
--     cotizacion real (ultima_actualizacion NOT NULL - el cron), orden
--     alfabético. S9: solo las cotizadas, el set que garantiza tasa.
-- Idempotente: DROP por firma EXACTA + CREATE OR REPLACE.
-- =====================================================================

DROP FUNCTION IF EXISTS public.fn_obtener_divisas_cotizadas();

CREATE OR REPLACE FUNCTION public.fn_obtener_divisas_cotizadas()
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        array_agg(DISTINCT d.nombre ORDER BY d.nombre),
        ARRAY[]::text[]
    )
    FROM public.p_divisas d
    WHERE d.ultima_actualizacion IS NOT NULL;
$function$;