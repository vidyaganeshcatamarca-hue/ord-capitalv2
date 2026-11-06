CREATE OR REPLACE FUNCTION public.fn_config_num(p_clave text, p_default numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT valor::numeric FROM public.app_global_config WHERE clave = p_clave),
    p_default)
$function$;

-- ============================================================
-- Tanda 5 telemetria (2026-09-18): helper de lectura numerica de
-- app_global_config (clave/valor) con default. Usada por las RPCs del
-- motor CPS para pesos, targets y cortes configurables sin redeploy.
-- ============================================================
