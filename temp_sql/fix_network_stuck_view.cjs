// Fix: NETWORK failure debe mostrar send_error (Reintentar), no spinner infinito
const fs = require('fs');
const FILE = 'src/components/voice/VoiceRecorderModal.tsx';
let src = fs.readFileSync(FILE, 'utf8');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) {
    console.error('ABORT ' + label + ': se esperaba 1 match, hay ' + count);
    process.exit(1);
  }
  return haystack.split(needle).join(replacement);
}

const OLD_BLOCK = [
  '      // A transport drop is not worth a toast: the store already rolled the flow',
  "      // back and the user can simply record again.",
  "      if (activeJob.errorCode === 'NETWORK') return",
  "      showToast(t(mapVoiceErrorToI18nKey(activeJob.errorCode ?? 'UNKNOWN')), 'error')",
  '      setFailedJob(activeJob)'
].join('\n');

const NEW_BLOCK = [
  '      // A transport drop is silent (no toast), but the user still gets the',
  '      // send_error view with Retry / Record again instead of an endless spinner.',
  "      if (activeJob.errorCode === 'NETWORK') {",
  '        setFailedJob(activeJob)',
  '        return',
  '      }',
  "      showToast(t(mapVoiceErrorToI18nKey(activeJob.errorCode ?? 'UNKNOWN')), 'error')",
  '      setFailedJob(activeJob)'
].join('\n');

src = replaceOnce(src, OLD_BLOCK, NEW_BLOCK, 'failed handler NETWORK');
fs.writeFileSync(FILE, src);
console.log('fix aplicado. NETWORK setFailedJob presente:', src.includes("if (activeJob.errorCode === 'NETWORK') {\n        setFailedJob(activeJob)"));
