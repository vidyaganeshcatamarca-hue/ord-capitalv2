// Repair engine v3: sequential decomposition with full-consume validation.
// A suspect run (C1 chars + absorbable Latin-1-range chars + mojibake leads)
// is re-mapped to raw bytes and must decompose ENTIRELY into valid sequences
// whose codepoints fall in known emoji/symbol ranges. Ambiguous or failing
// runs are reported for hand mapping.

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
  if (cp >= 0x1F000 && cp <= 0x1FAFF) return true; // emoji
  if (cp >= 0x2600 && cp <= 0x27BF) return true;   // misc symbols + dingbats
  if (cp >= 0x2000 && cp <= 0x2BFF) return true;   // general punctuation + symbols
  if (cp === 0xFE0F) return true;                  // VS16
  return false;
}

// Sequentially decompose bytes into valid UTF-8 sequences; every decoded cp
// must be a known symbol. Returns text or null.
function decompose(bytes) {
  const parts = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let len = 0;
    if (b === 0xF0) len = 4;
    else if (b === 0xE2) len = 3;
    else if (b === 0xEF) len = 3;
    else if (b >= 0xC2 && b <= 0xDF) len = 2;
    else return null;
    if (i + len > bytes.length) return null;
    const seq = bytes.slice(i, i + len);
    // continuation bytes must be valid
    for (let k = 1; k < len; k++) {
      if (seq[k] < 0x80 || seq[k] > 0xBF) return null;
    }
    const dec = strictDecode(seq);
    if (dec === null) return null;
    const cp = dec.codePointAt(0);
    if (!isKnownSymbol(cp)) return null;
    parts.push(dec);
    i += len;
  }
  return parts.join('');
}

// Attempt full reconstruction of a run with lead-byte prepends.
function reconstructRun(cps) {
  const bytes = cps.map((c) => c & 0xFF);
  const prefixes = [];
  if (bytes[0] === 0x9F) prefixes.push([0xF0]);
  if (bytes[0] >= 0x80 && bytes[0] <= 0x9E) prefixes.push([0xE2], [0xF0, 0x9F]);
  if (MOJIBAKE_LEADS.has(bytes[0])) prefixes.push([]);
  const results = [];
  for (const pre of prefixes) {
    const txt = decompose([...pre, ...bytes]);
    if (txt !== null) results.push({ text: txt, lead: pre.map((b) => b.toString(16)).join(' ') });
  }
  // single-byte runs: try completing a 3-byte or 4-byte sequence around it
  if (results.length === 0 && bytes.length === 1) {
    const b0 = bytes[0];
    for (let x = 0x80; x <= 0xBF; x++) {
      const t3 = decompose([0xE2, x, b0]);
      if (t3 !== null) results.push({ text: t3, lead: 'e2 ' + x.toString(16) });
      const t4 = decompose([0xF0, 0x9F, x, b0]);
      if (t4 !== null) results.push({ text: t4, lead: 'f0 9f ' + x.toString(16) });
      const t4b = decompose([0xF0, x, 0x80 | ((x >> 6) & 3), b0]);
      void t4b;
    }
  }
  if (results.length === 0) return null;
  const unique = [...new Set(results.map((r) => r.text))];
  if (unique.length === 1) return { text: unique[0], lead: results[0].lead };
  return { text: unique, lead: 'MULTI' };
}

function scanLine(line) {
  const findings = [];
  let i = 0;
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
      findings.push({ start: i, end: j, cps: run, rec: reconstructRun(run) });
      i = j;
    } else {
      i++;
    }
  }
  return findings;
}

console.log('=== PASS A v3: runs y reconstruccion ===');
let reconstruidos = 0, fallidos = 0, multi = 0;
lines.forEach((line, idx) => {
  const findings = scanLine(line);
  if (!findings.length) return;
  findings.forEach((f) => {
    if (!f.rec) { fallidos++; console.log('L' + (idx + 1) + ' FALLA [' + f.cps.map((c) => c.toString(16)).join(' ') + '] | ' + line.trim().slice(0, 85)); }
    else if (Array.isArray(f.rec.text)) { multi++; console.log('L' + (idx + 1) + ' MULTI [' + f.cps.map((c) => c.toString(16)).join(' ') + '] -> ' + JSON.stringify(f.rec.text) + ' | ' + line.trim().slice(0, 75)); }
    else { reconstruidos++; console.log('L' + (idx + 1) + ' OK [' + f.cps.map((c) => c.toString(16)).join(' ') + '] -> ' + JSON.stringify(f.rec.text) + ' | ' + line.trim().slice(0, 75)); }
  });
});
console.log('reconstruidos OK: ' + reconstruidos + ' | multi: ' + multi + ' | fallidos: ' + fallidos);