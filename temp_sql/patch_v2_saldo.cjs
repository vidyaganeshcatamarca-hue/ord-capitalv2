// Parche saldo para las v2 (las que el frontend realmente usa)
// Fuente: temp_sql/v2_defs.txt (dump vivo). Cirugia por marcadores.
const fs = require('fs');
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';

const dump = fs.readFileSync('temp_sql/v2_defs.txt', 'utf8');

function extract(name) {
  const marker = '========== ' + name;
  const i = dump.indexOf(marker);
  if (i < 0) { console.error('ABORT: no ' + name); process.exit(1); }
  const start = dump.indexOf('CREATE OR REPLACE', i);
  const next = dump.indexOf('==========', start + 20);
  return dump.slice(start, next < 0 ? undefined : next).trim().replace(/```$/, '').trim();
}

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

const SALDO_BLOCK = [
  '',
  '        -- Wallet balance rule: the paying wallet must cover the amount. The',
  '        -- row is locked to serialize concurrent approvals spending the same',
  '        -- balance. income receives (no rule) and card_expense pays with',
  '        -- credit (the card, not the wallet, is the constraint).',
  '        SELECT b.saldo_actual, b.nombre',
  '        INTO v_saldo_actual, v_wallet_nombre',
  '        FROM public.p_billeteras b',
  '        WHERE b.billetera_id = v_rec.billetera_id',
  '          AND b.user_id = v_user_id',
  '        FOR UPDATE;',
  '',
  '        IF v_saldo_actual IS NULL THEN',
  "            RAISE EXCEPTION '{\"key\": \"error_wallet_not_found\", \"params\": {}}';",
  '        END IF;',
  '',
  '        IF v_saldo_actual < v_rec.monto THEN',
  "            RAISE EXCEPTION '{\"key\": \"error_wallet_saldo_insuficiente\", \"params\": {\"nombre\": \"%\", \"saldo\": %}}',",
  '                v_wallet_nombre, v_saldo_actual;',
  '        END IF;',
].join('\n');

let single = extract('fn_aprobar_cuarentena_v2');
single = replaceOnce(single, 'DECLARE\n    v_user_id bigint;\n    v_rec RECORD;\n    v_caja_id bigint;\n    v_caja_id_2 bigint;\n    v_metadata jsonb;\n    v_error_message text;', 'DECLARE\n    v_user_id bigint;\n    v_rec RECORD;\n    v_caja_id bigint;\n    v_caja_id_2 bigint;\n    v_metadata jsonb;\n    v_error_message text;\n    v_saldo_actual numeric;\n    v_wallet_nombre text;', 'decl-v2');

// rama expense: el bloque va antes del INSERT (despues del check de monto)
single = replaceOnce(
  single,
  "        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN\n            RAISE EXCEPTION '{\"key\": \"error_invalid_amount\", \"params\": {}}';\n        END IF;\n\n        INSERT INTO public.p_caja (\n            user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,\n            fecha, es_compartido, estructura_egreso_id, detalle, metadata\n        )",
  "        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN\n            RAISE EXCEPTION '{\"key\": \"error_invalid_amount\", \"params\": {}}';\n        END IF;\n" + SALDO_BLOCK + "\n        INSERT INTO public.p_caja (\n            user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,\n            fecha, es_compartido, estructura_egreso_id, detalle, metadata\n        )",
  'rama-expense'
);

// rama transfer: el bloque antes del INSERT (la doble insercion usa la misma billetera)
single = replaceOnce(
  single,
  "        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN\n            RAISE EXCEPTION '{\"key\": \"error_invalid_amount\", \"params\": {}}';\n        END IF;\n\n        BEGIN",
  "        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN\n            RAISE EXCEPTION '{\"key\": \"error_invalid_amount\", \"params\": {}}';\n        END IF;\n" + SALDO_BLOCK + "\n        BEGIN",
  'rama-transfer'
);

let lote = extract('fn_aprobar_cuarentena_lote_v2');
lote = replaceOnce(
  lote,
  "                WHEN v_error_msg LIKE '%error_wallet_not_found%' THEN 'error_wallet_not_found'",
  "                WHEN v_error_msg LIKE '%error_wallet_not_found%' THEN 'error_wallet_not_found'\n                WHEN v_error_msg LIKE '%error_wallet_saldo_insuficiente%' THEN 'error_wallet_saldo_insuficiente'",
  'lote-pattern'
);

fs.writeFileSync('temp_sql/v2_saldo_patched.sql', single + '\n\n' + lote + '\n');
console.log('patched OK');

function q(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: 'api.supabase.com',
        path: '/v1/projects/' + REF + '/database/query',
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.ACCESS_TOKEN,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let out = '';
        res.on('data', (d) => { out += d; });
        res.on('end', () => {
          try { resolve(JSON.parse(out)); } catch (e) { resolve(out); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const stmts = [single, lote];
  for (let i = 0; i < stmts.length; i++) {
    const r = await q(stmts[i]);
    const s = JSON.stringify(r);
    console.log('statement ' + (i + 1) + ' -> ' + (s.length < 150 ? s : s.slice(0, 150)));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });