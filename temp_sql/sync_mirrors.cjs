// Sincroniza los 2 espejos: el espejo ES el SQL puro (def viva parcheada)
const fs = require('fs');

const patched = fs.readFileSync('temp_sql/aprobar_saldo_patched.sql', 'utf8');
const stmts = patched.split(/\n\n(?=CREATE OR REPLACE)/).filter(Boolean);
const single = stmts[0].replace(/\r\n/g, '\n').trim() + '\n';
const lote = stmts[1].replace(/\r\n/g, '\n').trim() + '\n';

function check(def, markers, label) {
  markers.forEach((mk) => { if (!def.includes(mk)) { console.error('ABORT ' + label + ': marcador ausente ' + mk); process.exit(1); } });
}

check(single, ['v_saldo_actual', 'error_wallet_saldo_insuficiente', "'procesado'"], 'single');
check(lote, ['v_saldo_actual', 'error_wallet_saldo_insuficiente', "'procesado'"], 'lote');

fs.writeFileSync('funcionesSQL/fn_aprobar_cuarentena.md', single);
fs.writeFileSync('funcionesSQL/fn_aprobar_gastos_cuarentena_lote.md', lote);
console.log('espejos OK');
