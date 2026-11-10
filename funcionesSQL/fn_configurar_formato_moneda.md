# fn_configurar_formato_moneda

## Descripcion
Configuration del formato (decimales + separadores) por moneda (feature monedas-extra-libres de P3, deploy 78 del 2026-10-16 con OK del dueno). `RETURNS jsonb` (mapa actualizado post-MERGE).

- `p_moneda text` (UPPER/TRIM), `p_decimales smallint` (0-4), `p_separador_miles text`, `p_separador_decimal text`.
- Guarda de contrato solicitada por el peer menu-ajustes: rechaza monedas que no son ni la LOCAL ni una EXTRA ACTIVA (`error_formato_moneda_moneda_invalida`) — evita overrides huerfanos.
- Valida `error_field_required` (moneda vacia), `error_formato_moneda_decimales` (fuera de 0-4 o NULL), `error_formato_moneda_separadores` (separador vacio) y separadores iguales (contrato del proyecto: miles != decimal).
- MERGE en `p_config_region.monedas_formateo` (jsonb `{CODE: {decimales, separador_miles, separador_decimal}}`), con upsert via `FOR UPDATE` fila por fila, UPDATE del objeto.
- SECURITY DEFINER con `auth.uid()` (regla del proyecto).
- La LOCAL y la USD (2a default) NO viven acá: siguen leyendo `p_preferencias_usuario` (decimales_moneda_local/decimales_segunda_moneda + separadores) — CERO migración de datos (opción B del peer).

## Codigo SQL (definicion deployada en vivo 2026-10-16)
```sql
```sql
CREATE OR REPLACE FUNCTION public.fn_configurar_formato_moneda(p_moneda text, p_decimales integer, p_separador_miles text, p_separador_decimal text)
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
$function$

```
