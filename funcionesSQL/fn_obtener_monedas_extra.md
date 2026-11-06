# fn_obtener_monedas_extra

## Descripción
Devuelve las monedas extra efectivas del usuario en modo jsonb. Es parte del feature de monedas extra (developed by agent P3, feature doc `odd/tasks/monedas-extra-libres.md`, deployed 2026-10-16 con aprobación del dueño).

- Lee `p_config_region.monedas_extra` (columna jsonb `NOT NULL DEFAULT '["USD"]'`, agregada en el deploy 74) y `p_config_region.moneda_default` (local).
- Default `["USD"]` si falta la fila.
- Normaliza: uppercase + trim, sin duplicados, sin moneda local, ordenado por orden original.
- STABLE, SECURITY DEFINER con `auth.uid()` (identidad interna, sin parámetros).

## Codigo SQL (definicion deployada en vivo 2026-10-16)
```sql
CREATE OR REPLACE FUNCTION public.fn_obtener_monedas_extra()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_monedas jsonb;
    v_local   text;
    v_out     jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT r.monedas_extra, r.moneda_default
      INTO v_monedas, v_local
      FROM public.p_config_region r
     WHERE r.user_id = v_user_id;

    v_monedas := COALESCE(v_monedas, '["USD"]'::jsonb);
    v_local   := UPPER(TRIM(COALESCE(v_local, '')));

    SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO v_out
    FROM (
        SELECT UPPER(TRIM(t.x)) AS x, MIN(t.ord) AS ord
        FROM jsonb_array_elements_text(v_monedas) WITH ORDINALITY AS t(x, ord)
        WHERE UPPER(TRIM(t.x)) <> ''
          AND UPPER(TRIM(t.x)) <> v_local
        GROUP BY UPPER(TRIM(t.x))
    ) s;

    RETURN v_out;
END;
$function$
```