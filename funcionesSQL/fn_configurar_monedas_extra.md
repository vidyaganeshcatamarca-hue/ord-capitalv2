# fn_configurar_monedas_extra

## Descripción
Configura las monedas extra del usuario (hasta 2, más la local). Es parte del feature de monedas extra (developed by agent P3, feature doc `odd/tasks/monedas-extra-libres.md`, deployed 2026-10-16 con aprobación del dueño).

- `p_monedas text[]`: lista de divisas extra a configurar. `NULL` → array vacío.
- Anti-bypass (S5 del feature doc): `cardinality(p_monedas) > 2` se rechaza sin excepciones de dimensiones; un `text[][]` no puede colarse más allá del límite 2.
- Normaliza a MAYUSCULAS + trim y valida cada item: no puede ser la moneda local, no puede duplicarse, debe existir en el catálogo `p_divisas` (`nombre`).
- S14 con FK de billeteras: quitar/reemplazar una extra que aún tiene `p_billeteras` activas se rechaza (`error_monedas_extra_has_wallets`).
- Upsert en `p_config_region.monedas_extra` (UPDATE si existe fila, INSERT si no), con `FOR UPDATE` para serializar contra `fn_crear_billetera*`.
- Errores (contrato JSON): `error_monedas_extra_limite`, `error_monedas_extra_local`, `error_monedas_extra_duplicada`, `error_monedas_extra_invalida`, `error_monedas_extra_has_wallets`, `error_unauthorized`.
- SECURITY DEFINER con `auth.uid()` (identidad interna, sin usuario por parámetro).

## Codigo SQL (definicion deployada en vivo 2026-10-16)
```sql
CREATE OR REPLACE FUNCTION public.fn_configurar_monedas_extra(p_monedas text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_local   text;
    v_actual  jsonb;
    v_norm    text[] := ARRAY[]::text[];
    v_item    text;
    v_removed text;
    v_wallets int;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF p_monedas IS NULL THEN
        p_monedas := ARRAY[]::text[];
    END IF;

    -- Flatten: un text[][] (ej. 2x2 con 4 monedas distintas) NO puede colarse por el
    -- limite de la dimension 1. Cardinality() cuenta TODOS los elementos de TODAS
    -- las dimensiones (S5); el FOREACH de abajo itera el mismo conjunto.
    IF cardinality(p_monedas) > 2 THEN
        RAISE EXCEPTION '%', jsonb_build_object(
            'key', 'error_monedas_extra_limite',
            'params', jsonb_build_object('max', 2, 'count', cardinality(p_monedas)))::text;
    END IF;

    SELECT r.monedas_extra, UPPER(TRIM(COALESCE(r.moneda_default, '')))
      INTO v_actual, v_local
      FROM public.p_config_region r
     WHERE r.user_id = v_user_id
     FOR UPDATE;   -- serializa contra fn_crear_billetera* y otra ejecucion de esta misma funcion

    v_actual := COALESCE(v_actual, '["USD"]'::jsonb);
    v_local  := COALESCE(v_local, '');

    -- Normaliza a MAYUSCULAS y valida: no local, sin duplicados, catalogo p_divisas (S9).
    FOREACH v_item IN ARRAY p_monedas LOOP
        v_item := UPPER(TRIM(COALESCE(v_item, '')));
        IF v_item = '' THEN
            CONTINUE;
        END IF;
        IF v_item = v_local THEN
            RAISE EXCEPTION '%', jsonb_build_object(
                'key', 'error_monedas_extra_local',
                'params', jsonb_build_object('currency', v_item))::text;
        END IF;
        IF v_item = ANY(v_norm) THEN
            RAISE EXCEPTION '%', jsonb_build_object(
                'key', 'error_monedas_extra_duplicada',
                'params', jsonb_build_object('currency', v_item))::text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.p_divisas d WHERE d.nombre = v_item) THEN
            RAISE EXCEPTION '%', jsonb_build_object(
                'key', 'error_monedas_extra_invalida',
                'params', jsonb_build_object('currency', v_item))::text;
        END IF;
        v_norm := v_norm || v_item;
    END LOOP;

    -- S14: quitar/reemplazar una extra con billeteras activas queda bloqueado.
    FOR v_removed IN
        SELECT DISTINCT UPPER(TRIM(t.x))
        FROM jsonb_array_elements_text(v_actual) AS t(x)
        WHERE UPPER(TRIM(t.x)) <> ''
          AND UPPER(TRIM(t.x)) <> v_local
          AND NOT (UPPER(TRIM(t.x)) = ANY(v_norm))
    LOOP
        SELECT count(*) INTO v_wallets
        FROM public.p_billeteras b
        WHERE b.user_id = v_user_id
          AND b.moneda = v_removed
          AND b.activa = true;
        IF v_wallets > 0 THEN
            RAISE EXCEPTION '%', jsonb_build_object(
                'key', 'error_monedas_extra_has_wallets',
                'params', jsonb_build_object('currency', v_removed, 'count', v_wallets))::text;
        END IF;
    END LOOP;

    UPDATE public.p_config_region
       SET monedas_extra = to_jsonb(v_norm)
     WHERE user_id = v_user_id;
    IF NOT FOUND THEN
        INSERT INTO public.p_config_region (user_id, monedas_extra)
        VALUES (v_user_id, to_jsonb(v_norm));
    END IF;

    RETURN to_jsonb(v_norm);
END;
$function$
```