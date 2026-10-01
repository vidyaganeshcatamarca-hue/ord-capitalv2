// Fix: el Bridge debe sobrevivir al cierre (normalizando CRLF)
const fs = require('fs');
const FILE = 'src/App.tsx';
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
  '      {isVoiceRecorderOpen && (',
  '        <Suspense fallback={null}>',
  '          <VoiceRecorderModal open onClose={() => setIsVoiceRecorderOpen(false)} />',
  '        </Suspense>',
  '      )}'
].join('\n');

const NEW = [
  '      {/* Always mounted: the component arms itself on first open and keeps',
  '       * the job bridge (polling + outcome toasts + quarantine hand-off) alive',
  '       * after the early close. A conditional render would unmount the bridge',
  '       * with the modal and orphan in-flight jobs. */}',
  '      <Suspense fallback={null}>',
  '        <VoiceRecorderModal open={isVoiceRecorderOpen} onClose={() => setIsVoiceRecorderOpen(false)} />',
  '      </Suspense>'
].join('\n');

src = replaceOnce(src, OLD, NEW, 'render del modal');
fs.writeFileSync(FILE, src);
console.log('App.tsx: render siempre + open real');
console.log('ya no hay render condicional:', !src.includes('{isVoiceRecorderOpen && ('));
