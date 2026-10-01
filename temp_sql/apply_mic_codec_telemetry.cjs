// Telemetry: voice_mic_denied + voice_codec_unsupported (LOW)
const fs = require('fs');
const FILE = 'src/voice/useVoiceRecorder.ts';
let src = fs.readFileSync(FILE, 'utf8');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) {
    console.error('ABORT ' + label + ': se esperaba 1 match, hay ' + count);
    process.exit(1);
  }
  return haystack.split(needle).join(replacement);
}

// 1) Import de telemetria
src = replaceOnce(
  src,
  "import { MAX_AUDIO_DURATION_MS } from './contract';",
  "import { MAX_AUDIO_DURATION_MS } from './contract';\nimport { telemetry, TELEMETRY_PRIORITY } from '@/lib/telemetry';",
  'import'
);

// 2) mic denied (classifyMicrophoneError)
src = replaceOnce(
  src,
  "  if (MIC_DENIED_ERROR_NAMES.includes(errorNameOf(error))) {\n    return { i18nKey: MIC_DENIED_KEY, detail };\n  }",
  "  if (MIC_DENIED_ERROR_NAMES.includes(errorNameOf(error))) {\n    telemetry.track('voice_mic_denied', { detail }, TELEMETRY_PRIORITY.LOW);\n    return { i18nKey: MIC_DENIED_KEY, detail };\n  }",
  'mic_denied'
);

// 3) codec: sin MediaRecorder
src = replaceOnce(
  src,
  "    if (!isBrowserSupported()) {\n      commitState('error');\n      if (mountedRef.current) setError({ i18nKey: CODEC_UNSUPPORTED_KEY });\n      return;\n    }",
  "    if (!isBrowserSupported()) {\n      commitState('error');\n      if (mountedRef.current) setError({ i18nKey: CODEC_UNSUPPORTED_KEY });\n      telemetry.track('voice_codec_unsupported', { reason: 'no_media_recorder' }, TELEMETRY_PRIORITY.LOW);\n      return;\n    }",
  'codec_no_media_recorder'
);

// 4) codec: sin mime soportado
src = replaceOnce(
  src,
  "    const supportedMime: SupportedMime | null = pickSupportedMime();\n    if (!supportedMime) {\n      commitState('error');\n      if (mountedRef.current) setError({ i18nKey: CODEC_UNSUPPORTED_KEY });\n      return;\n    }",
  "    const supportedMime: SupportedMime | null = pickSupportedMime();\n    if (!supportedMime) {\n      commitState('error');\n      if (mountedRef.current) setError({ i18nKey: CODEC_UNSUPPORTED_KEY });\n      telemetry.track('voice_codec_unsupported', { reason: 'no_supported_mime' }, TELEMETRY_PRIORITY.LOW);\n      return;\n    }",
  'codec_no_supported_mime'
);

fs.writeFileSync(FILE, src);
console.log('4 hunks aplicados. Verificacion:');
console.log('  voice_mic_denied: ' + (src.match(/voice_mic_denied/g) || []).length);
console.log('  voice_codec_unsupported: ' + (src.match(/voice_codec_unsupported/g) || []).length);
console.log('  telemetry import: ' + (src.includes("from '@/lib/telemetry'")));
