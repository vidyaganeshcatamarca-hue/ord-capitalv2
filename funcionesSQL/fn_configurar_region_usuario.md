CREATE OR REPLACE FUNCTION public.fn_configurar_region_usuario(p_pais_codigo text, p_moneda_local text, p_idioma text DEFAULT 'es'::text, p_origen text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id     bigint;
    v_moneda_pais char(3);
    v_pais_previo text;
    v_derivar     boolean;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- El pais tiene que estar en el catalogo y habilitado.
    SELECT p.moneda_local INTO v_moneda_pais
    FROM public.p_paises p
    WHERE p.codigo = p_pais_codigo AND p.soportado = true;

    IF v_moneda_pais IS NULL THEN
        RAISE EXCEPTION '{"key": "error_country_not_supported", "params": {}}';
    END IF;

    SELECT r.pais_codigo::text INTO v_pais_previo
    FROM public.p_config_region r WHERE r.user_id = v_user_id;

    v_derivar := (p_origen IS NOT NULL) OR (v_pais_previo IS DISTINCT FROM p_pais_codigo);

    -- La moneda la define el pais. Si el cliente manda otra cosa, se ignora y gana el catalogo.
    -- confirmado_at solo se estampa cuando el cliente declara el origen: configurar el formato
    -- regional no es confirmar el pais.
    INSERT INTO public.p_config_region
        (user_id, pais_codigo, moneda_default, idioma_default, origen_pais, confirmado_at)
    VALUES
        (v_user_id, p_pais_codigo, v_moneda_pais::text, p_idioma, p_origen,
         CASE WHEN p_origen IS NOT NULL THEN now() ELSE NULL END)
    ON CONFLICT (user_id) DO UPDATE SET
        pais_codigo    = EXCLUDED.pais_codigo,
        moneda_default = EXCLUDED.moneda_default,
        idioma_default = EXCLUDED.idioma_default,
        origen_pais    = COALESCE(EXCLUDED.origen_pais, p_config_region.origen_pais),
        confirmado_at  = CASE
            WHEN EXCLUDED.origen_pais IS NOT NULL THEN now()
            ELSE p_config_region.confirmado_at
        END;

    -- Formatos regionales derivados del catalogo: decimales de la moneda local, decimales de la
    -- segunda moneda (USD), separadores, primer dia de semana y formatos de fecha y hora.
    IF v_derivar THEN
        INSERT INTO public.p_preferencias_usuario (user_id)
        VALUES (v_user_id)
        ON CONFLICT (user_id) DO NOTHING;

        UPDATE public.p_preferencias_usuario pref
        SET decimales_moneda_local   = mon.decimales,
            decimales_segunda_moneda = COALESCE(usd.decimales, 2),
            separador_miles          = pais.separador_miles,
            separador_decimal        = pais.separador_decimal,
            primer_dia_semana        = pais.primer_dia_semana,
            formato_fecha            = pais.formato_fecha,
            formato_hora             = pais.formato_hora,
            actualizado_at           = now()
        FROM public.p_paises pais
        JOIN public.p_monedas mon ON mon.codigo = pais.moneda_local
        LEFT JOIN public.p_monedas usd ON usd.codigo = 'USD'
        WHERE pais.codigo = p_pais_codigo
          AND pref.user_id = v_user_id;
    END IF;
END;
$function$

-- NOTA: Nuevo parametro p_origen. La moneda la define el pais (p_moneda_local se ignora). Valida contra p_paises. confirmado_at SOLO se estampa si el cliente manda p_origen: configurar el formato regional (por ejemplo cambiar el idioma) no es confirmar el pais.
