// Fix: dispatch lee las filas de retorno de fn_cargar (ok=false sin insert = fracaso)
const fs = require('fs');
const FILE = 'src/voice/useVoiceQuarantine.ts';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) {
    console.error('ABORT ' + label + ': se esperaba 1 match, hay ' + count);
    process.exit(1);
  }
  return haystack.split(needle).join(replacement);
}

const OLD = [
  '      try {',
  "        await rpc<VoiceQuarantineLoadRow[]>('fn_cargar_movimientos_voz', {",
  '          p_job_id: jobId,',
  '          p_movements: movements,',
  '        });',
  '        return true;',
  '      } catch (err) {'
].join('\n');

const NEW = [
  '      try {',
  "        const rows = await rpc<VoiceQuarantineLoadRow[]>('fn_cargar_movimientos_voz', {",
  '          p_job_id: jobId,',
  '          p_movements: movements,',
  '        });',
  '        // The RPC succeeds even when every movement was rejected per-movement',
  '        // (ok=false rows: CHECK violations or hard rejections never inserted).',
  '        // A row counts as landed by its pendiente_id, not by ok: invalid-type',
  '        // movements DO insert (parse_error in metadata) with ok=false.',
  '        const result = Array.isArray(rows) ? rows : []',
  '        const landed = result.filter((row) => row && row.pendiente_id != null).length',
  '        if (result.length > 0 && landed === 0) {',
  "          console.warn('voice quarantine load rejected every movement:', result)",
  "          setErrorI18nKey('voice_load_failed');",
  '          return false;',
  '        }',
  '        if (landed < result.length) {',
  "          console.warn('voice quarantine load partial:', { landed, total: result.length, rows: result })",
  '        }',
  '        return true;',
  '      } catch (err) {'
].join('\n');

src = replaceOnce(src, OLD, NEW, 'dispatch rows');
fs.writeFileSync(FILE, src);
console.log('fix aplicado: dispatch ahora lee las filas (landed por pendiente_id)');
