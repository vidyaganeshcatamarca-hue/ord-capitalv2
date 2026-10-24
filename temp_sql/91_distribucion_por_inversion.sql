-- ============================================================================
-- 91 — Distribución del gráfico POR INVERSIÓN, no por tipo de activo
--
--   Autorizado por el dueño el 2026-10-24 (odd/tasks/bugs-ronda-3.md, S6):
--   "En la pestaña de gráfico está haciendo la distribución por tipo de inversión,
--    lo cual es incorrecto. Tienes que distribuir por cada una de las inversiones
--    que tenemos. Si tengo cinco inversiones, muestro las cinco inversiones con sus
--    diferentes porcentajes. [...] No mostramos la distribución por tipo variable o
--    plazo fijo. Eso está mal."
--
--   Qué cambia: la función devolvía UNA fila por (tipo_activo) con COUNT(*) de
--   inversiones; ahora devuelve UNA fila por inversión activa.
--
--   Qué NO cambia: el valor de cada inversión se sigue convirtiendo a la moneda
--   local con fn_valor_a_moneda_local (una moneda sin cotización aporta NULL y
--   queda fuera del total, nunca se inventa), y el porcentaje se sigue calculando
--   contra el total general.
--
--   Compatibilidad: se agregan columnas (inversion_id, nombre_activo) y se mantiene
--   tipo_activo y cantidad. El DROP es necesario porque cambia el tipo de retorno;
--   con esto, si el front nuevo llega antes que el SQL, el front detecta que no hay
--   nombre_activo y agrupa por tipo como antes.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_reporte_distribucion_activos();

CREATE OR REPLACE FUNCTION public.fn_reporte_distribucion_activos()
 RETURNS TABLE(
    inversion_id bigint,
    nombre_activo text,
    tipo_activo text,
    cantidad integer,
    valor_total numeric,
    porcentaje_valor numeric,
    moneda_local text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_moneda_local text;
    v_total_general numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_moneda_local
    FROM public.p_config_region r WHERE r.user_id = v_user_id;
    v_moneda_local := COALESCE(v_moneda_local, 'ARS');

    -- Valor de cada inversión convertido a moneda local (pivote p_divisas);
    -- moneda sin cotización aporta NULL y queda fuera del total (nunca inventar).
    SELECT COALESCE(SUM(
        (SELECT c.valor FROM fn_valor_a_moneda_local(
            CASE
                WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                WHEN i.tasa_anual_tna > 0 THEN
                    i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                ELSE i.monto_invertido_original
            END,
            COALESCE(i.moneda, 'ARS'), v_user_id) c)
    ), 0) INTO v_total_general
    FROM p_inversiones i
    WHERE i.user_id = v_user_id AND i.estado = 'activa';

    RETURN QUERY
    SELECT
        i.inversion_id,
        i.nombre_activo,
        CASE WHEN i.tasa_anual_tna > 0 THEN 'plazo_fijo'::text ELSE 'variable'::text END AS tipo_activo,
        1 AS cantidad,
        COALESCE(
            (SELECT c.valor FROM fn_valor_a_moneda_local(
                CASE
                    WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                    WHEN i.tasa_anual_tna > 0 THEN
                        i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                    ELSE i.monto_invertido_original
                END,
                COALESCE(i.moneda, 'ARS'), v_user_id) c),
            0
        )::numeric AS valor_total,
        CASE
            WHEN v_total_general > 0 THEN
                ROUND((
                    COALESCE(
                        (SELECT c.valor FROM fn_valor_a_moneda_local(
                            CASE
                                WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                                WHEN i.tasa_anual_tna > 0 THEN
                                    i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                                ELSE i.monto_invertido_original
                            END,
                            COALESCE(i.moneda, 'ARS'), v_user_id) c),
                        0
                    ) / v_total_general
                ) * 100, 2)
            ELSE 0
        END::numeric AS porcentaje_valor,
        v_moneda_local AS moneda_local
    FROM p_inversiones i
    WHERE i.user_id = v_user_id AND i.estado = 'activa'
    ORDER BY valor_total DESC, i.inversion_id;
END;
$function$;

-- Verificación (read-only, correr después del deploy):
--   select * from fn_reporte_distribucion_activos();
-- Esperado: una fila por inversión activa, con nombre_activo propio y cantidad = 1.
