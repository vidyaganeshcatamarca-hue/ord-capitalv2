// Apply pass: reconstruct es.ts corrupted emoji fragments.
// - MULTI candidates: take the first (E2-lead) — verified correct for every case.
// - Ambiguous singletons: explicit hand table (line, run bytes) -> replacement.

const fs = require('fs');
const FILE = 'src/locales/es.ts';

const text = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');
const lines = text.split('\n');

const ALWAYS_SUSPECT = (cp) => cp >= 0x80 && cp <= 0x9F;
const MOJIBAKE_LEADS = new Set([0xF0, 0xEF]);
const ABSORBABLE = (cp) => (cp >= 0xA0 && cp <= 0xBF) || MOJIBAKE_LEADS.has(cp);

function strictDecode(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

function isKnownSymbol(cp) {
  if (cp >= 0x1F000 && cp <= 0x1FAFF) return true;
  if (cp >= 0x2600 && cp <= 0x27BF) return true;
  if (cp >= 0x2000 && cp <= 0x2BFF) return true;
  if (cp === 0xFE0F) return true;
  return false;
}

function decompose(bytes) {
  const parts = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let len = 0;
    if (b === 0xF0) len = 4;
    else if (b === 0xE2 || b === 0xEF) len = 3;
    else if (b >= 0xC2 && b <= 0xDF) len = 2;
    else return null;
    if (i + len > bytes.length) return null;
    const seq = bytes.slice(i, i + len);
    for (let k = 1; k < len; k++) {
      if (seq[k] < 0x80 || seq[k] > 0xBF) return null;
    }
    const dec = strictDecode(seq);
    if (dec === null) return null;
    if (!isKnownSymbol(dec.codePointAt(0))) return null;
    parts.push(dec);
    i += len;
  }
  return parts.join('');
}

function reconstructRun(cps) {
  const bytes = cps.map((c) => c & 0xFF);
  const prefixes = [];
  if (bytes[0] === 0x9F) prefixes.push([0xF0]);
  if (bytes[0] >= 0x80 && bytes[0] <= 0x9E) prefixes.push([0xE2], [0xF0, 0x9F]);
  if (MOJIBAKE_LEADS.has(bytes[0])) prefixes.push([]);
  for (const pre of prefixes) {
    const txt = decompose([...pre, ...bytes]);
    if (txt !== null) return txt;
  }
  return null;
}

// Hand table for ambiguous singletons: line number (1-based) -> replacement.
// Chosen by context after reviewing each case:
const HAND = {
  1094: '\u270F\uFE0F', // saneamiento_editar_titulo -> pencil
  1775: '\u2705',       // budget_zero_base_reached -> check
  1805: '\uD83D\uDEA8', // card_due_critical -> siren
  1938: '\u270F\uFE0F', // cat_rubro_edit_title -> pencil
  1940: '\u270F\uFE0F', // cat_fuente_edit_title -> pencil
  1942: '\u270F\uFE0F', // cat_subcuenta_edit_title -> pencil
  // L833 [8f]: VS16 completing the warning sign from run1 (E2 9A A0 + FE0F)
};

let cambios = 0;
const out = [];
lines.forEach((line, idx) => {
  const ln = idx + 1;
  let result = '';
  let i = 0;
  let touched = false;
  while (i < line.length) {
    const cp = line.codePointAt(i);
    if (ALWAYS_SUSPECT(cp) || MOJIBAKE_LEADS.has(cp)) {
      const run = [cp];
      let j = i + 1;
      while (j < line.length) {
        const c2 = line.codePointAt(j);
        if (ALWAYS_SUSPECT(c2) || MOJIBAKE_LEADS.has(c2) || ABSORBABLE(c2)) { run.push(c2); j++; continue; }
        break;
      }
      let repl = reconstructRun(run);
      if (repl === null && HAND[ln] !== undefined) repl = HAND[ln];
      if (repl === null && ln === 833 && run.length === 1 && run[0] === 0x8F) repl = '\uFE0F';
      if (repl !== null) {
        result += repl;
        cambios++;
        touched = true;
        i = j;
        continue;
      }
      console.error('SIN RECONSTRUCCION L' + ln + ' [' + run.map((c) => c.toString(16)).join(' ') + ']');
      process.exit(1);
    }
    result += line[i];
    i++;
  }
  out.push(result);
  void touched;
});

fs.writeFileSync(FILE, out.join('\n'));
console.log('runs reemplazados: ' + cambios);

// verify: no suspect codepoints remain
const after = fs.readFileSync(FILE, 'utf8');
let residuo = 0;
after.split('\n').forEach((l, i) => {
  for (const ch of l) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x80 && cp <= 0x9F) || cp === 0xF0 || cp === 0xEF) { residuo++; console.log('RESIDUO L' + (i + 1) + ' U+' + cp.toString(16) + ' | ' + l.trim().slice(0, 70)); }
  }
});
console.log('residuo: ' + residuo);