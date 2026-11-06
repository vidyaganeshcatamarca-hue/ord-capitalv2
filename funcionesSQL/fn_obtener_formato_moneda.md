# fn_obtener_formato_moneda

## Descripcion
Mapa RESUELTO de formato por moneda para el front (feature monedas-extra-libres de P3, deploy 78 del 2026-10-16 con OK del dueno). `RETURNS jsonb` con `{CODE: {decimales, separador_miles, separador_decimal}}` para TODAS las monedas activas del usuario — NUNCA undefined para una moneda activa.

- **REV.79 (2026-10-19, matizado con la regla del dueno)**: el mapa trae SOLO monedas del usuario. Si el set de extras esta VACIO (nada elegido), USD vuelve como 2a por defecto con herencia de `decimales_segunda_moneda` (S13: es default, no fantasma). Si hay extras elegidas (con o sin USD), el mapa refleja exactamente ese set; USD-as-extra conserva su herencia historica via el loop de extras.
- **Local**: hereda de `p_preferencias_usuario` (decimales_moneda_local + separadores globales) salvo override en `monedas_formateo`.
- **Extras**: `p_config_region.monedas_formateo` override si existe; fallback a decimales del catalogo (`p_monedas.decimales`, WU1 CLDR) + separadores globales.
- El peer menu-ajustes U3 consume esta RPC en su swap de data-layer (frontera de formato por moneda en 'Formato de numeros' de Ajustes).

## Codigo SQL (definicion deployada rev.79, 2026-10-19; extraida con pg_get_functiondef)
```sql
CREATE OR REPLACE FUNCTION public.fn_obtener_formato_moneda()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    v_extras_count int := 0;
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

    -- Tanda 2/BUG dueño: USD FANTASMA fuera. El mapa SOLO contiene monedas del
    -- usuario (local + extras efectivas); si USD es extra (el default de S13),
    -- el loop de abajo la agrega con override o herencia de
    -- decimales_segunda_moneda; si el dueño la quitó, no aparece.

    -- Extras del usuario: override si hay, fallback catalogo + separadores
    -- globales si no. NUNCA falta una moneda activa del usuario.
    FOR v_extra IN
        SELECT x FROM jsonb_array_elements_text(public.fn_obtener_monedas_extra()) AS t(x)
    LOOP
        IF v_extra = v_local OR v_out ? v_extra THEN CONTINUE; END IF;
        v_extras_count := v_extras_count + 1;
        v_entry := v_overrides -> v_extra;
        IF v_entry IS NULL OR NOT (v_entry ? 'decimales') THEN
            IF v_extra = 'USD' THEN
                -- La 2a default hereda decimales_segunda_moneda (comportamiento historico).
                v_entry := jsonb_build_object(
                    'decimales', COALESCE(v_dec_2a, 2),
                    'separador_miles', COALESCE(v_sep_miles, '.'),
                    'separador_decimal', COALESCE(v_sep_dec, ','));
            ELSE
                SELECT m.decimales INTO v_cat_decimales
                  FROM public.p_monedas m
                 WHERE m.codigo = v_extra
                 LIMIT 1;
                v_entry := jsonb_build_object(
                    'decimales', COALESCE(v_cat_decimales, 2),
                    'separador_miles', COALESCE(v_sep_miles, '.'),
                    'separador_decimal', COALESCE(v_sep_dec, ','));
            END IF;
        END IF;
        v_out := jsonb_set(v_out, ARRAY[v_extra], v_entry);
    END LOOP;

    -- Regla del dueño (tanda 2): 'USD es default de segunda moneda cuando no
    -- hay otra elegida'. Si el set quedó VACÍO el usuario no eligió nada:
    -- USD vuelve como 2ª con la herencia histórica
    -- decimales_segunda_moneda (S13). Si eligió OTRAS (con o sin USD), no
    -- hay fantasma: el mapa refleja exactamente lo elegido.
    IF v_extras_count = 0 AND v_local <> 'USD' THEN
        v_entry := v_overrides -> 'USD';
        IF v_entry IS NULL OR NOT (v_entry ? 'decimales') THEN
            v_entry := jsonb_build_object(
                'decimales', COALESCE(v_dec_2a, 2),
                'separador_miles', COALESCE(v_sep_miles, '.'),
                'separador_decimal', COALESCE(v_sep_dec, ','));
        END IF;
        v_out := jsonb_set(v_out, ARRAY['USD'], v_entry);
    END IF;

    RETURN v_out;
END;
$function$

```
sql
CREATE OR REPLACE FUNCTION public.fn_obtener_formato_moneda()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
$function$

```
