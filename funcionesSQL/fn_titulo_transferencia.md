# fn_titulo_transferencia

## Descripción
Helper de títulos de transferencia (feature monedas-extra-libres del agente P3, deploy 75 del 2026-10-16 con aprobación del dueño). `fn_titulo_transferencia(p_origen, p_destino, p_local) RETURNS text IMMUTABLE`:

- Mismo árbol de decisión que `src/lib/transferTitles.ts` (12/12 casos JS).
- Parámetros vacíos o misma divisa → `transfer_entre_cuentas`.
- Destino local + origen distinto → compra; destino distinto → venta.
- `USD` conserva keys legacy (`transfer_compra_dolares` / `transfer_venta_dolares`).
- Divisas extra → JSON embebido en texto: `{"key": "transfer_compra_moneda"|"transfer_venta_moneda", "params": {"moneda": "<CODE>"}}`; el front (`HomePage`, única superficie con `t(detalle)`) resuelve el nombre humano con `currencyName`.
- Consumida por `fn_registrar_movimiento_caja` y `fn_aprobar_cuarentena_v2` (verificado en producción: ambos cuerpos la referencian).
- Corrige el legado: `v_moneda_local` en registrar estaba declarada sin asignar (CASE caía siempre en `entre_cuentas`); se resuelve con `fn_get_default_currency`.
- IMMUTABLE, sin SECURITY DEFINER (helper puro).

## Codigo SQL (definicion deployada en vivo 2026-10-16)
```sql
CREATE OR REPLACE FUNCTION public.fn_titulo_transferencia(p_origen text, p_destino text, p_local text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_origen  text := UPPER(TRIM(COALESCE(p_origen, '')));
    v_destino text := UPPER(TRIM(COALESCE(p_destino, '')));
    v_local   text := UPPER(TRIM(COALESCE(p_local, '')));
BEGIN
    IF v_origen = '' OR v_destino = '' OR v_local = '' THEN
        RETURN 'transfer_entre_cuentas';
    END IF;
    IF v_origen = v_destino THEN
        RETURN 'transfer_entre_cuentas';
    END IF;
    IF v_destino <> v_local THEN
        IF v_destino = 'USD' THEN
            RETURN 'transfer_compra_dolares';
        END IF;
        RETURN jsonb_build_object(
            'key', 'transfer_compra_moneda',
            'params', jsonb_build_object('moneda', v_destino))::text;
    END IF;
    IF v_origen = 'USD' THEN
        RETURN 'transfer_venta_dolares';
    END IF;
    RETURN jsonb_build_object(
        'key', 'transfer_venta_moneda',
        'params', jsonb_build_object('moneda', v_origen))::text;
END;
$function$
```