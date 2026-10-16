-- temp_sql/78_deploy_formato_moneda.sql
-- =====================================================================
-- T8b/S22 - Formato POR MONEDA (decimales + separadores).
--
--   * p_config_region.monedas_formateo jsonb DEFAULT '{}': overrides por
--     moneda ({EUR: {decimales, separador_miles, separador_decimal}}) —
--     para locales, segunda y extras (la UI del peer U3 configura las TRES
--     por moneda, S22). Sin overrides, fondo legacy: local/USD leen
--     p_preferencias_usuario (CERO migracion de datos; final B peer).
--   * fn_configurar_formato_moneda(...): valida y hace MERGE. Guarda del
--     contrato (pedido del peer): rechaza con error JSON la moneda que no
--     es ni local ni extra activa (no escribe overrides huerfanos).
--   * fn_obtener_formato_moneda(): mapa RESUELTO por codigo para el front
--     (local/USD desde prefs; extras desde overrides con fallback a los
--     separadores globales + decimales del catalogo p_paises.moneda_decimales).
--     NUNCA falta una monedaactiva del usuario (nunca undefined).
--
-- Idempotente: DROP por firma EXACTA + CREATE OR REPLACE.
-- =====================================================================

ALTER TABLE public.p_config_region
    ADD COLUMN IF NOT EXISTS monedas_formateo jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP FUNCTION IF EXISTS public.fn_configurar_formato_moneda(text, smallint, text, text);
CREATE OR REPLACE FUNCTION public.fn_configurar_formato_moneda(p_moneda text, p_decimales smallint, p_separador_miles text, p_separador_decimal text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_moneda text;
    v_local text;
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

    IF TRIM(COALESCE(p_separador_miles, '')) = '' OR TRIM(COALESCE(p_separador_decimal, '')) = '' THEN
        RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "separadores"}}';
    END IF;
    IF p_separador_miles = p_separador_decimal THEN
        RAISE EXCEPTION '{"key": "error_separators_must_differ", "params": {}}';
    END IF;

    UPDATE public.p_config_region
       SET monedas_formateo = jsonb_set(
           COALESCE(monedas_formateo, '{}'::jsonb),
           ARRAY[v_moneda],
           jsonb_build_object(
               'decimales', p_decimales,
               'separador_miles', p_separador_miles,
               'separador_decimal', p_separador_decimal),
           true)
     WHERE user_id = v_user_id;
    IF NOT FOUND THEN
        INSERT INTO public.p_config_region (user_id, monedas_formateo)
        VALUES (v_user_id, jsonb_build_object(v_moneda, jsonb_build_object(
            'decimales', p_decimales,
            'separador_miles', p_separador_miles,
            'separador_decimal', p_separador_decimal)));
    END IF;

    RETURN (SELECT monedas_formateo FROM public.p_config_region WHERE user_id = v_user_id);
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_obtener_formato_moneda();
CREATE OR REPLACE FUNCTION public.fn_obtener_formato_moneda()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_local text;
    v_dec_local smallint;
    v_dec_2a smallint;
    v_sep_miles text;
    v_sep_dec text;
    v_overrides jsonb;
    v_extra text;
    v_entry jsonb;
    v_cat_decimales smallint;
    v_out jsonb := '{}'::jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(r.moneda_default, 'ARS'), COALESCE(r.monedas_formateo, '{}'::jsonb)
      INTO v_local, v_overrides
      FROM public.p_config_region r
     WHERE r.user_id = v_user_id;
    v_local := COALESCE(v_local, 'ARS');
    v_overrides := COALESCE(v_overrides, '{}'::jsonb);

    SELECT p.decimales_moneda_local, p.decimales_segunda_moneda,
           COALESCE(p.separador_miles, '.'), COALESCE(p.separador_decimal, ',')
      INTO v_dec_local, v_dec_2a, v_sep_miles, v_sep_dec
      FROM public.p_preferencias_usuario p
     WHERE p.user_id = v_user_id;

    -- Moneda local: override si hay, prefs legacy como herencia (la UI del
    -- peer U3 formatea por moneda las TRES: la local tambien, S22).
    v_entry := v_overrides -> v_local;
    IF v_entry IS NOT NULL AND v_entry ? 'decimales' THEN
        v_out := jsonb_set(v_out, ARRAY[v_local], v_entry);
    ELSE
        v_out := jsonb_set(v_out, ARRAY[v_local], jsonb_build_object(
            'decimales', COALESCE(v_dec_local, 0),
            'separador_miles', COALESCE(v_sep_miles, '.'),
            'separador_decimal', COALESCE(v_sep_dec, ',')));
    END IF;

    -- USD cuando NO es la local (2a default): override si hay, prefs herencia.
    IF v_local <> 'USD' THEN
        v_entry := v_overrides -> 'USD';
        IF v_entry IS NOT NULL AND v_entry ? 'decimales' THEN
            v_out := jsonb_set(v_out, ARRAY['USD'], v_entry);
        ELSE
            v_out := jsonb_set(v_out, ARRAY['USD'], jsonb_build_object(
                'decimales', COALESCE(v_dec_2a, 2),
                'separador_miles', COALESCE(v_sep_miles, '.'),
                'separador_decimal', COALESCE(v_sep_dec, ',')));
        END IF;
    END IF;

    -- Extras del usuario: override si hay, fallback catalogo + separadores
    -- globales si no. NUNCA falta una moneda activa del usuario.
    FOR v_extra IN
        SELECT x FROM jsonb_array_elements_text(public.fn_obtener_monedas_extra()) AS t(x)
    LOOP
        IF v_extra = v_local OR v_out ? v_extra THEN CONTINUE; END IF;
        v_entry := v_overrides -> v_extra;
        IF v_entry IS NULL OR NOT (v_entry ? 'decimales') THEN
            SELECT m.decimales INTO v_cat_decimales
              FROM public.p_monedas m
             WHERE m.codigo = v_extra
             LIMIT 1;
            v_entry := jsonb_build_object(
                'decimales', COALESCE(v_cat_decimales, 2),
                'separador_miles', COALESCE(v_sep_miles, '.'),
                'separador_decimal', COALESCE(v_sep_dec, ','));
        END IF;
        v_out := jsonb_set(v_out, ARRAY[v_extra], v_entry);
    END LOOP;

    RETURN v_out;
END;
$function$;