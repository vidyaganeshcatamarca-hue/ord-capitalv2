// Debug del extract del patch (mismo codigo que patch_v2_saldo.cjs)
const fs = require('fs');
const dump = fs.readFileSync('temp_sql/v2_defs.txt', 'utf8');

function extract(name) {
  const marker = '========== ' + name;
  const i = dump.indexOf(marker);
  if (i < 0) return 'NO MARKER';
  const start = dump.indexOf('CREATE OR REPLACE', i);
  const next = dump.indexOf('==========', i + 10);
  return dump.slice(start, next < 0 ? undefined : next).trim().trim();
}

const def = extract('fn_aprobar_cuarentena_v2');
console.log('def length:', def.length);
console.log('primeros 200:', JSON.stringify(def.slice(0, 200)));
const needle = 'DECLARE\n    v_user_id bigint;\n    v_rec RECORD;\n    v_caja_id bigint;\n    v_caja_id_2 bigint;\n    v_metadata jsonb;\n    v_error_message text;';
console.log('needle count:', def.split(needle).length - 1);