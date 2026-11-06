# fn_obtener_divisas_cotizadas

## Descripcion
Catalogo de monedas cotizadas disponibles para el usuario-front (feature monedas-extra-libres de P3, deploy 77 del 2026-10-16 con aprobacion del dueno). `RETURNS text[]` — array con las 51 divisas de `p_divisas` que tienen `ultima_actualizacion` NO nula (USD siempre presente: tiene rate por definicion del pivote S7).

- SQL simple STABLE SECURITY DEFINER (catalogo global, no dependiente de usuario).
- Tooltip del front: `t('config_format_numbers')` no la consume — la usa P3/T8 para llenar el selector de segunda/tercera moneda (BloqueMonedas); el peer menu-ajustes U3 formatting sections NO necesita leerla (es鲁迅 del selector).

## Codigo SQL (definicion deployada en vivo 2026-10-16)
```sql
CREATE OR REPLACE FUNCTION public.fn_obtener_divisas_cotizadas()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        array_agg(DISTINCT d.nombre ORDER BY d.nombre),
        ARRAY[]::text[]
    )
    FROM public.p_divisas d
    WHERE d.ultima_actualizacion IS NOT NULL;
$function$
```