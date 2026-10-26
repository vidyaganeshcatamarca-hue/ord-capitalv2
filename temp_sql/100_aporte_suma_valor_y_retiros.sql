-- ============================================================================
-- 100 — El aporte suma al valor actual, y la cartera puede listar los retiros
--
--   Dos correcciones de la ronda 6 que se aplican juntas porque comparten la misma
--   fuente de datos (los movimientos de p_caja con metadata.inversion_id).
--
--   Parte 1 (S2): fn_aportar_inversion ahora suma el monto aportado a
--   valor_mercado_actual. Antes sólo subía el capital, y como la tarjeta resta
--   capital − valor, agregar 200.000 fabricaba una pérdida de 200.000. Con esta
--   corrección los dos lados suben lo mismo y la ganancia queda neutra al aportar.
--
--   Parte 2 (S2): reparación de los aportes YA registrados. Todos los que existen hoy
--   se hicieron con la versión vieja, así que ninguno fue compensado. Se corre UNA vez:
--   si se aplicara dos veces, sumaría doble.
--     `monto_invertido_original - a.total` porque el capital YA incluye el aporte; si el
--   valor fuera NULL hay que reconstruir el capital previo antes de volver a sumar.
--
--   Parte 3 (S3): fn_retiros_inversiones() expone los retiros individuales, que hasta
--   ahora eran un solo número agregado (p_inversiones.monto_liquidado). La fuente es
--   p_caja con el prefijo 'rescate_inversion:' que ya usan las liquidaciones, así que no
--   hace falta una tabla nueva ni tocar fn_reporte_cartera_inversiones.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) fn_aportar_inversion: el aporte suma al valor
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_aportar_inversion(
    p_inversion_id bigint,
    p_monto numeric,
    p_billetera_origen_id bigint
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_inversion RECORD;
    v_user_id bigint;
    v_categoria_inversion_id bigint;
    v_moneda_billetera text;
    v_capital_nuevo numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_monto IS NULL OR p_monto <= 0 THEN
        RAISE EXCEPTION '{"key": "error_amount_required", "params": {}}';
    END IF;

    SELECT * INTO v_inversion
    FROM public.p_inversiones
    WHERE inversion_id = p_inversion_id AND user_id = v_user_id;

    IF v_inversion.inversion_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_investment_not_found", "params": {}}';
    END IF;

    IF v_inversion.estado = 'finalizada' THEN
        RAISE EXCEPTION '{"key": "error_investment_already_liquidated", "params": {}}';
    END IF;

    SELECT moneda INTO v_moneda_billetera
    FROM public.p_billeteras
    WHERE billetera_id = p_billetera_origen_id AND user_id = v_user_id;

    IF v_moneda_billetera IS NULL THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
    END IF;

    IF btrim(upper(v_moneda_billetera)) <> btrim(upper(COALESCE(v_inversion.moneda, 'ARS'))) THEN
        RAISE EXCEPTION '{"key": "error_wallet_currency_mismatch", "params": {}}';
    END IF;

    SELECT estructura_id INTO v_categoria_inversion_id
    FROM public.p_estructuras_egresos
    WHERE user_id = v_user_id AND tipo_cupo = 'investment'
    ORDER BY estructura_id LIMIT 1;

    -- El dinero sale de la billetera y entra a la inversión: egreso en la billetera,
    -- con la categoría de inversiones, igual que el alta de una inversión nueva.
    INSERT INTO public.p_caja (
        user_id, tipo, billetera_origen_id, valor_egreso,
        estructura_egreso_id, fecha, detalle, metadata
    ) VALUES (
        v_user_id, 'expense', p_billetera_origen_id, p_monto,
        v_categoria_inversion_id, CURRENT_DATE,
        'investment_contribution: ' || v_inversion.nombre_activo,
        jsonb_build_object('inversion_id', p_inversion_id, 'es_aporte', true)
    );

    -- S2 (ronda 6): el dinero que entra a la inversión también es valor de la posición.
    -- Sin esto el capital sube y el valor no, así que la resta capital − valor aparece
    -- como una pérdida que no existe. Los dos lados suben lo mismo, la ganancia no cambia.
    -- `COALESCE(valor_mercado_actual, monto_invertido_original)` porque en un SET el lado
    -- derecho lee la fila VIEJA: si el valor nunca se cargó, el teórico es el capital previo.
    UPDATE public.p_inversiones
       SET monto_invertido_original = monto_invertido_original + p_monto,
           valor_mercado_actual = COALESCE(valor_mercado_actual, monto_invertido_original) + p_monto
     WHERE inversion_id = p_inversion_id
    RETURNING monto_invertido_original INTO v_capital_nuevo;

    RETURN jsonb_build_object(
        'monto_aportado', p_monto,
        'capital_nuevo', v_capital_nuevo,
        'moneda', COALESCE(v_inversion.moneda, 'ARS'),
        'nombre_activo', v_inversion.nombre_activo
    );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2) Reparación de los aportes sin compensar (una sola vez)
-- ----------------------------------------------------------------------------
WITH aportes AS (
    SELECT (m.metadata->>'inversion_id')::bigint AS inversion_id,
           SUM(m.valor_egreso)::numeric AS total
      FROM public.p_caja m
     WHERE m.metadata->>'es_aporte' = 'true'
       AND m.metadata->>'inversion_id' ~ '^[0-9]+$'
       AND COALESCE(m.valor_egreso, 0) > 0
     GROUP BY 1
)
UPDATE public.p_inversiones i
   SET valor_mercado_actual =
        COALESCE(i.valor_mercado_actual, i.monto_invertido_original - a.total) + a.total
  FROM aportes a
 WHERE i.inversion_id = a.inversion_id;

-- ----------------------------------------------------------------------------
-- 3) fn_retiros_inversiones: los retiros, uno por uno
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_retiros_inversiones()
 RETURNS TABLE(inversion_id bigint, monto numeric, fecha date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    RETURN QUERY
    SELECT (m.metadata->>'inversion_id')::bigint AS inversion_id,
           m.valor_ingreso::numeric AS monto,
           m.fecha
      FROM public.p_caja m
     WHERE m.user_id = v_user_id
       AND m.metadata ? 'inversion_id'
       AND m.metadata->>'inversion_id' ~ '^[0-9]+$'
       AND COALESCE(m.valor_ingreso, 0) > 0
       AND m.detalle LIKE 'rescate_inversion:%'
     ORDER BY m.fecha, m.p_caja_id;
END;
$function$;

-- Verificación (read-only):
--   select pg_get_function_identity_arguments(oid) from pg_proc
--    where proname in ('fn_aportar_inversion','fn_retiros_inversiones');
--   select inversion_id, monto_invertido_original, valor_mercado_actual, monto_liquidado
--     from p_inversiones where inversion_id = 25;
