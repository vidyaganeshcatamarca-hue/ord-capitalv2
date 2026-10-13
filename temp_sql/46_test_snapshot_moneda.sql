-- Test transaccional del snapshot de moneda local: todo dentro de un DO que termina
-- en RAISE EXCEPTION => rollback automatico, nada queda en la base. El resultado
-- PASS/FAIL viaja en el message de la excepcion.
DO $$
DECLARE
    v_id bigint;
    v_row public.p_caja%ROWTYPE;
    v_res jsonb := '[]'::jsonb;
    x numeric;
BEGIN
    -- 1. Insert USD 555 en billetera USD (1331, usuario 183 local EUR)
    INSERT INTO public.p_caja (user_id, fecha, tipo, billetera_origen_id, valor_egreso, valor_ingreso, moneda, es_compartido)
    VALUES (183, CURRENT_DATE, 'expense', 1331, 555, 0, 'ARS', false)
    RETURNING * INTO v_row;
    v_id := v_row.p_caja_id;
    -- La fila va con el default legacy 'ARS' a proposito: la moneda de verdad la
    -- resuelve el trigger desde la billetera.
    v_res := v_res || jsonb_build_array(jsonb_build_object(
        'assertion', 'insert USD: moneda_local EUR y valor ~496,84',
        'ok', v_row.moneda_local = 'EUR' AND v_row.valor_local BETWEEN 490 AND 500,
        'error', jsonb_build_object('valor_local', v_row.valor_local, 'moneda_local', v_row.moneda_local)
    ));

    -- 2. Editar el monto re-congela con la tasa de hoy
    UPDATE public.p_caja SET valor_egreso = 1000 WHERE p_caja_id = v_id RETURNING valor_local, tasa_snapshot INTO v_row;
    v_res := v_res || jsonb_build_array(jsonb_build_object(
        'assertion', 'editar monto: recalcula ~895,2',
        'ok', v_row.valor_local BETWEEN 890 AND 900,
        'error', jsonb_build_object('valor_local', v_row.valor_local)
    ));

    -- 3. Editar observaciones (update sin monto) NO toca el snapshot
    SELECT valor_local, tasa_snapshot INTO x, v_row.tasa_snapshot FROM public.p_caja WHERE p_caja_id = v_id;
    UPDATE public.p_caja SET observaciones = 'prueba' WHERE p_caja_id = v_id;
    v_res := v_res || jsonb_build_array(jsonb_build_object(
        'assertion', 'editar observaciones: snapshot intacto',
        'ok', (SELECT valor_local = x AND tasa_snapshot = v_row.tasa_snapshot FROM public.p_caja WHERE p_caja_id = v_id),
        'error', jsonb_build_object('antes', x)
    ));

    -- 4. Identidad: gasto en la moneda local congela factor 1 sin cotizacion
    INSERT INTO public.p_caja (user_id, fecha, tipo, billetera_origen_id, valor_egreso, valor_ingreso, moneda, es_compartido)
    VALUES (183, CURRENT_DATE, 'expense', 1326, 100, 0, 'ARS', false)
    RETURNING * INTO v_row;
    v_res := v_res || jsonb_build_array(jsonb_build_object(
        'assertion', 'identidad EUR: valor_local = 100, tasa 1',
        'ok', v_row.valor_local = 100 AND v_row.tasa_snapshot = 1,
        'error', jsonb_build_object('valor_local', v_row.valor_local, 'tasa', v_row.tasa_snapshot)
    ));

    -- 5. Legacy es_usd gana: usuario 1 (ARS), es_usd true, moneda registrada ARS
    INSERT INTO public.p_caja (user_id, fecha, tipo, valor_egreso, valor_ingreso, moneda, es_usd, es_compartido)
    VALUES (1, CURRENT_DATE, 'expense', 10, 0, 'ARS', true, false)
    RETURNING * INTO v_row;
    v_res := v_res || jsonb_build_array(jsonb_build_object(
        'assertion', 'es_usd: convierte USD→ARS ~15158',
        'ok', v_row.moneda_local = 'ARS' AND v_row.valor_local BETWEEN 15000 AND 15500,
        'error', jsonb_build_object('valor_local', v_row.valor_local, 'moneda_local', v_row.moneda_local)
    ));

    -- 6. Transfer sin snapshot
    INSERT INTO public.p_caja (user_id, fecha, tipo, billetera_origen_id, billetera_destino_id, valor_egreso, valor_ingreso, moneda, es_compartido)
    VALUES (183, CURRENT_DATE, 'transfer', 1326, 1327, 100, 100, 'EUR', false)
    RETURNING * INTO v_row;
    v_res := v_res || jsonb_build_array(jsonb_build_object(
        'assertion', 'transfer: sin snapshot',
        'ok', v_row.valor_local IS NULL AND v_row.moneda_local IS NULL,
        'error', jsonb_build_object('valor_local', v_row.valor_local)
    ));

    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res) e WHERE NOT (e.value->>'ok')::boolean) THEN
        RAISE EXCEPTION '%', jsonb_build_object('result', 'PASS', 'detail', v_res)::text;
    ELSE
        RAISE EXCEPTION '%', jsonb_build_object('result', 'FAIL', 'detail', v_res)::text;
    END IF;
END $$;