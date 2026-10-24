-- ============================================================================
-- 93 — Los separadores son globales: la 2ª y 3ª moneda guardan sólo decimales
--
--   Dueño, 2026-10-24: "separeadores solo quedan los locales que son los globales.
--   Los de segunda y tercera moneda borrar."
--
--   Viene de S21: el separador de miles y el decimal se eligen UNA vez (con la
--   moneda local) y valen para toda la app. Lo único que sigue siendo por moneda es
--   la CANTIDAD de decimales (precisión, no presentación).
--
--   Qué hace este archivo:
--     1. fn_configurar_formato_moneda deja de EXIGIR separadores. Si vienen NULL o
--        vacíos guarda sólo `decimales`; si vienen, los valida igual que antes.
--        (Sin esto, borrar los separadores rompería editar los decimales de la 2ª y
--        3ª moneda: la RPC tiraba error_field_required.)
--     2. Limpia los separadores ya guardados en toda moneda que NO sea la local.
--        La local los conserva: es de donde el formateador los toma para todas.
--
--   No se toca la lectura (fn_obtener_formato_moneda): ya devuelve lo que haya, y el
--   formateador cae a las preferencias regionales cuando una moneda no trae
--   separadores (ver src/lib/format.ts, separatorsFor).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_configurar_formato_moneda(
    p_moneda text,
    p_decimales integer,
    p_separador_miles text,
    p_separador_decimal text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_moneda text;
    v_local text;
    v_miles text := NULLIF(TRIM(COALESCE(p_separador_miles, '')), '');
    v_decimal text := NULLIF(TRIM(COALESCE(p_separador_decimal, '')), '');
    v_entrada jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    v_moneda := UPPER(TRIM(COALESCE(p_moneda, '')));
    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_local
      FROM public.p_config_region r WHERE r.user_id = v_user_id;
    v_local := COALESCE(v_local, 'ARS');

    -- Guarda del contrato (peer): solo la local o una extra activa.
    IF v_moneda = '' THEN
        RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "moneda"}}';
    END IF;
    IF v_moneda <> v_local
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(public.fn_obtener_monedas_extra()) AS e(m)
           WHERE e.m = v_moneda
       ) THEN
        RAISE EXCEPTION '%', jsonb_build_object(
            'key', 'error_formato_moneda_moneda_invalida',
            'params', jsonb_build_object('moneda', v_moneda))::text;
    END IF;

    IF p_decimales IS NULL OR p_decimales < 0 OR p_decimales > 4 THEN
        RAISE EXCEPTION '%', jsonb_build_object(
            'key', 'error_formato_moneda_decimales',
            'params', jsonb_build_object('decimales', COALESCE(p_decimales, -1)))::text;
    END IF;

    -- S21: los separadores ya no son obligatorios. Sólo se validan si vienen, y
    -- nunca pueden compartir símbolo.
    IF v_miles IS NOT NULL AND v_decimal IS NOT NULL AND v_miles = v_decimal THEN
        RAISE EXCEPTION '{"key": "error_separators_must_differ", "params": {}}';
    END IF;

    v_entrada := jsonb_build_object('decimales', p_decimales);
    IF v_miles IS NOT NULL THEN
        v_entrada := v_entrada || jsonb_build_object('separador_miles', v_miles);
    END IF;
    IF v_decimal IS NOT NULL THEN
        v_entrada := v_entrada || jsonb_build_object('separador_decimal', v_decimal);
    END IF;

    UPDATE public.p_config_region
       SET monedas_formateo = jsonb_set(
           COALESCE(monedas_formateo, '{}'::jsonb),
           ARRAY[v_moneda],
           v_entrada,
           true)
     WHERE user_id = v_user_id;
    IF NOT FOUND THEN
        INSERT INTO public.p_config_region (user_id, monedas_formateo)
        VALUES (v_user_id, jsonb_build_object(v_moneda, v_entrada));
    END IF;

    RETURN (SELECT monedas_formateo FROM public.p_config_region WHERE user_id = v_user_id);
END;
$function$;

-- Limpieza: los separadores quedan sólo en la moneda local. En el resto se borran
-- las dos claves y se conserva `decimales`.
UPDATE public.p_config_region r
   SET monedas_formateo = (
       SELECT COALESCE(jsonb_object_agg(
                  e.key,
                  CASE
                      WHEN e.key = COALESCE(r.moneda_default, 'ARS')
                          THEN e.value
                      ELSE e.value - 'separador_miles' - 'separador_decimal'
                  END), '{}'::jsonb)
         FROM jsonb_each(r.monedas_formateo) AS e(key, value)
   )
 WHERE r.monedas_formateo IS NOT NULL
   AND r.monedas_formateo <> '{}'::jsonb;

-- Verificación (read-only, después del deploy):
--   select user_id, moneda_default, monedas_formateo from public.p_config_region;
-- Esperado: sólo la entrada de moneda_default conserva separador_miles y
-- separador_decimal; las demás sólo traen "decimales".
