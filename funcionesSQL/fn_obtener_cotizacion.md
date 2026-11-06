# fn_obtener_cotizacion

## Descripción
Cotización generica entre dos divisas por pivote USD. `fn_obtener_cotizacion(p_origen, p_destino)` es parte del feature de monedas extra (developed by agent P3, feature doc `odd/tasks/monedas-extra-libres.md`, deployed 2026-10-16 con aprobación del dueño).

- `RETURNS TABLE(cotizacion numeric, fecha date)`; `cotizacion(origen, destino) = valor_por_usd(destino) / valor_por_usd(origen)` (síntoma: `p_divisas.valor_por_usd` = valor de cada divisa en USD).
- `fecha` = la más vieja de las dos `ultima_actualizacion` (frescura honesta, S15 del feature doc).
- Origen/destino vacíos → `(NULL, NULL)`.
- Misma divisa → `(1.00, NULL)` por definición: conversión trivial entre cuentas de la misma divisa, no una "tasa" (no pasa por `p_divisas`).
- Divisa ausente en `p_divisas` (o `valor_por_usd` 0) → `(NULL, NULL)`. Nunca devuelve `1.00` encubierto (D17 del feature doc).
- STABLE, SECURITY DEFINER con `auth.uid()` no requerido aquí (es lectura de catálogo, no de usuario).

## Codigo SQL (definicion deployada en vivo 2026-10-16)
```sql
CREATE OR REPLACE FUNCTION public.fn_obtener_cotizacion(p_origen text, p_destino text)
 RETURNS TABLE(cotizacion numeric, fecha date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_origen       text;
    v_destino      text;
    v_rate_origen  numeric;
    v_rate_destino numeric;
    v_fecha_origen  timestamptz;
    v_fecha_destino timestamptz;
BEGIN
    v_origen  := UPPER(TRIM(COALESCE(p_origen, '')));
    v_destino := UPPER(TRIM(COALESCE(p_destino, '')));

    -- Cotizacion generica por pivote USD (S7/S15).
    --   cotizacion(origen,destino) = valor_por_usd(destino) / valor_por_usd(origen)
    --   fecha = la MAS VIEJA de las dos ultima_actualizacion (frescura honesta, S15).
    --   Moneda AUSENTE en p_divisas -> (NULL, NULL). NUNCA 1.00 (D17).
    --   Identidad misma-moneda -> (1.00, NULL) por definicion, sin pasar por p_divisas:
    --   es una conversion trivial entre cuentas de la misma divisa (S4), no una "tasa";
    --   D17 solo protege contra monedas que NO se podrian convertir.
    IF v_origen = '' OR v_destino = '' THEN
        RETURN QUERY SELECT NULL::numeric, NULL::date;
        RETURN;
    END IF;

    IF v_origen = v_destino THEN
        RETURN QUERY SELECT 1.00::numeric, NULL::date;
        RETURN;
    END IF;

    SELECT d.valor_por_usd, d.ultima_actualizacion
      INTO v_rate_origen, v_fecha_origen
      FROM public.p_divisas d
     WHERE d.nombre = v_origen
     ORDER BY d.ultima_actualizacion DESC
     LIMIT 1;

    SELECT d.valor_por_usd, d.ultima_actualizacion
      INTO v_rate_destino, v_fecha_destino
      FROM public.p_divisas d
     WHERE d.nombre = v_destino
     ORDER BY d.ultima_actualizacion DESC
     LIMIT 1;

    IF v_rate_origen IS NULL OR v_rate_destino IS NULL
       OR v_rate_origen = 0 OR v_rate_destino = 0 THEN
        RETURN QUERY SELECT NULL::numeric, NULL::date;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT (v_rate_destino / v_rate_origen)::numeric,
           LEAST(v_fecha_origen, v_fecha_destino)::date;
END;
$function$
```