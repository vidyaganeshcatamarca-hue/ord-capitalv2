// Parche: regla de saldo en fn_aprobar_cuarentena + fn_aprobar_gastos_cuarentena_lote
// Estrategia: partir de las defs vivas (dump) e insertar el bloque de validacion
// por marcadores, para no reescribir a mano y no divergir de lo vivo.
const fs = require('fs');
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';

const dump = fs.readFileSync('temp_sql/aprobar_defs.txt', 'utf8');
const parts = dump.split(/^========== /m).filter((p) => p.includes('CREATE OR REPLACE'));

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

const VALIDATION_SINGLE = [
  '',
  '    -- Wallet integrity: the paying wallet must exist, belong to the user',
  '    -- and cover the amount. The row is locked to serialize concurrent',
  '    -- approvals spending the same balance.',
  '    IF v_rec.billetera_id IS NULL THEN',
  "        RAISE EXCEPTION '{\"key\": \"error_quarantine_no_wallet\", \"params\": {}}';",
  '    END IF;',
  '',
  '    SELECT b.saldo_actual, b.nombre',
  '    INTO v_saldo_actual, v_wallet_nombre',
  '    FROM public.p_billeteras b',
  '    WHERE b.billetera_id = v_rec.billetera_id',
  '      AND b.user_id = v_user_id',
  '    FOR UPDATE;',
  '',
  '    IF v_saldo_actual IS NULL THEN',
  "        RAISE EXCEPTION '{\"key\": \"error_wallet_not_found\", \"params\": {}}';",
  '    END IF;',
  '',
  '    IF v_saldo_actual < v_rec.monto THEN',
  "        RAISE EXCEPTION '{\"key\": \"error_wallet_saldo_insuficiente\", \"params\": {\"nombre\": \"%\", \"saldo\": %}}',",
  '            v_wallet_nombre, v_saldo_actual;',
  '    END IF;',
  '',
].join('\n');

const VALIDATION_LOOP = VALIDATION_SINGLE
  .split('\n')
  .map((l) => (l === '' ? '' : '    ' + l.replace(/^    /, '')))
  .join('\n')
  .replace(/v_rec\./g, 'r_item.');

let single = parts.find((p) => p.startsWith('fn_aprobar_cuarentena'));
let lote = parts.find((p) => p.startsWith('fn_aprobar_gastos_cuarentena_lote'));
if (!single || !lote) { console.error('ABORT: faltan partes del dump'); process.exit(1); }

single = single.slice(single.indexOf('CREATE OR REPLACE'));
single = single.replace(/\n```.*$/s, '');
lote = lote.slice(lote.indexOf('CREATE OR REPLACE'));
lote = lote.replace(/\n```.*$/s, '');

single = replaceOnce(single, 'DECLARE\n    v_user_id bigint;\n    v_rec RECORD;\n    v_caja_id bigint;\n    v_metadata jsonb;', 'DECLARE\n    v_user_id bigint;\n    v_rec RECORD;\n    v_caja_id bigint;\n    v_metadata jsonb;\n    v_saldo_actual numeric;\n    v_wallet_nombre text;', 'decl-single');
lote = replaceOnce(lote, 'DECLARE\n    v_user_id bigint;\n    r_item RECORD;\n    v_metadata jsonb;', 'DECLARE\n    v_user_id bigint;\n    r_item RECORD;\n    v_metadata jsonb;\n    v_saldo_actual numeric;\n    v_wallet_nombre text;', 'decl-lote');

single = replaceOnce(single, '    INSERT INTO public.p_caja (', VALIDATION_SINGLE + '    INSERT INTO public.p_caja (', 'ins-single');
lote = replaceOnce(lote, '        INSERT INTO p_caja (', VALIDATION_LOOP + '        INSERT INTO p_caja (', 'ins-lote');

fs.writeFileSync('temp_sql/aprobar_saldo_patched.sql', single + '\n\n' + lote + '\n');
console.log('patched OK');

function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const stmts = [single, lote];
  for (let i = 0; i < stmts.length; i++) {
    const r = await q(stmts[i]);
    const s = JSON.stringify(r);
    console.log('statement ' + (i + 1) + ' -> ' + (s.length < 200 ? s : s.slice(0, 200)));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
