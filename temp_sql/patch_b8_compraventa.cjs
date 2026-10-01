// B8: detalle=clave i18n en las patas del doble insert + RPC las expone como titulo
const fs = require('fs');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// ── 1. v2: DECLARE + asignacion del detalle semantico + uso en las patas ──
let v2 = fs.readFileSync('funcionesSQL/fn_aprobar_cuarentena_v2.md', 'utf8').split('\r\n').join('\n');

v2 = replaceOnce(
  v2,
  "    v_moneda text;\n    v_moneda_2 text;\n",
  "    v_moneda text;\n    v_moneda_2 text;\n    v_trans_detalle text;\n",
  'declare'
);

v2 = replaceOnce(
  v2,
  "                IF v_rec.destination_amount IS NULL OR v_rec.destination_amount <= 0 THEN\n                    RAISE EXCEPTION '{\"key\": \"error_field_required\", \"params\": {\"field\": \"destination_amount\"}}';\n                END IF;\n\n                INSERT INTO public.p_caja (",
  "                IF v_rec.destination_amount IS NULL OR v_rec.destination_amount <= 0 THEN\n                    RAISE EXCEPTION '{\"key\": \"error_field_required\", \"params\": {\"field\": \"destination_amount\"}}';\n                END IF;\n\n                -- Cross-currency legs have no category: when the user did not\n                -- write a note, each labeled leg carries an i18n key stating\n                -- what the pair really was (buying or selling USD).\n                v_trans_detalle := v_rec.detalle;\n                IF (v_trans_detalle IS NULL OR v_trans_detalle = '') THEN\n                    IF v_moneda_2 = 'USD' AND v_moneda <> 'USD' THEN\n                        v_trans_detalle := 'transfer_compra_dolares';\n                    ELSIF v_moneda = 'USD' AND v_moneda_2 <> 'USD' THEN\n                        v_trans_detalle := 'transfer_venta_dolares';\n                    END IF;\n                END IF;\n\n                INSERT INTO public.p_caja (",
  'asignacion'
);

// las 2 patas usan v_trans_detalle (los VALUES: ... v_rec.detalle, ...)
v2 = replaceOnce(
  v2,
  "                    v_user_id, 'expense', v_rec.billetera_id, v_rec.monto, 0,\n                    v_rec.fecha, v_rec.detalle,\n                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb),",
  "                    v_user_id, 'expense', v_rec.billetera_id, v_rec.monto, 0,\n                    v_rec.fecha, v_trans_detalle,\n                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb),",
  'pata-egreso'
);

v2 = replaceOnce(
  v2,
  "                    v_user_id, 'income', v_rec.billetera_destino_id, v_rec.destination_amount, 0,\n                    v_rec.fecha, v_rec.detalle,\n                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb),",
  "                    v_user_id, 'income', v_rec.billetera_destino_id, v_rec.destination_amount, 0,\n                    v_rec.fecha, v_trans_detalle,\n                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb),",
  'pata-acreditacion'
);

fs.writeFileSync('temp_sql/v2_b8.sql', v2);

// ── 2. RPC: rama de patas antes del ajuste conocido ──
let rpc = fs.readFileSync('funcionesSQL/fn_reporte_movimientos_recientes.md', 'utf8').split('\r\n').join('\n');
rpc = replaceOnce(
  rpc,
  "    CASE\n      WHEN c.detalle = 'adjustment_card_diff' THEN 'cat_card_diff'\n      ELSE COALESCE(e.nombre_cuenta, i.nombre,",
  "    CASE\n      WHEN c.detalle = 'adjustment_card_diff' THEN 'cat_card_diff'\n      -- Transfer legs (double insert) carry no category: their title is the\n      -- semantic i18n key stored by the approval (or the user's own note).\n      WHEN c.metadata->>'transfer_double_insert' = 'true' THEN COALESCE(c.detalle, 'transfer_entre_cuentas')\n      ELSE COALESCE(e.nombre_cuenta, i.nombre,",
  'rpc-ramas'
);

fs.writeFileSync('temp_sql/reporte_b8.sql', rpc);

// ── 3. es.ts: las 3 claves ──
let es = fs.readFileSync('src/locales/es.ts', 'utf8').split('\r\n').join('\n');
es = replaceOnce(
  es,
  '  saneamiento_sin_categoria: "Sin categoría",',
  '  saneamiento_sin_categoria: "Sin categoría",\n  transfer_compra_dolares: "Compra de dólares",\n  transfer_venta_dolares: "Venta de dólares",\n  transfer_entre_cuentas: "Transferencia entre cuentas",',
  'es-keys'
);
fs.writeFileSync('src/locales/es.ts', es);

console.log('B8 files OK');