// B1: moneda derivada de la billetera/tarjeta real en fn_aprobar_cuarentena_v2
// + es_usd consistente. Parte del espejo actual (que ES el live verificado).
const fs = require('fs');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

let s = fs.readFileSync('funcionesSQL/fn_aprobar_cuarentena_v2.md', 'utf8').split('\r\n').join('\n');

// 1. DECLARE
s = replaceOnce(
  s,
  "    v_saldo_actual numeric;\n    v_wallet_nombre text;\n",
  "    v_saldo_actual numeric;\n    v_wallet_nombre text;\n    v_moneda text;\n    v_moneda_2 text;\n",
  'declare'
);

// 2. expense: el SELECT con lock traer moneda
s = replaceOnce(
  s,
  "        SELECT b.saldo_actual, b.nombre\n        INTO v_saldo_actual, v_wallet_nombre\n        FROM public.p_billeteras b\n        WHERE b.billetera_id = v_rec.billetera_id\n          AND b.user_id = v_user_id\n        FOR UPDATE;\n\n        IF v_saldo_actual IS NULL THEN\n            RAISE EXCEPTION '{\"key\": \"error_wallet_not_found\", \"params\": {}}';\n        END IF;\n\n        IF v_saldo_actual < v_rec.monto THEN\n            RAISE EXCEPTION '{\"key\": \"error_wallet_saldo_insuficiente\", \"params\": {\"nombre\": \"%\", \"saldo\": %}}',\n                v_wallet_nombre, v_saldo_actual;\n        END IF;\n        INSERT INTO public.p_caja (\n            user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,\n            fecha, es_compartido, estructura_egreso_id, detalle, metadata\n        )\n        VALUES (\n            v_user_id, 'expense', v_rec.billetera_id, v_rec.monto, 0,\n            v_rec.fecha, false, v_rec.estructura_egreso_id, v_rec.detalle, v_metadata\n        )",
  "        SELECT b.saldo_actual, b.nombre, b.moneda\n        INTO v_saldo_actual, v_wallet_nombre, v_moneda\n        FROM public.p_billeteras b\n        WHERE b.billetera_id = v_rec.billetera_id\n          AND b.user_id = v_user_id\n        FOR UPDATE;\n\n        IF v_saldo_actual IS NULL THEN\n            RAISE EXCEPTION '{\"key\": \"error_wallet_not_found\", \"params\": {}}';\n        END IF;\n\n        IF v_saldo_actual < v_rec.monto THEN\n            RAISE EXCEPTION '{\"key\": \"error_wallet_saldo_insuficiente\", \"params\": {\"nombre\": \"%\", \"saldo\": %}}',\n                v_wallet_nombre, v_saldo_actual;\n        END IF;\n        -- The stored amount is denominated in the SOURCE wallet currency: the\n        -- movement currency must come from the wallet, never from whatever the\n        -- interpreter recorded (the default would incorrectly say ARS).\n        INSERT INTO public.p_caja (\n            user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,\n            fecha, es_compartido, estructura_egreso_id, detalle, metadata,\n            moneda, es_usd\n        )\n        VALUES (\n            v_user_id, 'expense', v_rec.billetera_id, v_rec.monto, 0,\n            v_rec.fecha, false, v_rec.estructura_egreso_id, v_rec.detalle, v_metadata,\n            v_moneda, (v_moneda = 'USD')\n        )",
  'expense'
);

// 3. income: SELECT moneda de la billetera destino + INSERT
s = replaceOnce(
  s,
  "        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN\n            RAISE EXCEPTION '{\"key\": \"error_invalid_amount\", \"params\": {}}';\n        END IF;\n\n        INSERT INTO public.p_caja (\n            user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso,\n            fecha, es_compartido, cuenta_ingreso_id, detalle, metadata\n        )\n        VALUES (\n            v_user_id, 'income', v_rec.billetera_destino_id, v_rec.monto, 0,\n            v_rec.fecha, false, v_rec.cuenta_ingreso_id, v_rec.detalle, v_metadata\n        )",
  "        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN\n            RAISE EXCEPTION '{\"key\": \"error_invalid_amount\", \"params\": {}}';\n        END IF;\n\n        SELECT b.moneda INTO v_moneda\n        FROM public.p_billeteras b\n        WHERE b.billetera_id = v_rec.billetera_destino_id\n          AND b.user_id = v_user_id;\n\n        INSERT INTO public.p_caja (\n            user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso,\n            fecha, es_compartido, cuenta_ingreso_id, detalle, metadata,\n            moneda, es_usd\n        )\n        VALUES (\n            v_user_id, 'income', v_rec.billetera_destino_id, v_rec.monto, 0,\n            v_rec.fecha, false, v_rec.cuenta_ingreso_id, v_rec.detalle, v_metadata,\n            v_moneda, (v_moneda = 'USD')\n        )",
  'income'
);

// 4. transfer: SELECT del destino (v_moneda_2) tras el bloque de saldo, y las tres variantes
s = replaceOnce(
  s,
  "        IF v_saldo_actual < v_rec.monto THEN\n            RAISE EXCEPTION '{\"key\": \"error_wallet_saldo_insuficiente\", \"params\": {\"nombre\": \"%\", \"saldo\": %}}',\n                v_wallet_nombre, v_saldo_actual;\n        END IF;\n        BEGIN\n            INSERT INTO public.p_caja (\n                user_id, tipo, billetera_origen_id, billetera_destino_id,\n                valor_egreso, valor_ingreso, fecha, detalle, metadata\n            )\n            VALUES (\n                v_user_id, 'transfer', v_rec.billetera_id, v_rec.billetera_destino_id,\n                v_rec.monto, COALESCE(v_rec.destination_amount, v_rec.monto),\n                v_rec.fecha, v_rec.detalle, v_metadata\n            )",
  "        IF v_saldo_actual < v_rec.monto THEN\n            RAISE EXCEPTION '{\"key\": \"error_wallet_saldo_insuficiente\", \"params\": {\"nombre\": \"%\", \"saldo\": %}}',\n                v_wallet_nombre, v_saldo_actual;\n        END IF;\n        SELECT b.moneda INTO v_moneda_2\n        FROM public.p_billeteras b\n        WHERE b.billetera_id = v_rec.billetera_destino_id\n          AND b.user_id = v_user_id;\n        BEGIN\n            INSERT INTO public.p_caja (\n                user_id, tipo, billetera_origen_id, billetera_destino_id,\n                valor_egreso, valor_ingreso, fecha, detalle, metadata,\n                moneda, es_usd\n            )\n            VALUES (\n                v_user_id, 'transfer', v_rec.billetera_id, v_rec.billetera_destino_id,\n                v_rec.monto, COALESCE(v_rec.destination_amount, v_rec.monto),\n                v_rec.fecha, v_rec.detalle, v_metadata,\n                v_moneda, (v_moneda = 'USD')\n            )",
  'transfer-directo'
);

// 5. transfer: el doble insert (egreso = moneda origen, acreditacion = moneda destino)
s = replaceOnce(
  s,
  "                INSERT INTO public.p_caja (\n                    user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,\n                    fecha, detalle, metadata\n                )\n                VALUES (\n                    v_user_id, 'expense', v_rec.billetera_id, v_rec.monto, 0,\n                    v_rec.fecha, v_rec.detalle,\n                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb)\n                )\n                RETURNING p_caja_id INTO v_caja_id;\n\n                INSERT INTO public.p_caja (\n                    user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso,\n                    fecha, detalle, metadata\n                )\n                VALUES (\n                    v_user_id, 'income', v_rec.billetera_destino_id, v_rec.destination_amount, 0,\n                    v_rec.fecha, v_rec.detalle,\n                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb)\n                )",
  "                INSERT INTO public.p_caja (\n                    user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,\n                    fecha, detalle, metadata, moneda, es_usd\n                )\n                VALUES (\n                    v_user_id, 'expense', v_rec.billetera_id, v_rec.monto, 0,\n                    v_rec.fecha, v_rec.detalle,\n                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb),\n                    v_moneda, (v_moneda = 'USD')\n                )\n                RETURNING p_caja_id INTO v_caja_id;\n\n                INSERT INTO public.p_caja (\n                    user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso,\n                    fecha, detalle, metadata, moneda, es_usd\n                )\n                VALUES (\n                    v_user_id, 'income', v_rec.billetera_destino_id, v_rec.destination_amount, 0,\n                    v_rec.fecha, v_rec.detalle,\n                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb),\n                    v_moneda_2, (v_moneda_2 = 'USD')\n                )",
  'transfer-doble'
);

// 6. card_expense: moneda desde la tarjeta (moneda_iso), ya no de v_rec.moneda
s = replaceOnce(
  s,
  "        INSERT INTO public.p_caja (\n            user_id, tipo, tarjeta_id, valor_egreso, valor_ingreso,\n            fecha, es_compartido, estructura_egreso_id, detalle, metadata,\n            cuotas_totales, es_usd\n        )\n        VALUES (\n            v_user_id, 'expense', v_rec.tarjeta_id, v_rec.monto, 0,\n            v_rec.fecha, false, v_rec.estructura_egreso_id, v_rec.detalle, v_metadata,\n            COALESCE(v_rec.cuotas, 1), (v_rec.moneda = 'USD')\n        )",
  "        SELECT tc.moneda_iso INTO v_moneda\n        FROM public.p_tarjetas_credito tc\n        WHERE tc.tarjeta_id = v_rec.tarjeta_id\n          AND tc.user_id = v_user_id;\n\n        INSERT INTO public.p_caja (\n            user_id, tipo, tarjeta_id, valor_egreso, valor_ingreso,\n            fecha, es_compartido, estructura_egreso_id, detalle, metadata,\n            cuotas_totales, es_usd, moneda\n        )\n        VALUES (\n            v_user_id, 'expense', v_rec.tarjeta_id, v_rec.monto, 0,\n            v_rec.fecha, false, v_rec.estructura_egreso_id, v_rec.detalle, v_metadata,\n            COALESCE(v_rec.cuotas, 1), (v_moneda = 'USD'), v_moneda\n        )",
  'card_expense'
);

fs.writeFileSync('temp_sql/v2_moneda_fixed.sql', s);
console.log('v2 moneda patch OK, ' + s.length + ' chars');