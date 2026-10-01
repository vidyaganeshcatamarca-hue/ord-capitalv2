// console.log del context final justo antes del POST (gated a dev)
const fs = require('fs');
const FILE = 'src/voice/apiClient.ts';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) {
    console.error('ABORT ' + label + ': hay ' + count);
    process.exit(1);
  }
  return haystack.split(needle).join(replacement);
}

src = replaceOnce(
  src,
  'export async function createVoiceJob(input: CreateVoiceJobInput): Promise<VoiceJobCreate> {\n  const { audioBlob, idempotencyKey, language, context, accessToken, signal } = input;',
  'export async function createVoiceJob(input: CreateVoiceJobInput): Promise<VoiceJobCreate> {\n  const { audioBlob, idempotencyKey, language, context, accessToken, signal } = input;\n\n  // Backend-requested diagnostic: the exact final context that goes into the\n  // multipart, logged only in dev builds (npm run dev). Remove once the\n  // categorization matching is validated.\n  if (import.meta.env.DEV) {\n    console.log(\'VOICE_CONTEXT expense_categories\', JSON.stringify(context.expense_categories, null, 2));\n  }',
  'log'
);
fs.writeFileSync(FILE, src);
console.log('log agregado');
