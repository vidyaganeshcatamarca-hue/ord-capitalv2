// useVoiceRecorder: la negacion de mic now guia re-habilitar + retryable,
// NotReadableError (mic ocupado) mapeado, y el contexto inseguro/WebView
// (mediaDevices ausente) tiene mensaje propio en vez del generico de codec.
const fs = require('fs');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// 1. el interfaz: retryable
let src = fs.readFileSync('src/voice/useVoiceRecorder.ts', 'utf8').split('\r\n').join('\n');
src = replaceOnce(
  src,
  "export interface VoiceRecorderError {\n  i18nKey: string;\n  detail?: string;\n}",
  "export interface VoiceRecorderError {\n  i18nKey: string;\n  detail?: string;\n  /** True when retrying makes sense (for example the permission was re-enabled from browser settings). */\n  retryable?: boolean;\n}",
  'interfaz'
);

// 2. las clases de error
src = replaceOnce(
  src,
  "const CODEC_UNSUPPORTED_KEY = 'voice.codec_unsupported';\nconst MIC_DENIED_KEY = 'voice.mic_denied';\nconst GENERIC_ERROR_KEY = 'voice_generic_error';",
  "const CODEC_UNSUPPORTED_KEY = 'voice.codec_unsupported';\nconst MIC_DENIED_KEY = 'voice.mic_denied';\nconst MIC_BUSY_KEY = 'voice.mic_busy';\nconst MIC_UNAVAILABLE_KEY = 'voice.mic_unavailable';\nconst GENERIC_ERROR_KEY = 'voice_generic_error';\n\n/** The microphone is locked by another app (or the OS lost the device). */\nconst MIC_BUSY_ERROR_NAMES: readonly string[] = [\n  'NotReadableError',\n  'TrackStartError',\n];",
  'keys'
);

// 3. classify: retryable en denied + busy mapeada
src = replaceOnce(
  src,
  "function classifyMicrophoneError(error: unknown): VoiceRecorderError {\n  const detail = error instanceof Error ? error.message : String(error);\n  if (MIC_DENIED_ERROR_NAMES.includes(errorNameOf(error))) {\n    telemetry.track('voice_mic_denied', { detail }, TELEMETRY_PRIORITY.LOW);\n    return { i18nKey: MIC_DENIED_KEY, detail };\n  }\n  return { i18nKey: GENERIC_ERROR_KEY, detail };\n}",
  "function classifyMicrophoneError(error: unknown): VoiceRecorderError {\n  const detail = error instanceof Error ? error.message : String(error);\n  const name = errorNameOf(error);\n  if (MIC_DENIED_ERROR_NAMES.includes(name)) {\n    telemetry.track('voice_mic_denied', { detail }, TELEMETRY_PRIORITY.LOW);\n    // Retrying matters: the user can re-enable access from browser settings\n    // and come back to this same modal.\n    return { i18nKey: MIC_DENIED_KEY, detail, retryable: true };\n  }\n  if (MIC_BUSY_ERROR_NAMES.includes(name)) {\n    telemetry.track('voice_mic_busy', { detail }, TELEMETRY_PRIORITY.LOW);\n    return { i18nKey: MIC_BUSY_KEY, detail, retryable: true };\n  }\n  return { i18nKey: GENERIC_ERROR_KEY, detail };\n}",
  'classify'
);

// 4. start(): separar context inseguro de codec faltante
src = replaceOnce(
  src,
  "    if (!isBrowserSupported()) {\n      commitState('error');\n      if (mountedRef.current) setError({ i18nKey: CODEC_UNSUPPORTED_KEY });\n      telemetry.track('voice_codec_unsupported', { reason: 'no_media_recorder' }, TELEMETRY_PRIORITY.LOW);\n      return;\n    }",
  "    if (!isBrowserSupported()) {\n      // Insecure contexts (plain http) and embedded browsers expose no\n      // mediaDevices at all: the permission prompt can never appear there,\n      // so these get their own explanation instead of the codec message.\n      const micApiAvailable =\n        typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;\n      if (micApiAvailable) {\n        commitState('error');\n        if (mountedRef.current) setError({ i18nKey: CODEC_UNSUPPORTED_KEY });\n        telemetry.track('voice_codec_unsupported', { reason: 'no_media_recorder' }, TELEMETRY_PRIORITY.LOW);\n      } else {\n        commitState('error');\n        if (mountedRef.current) setError({ i18nKey: MIC_UNAVAILABLE_KEY });\n        telemetry.track('voice_mic_unavailable', { reason: 'no_media_devices' }, TELEMETRY_PRIORITY.LOW);\n      }\n      return;\n    }",
  'start-guard'
);

fs.writeFileSync('src/voice/useVoiceRecorder.ts', src);
console.log('hook OK');

// 5. el modal: retry en la vista de error
let modal = fs.readFileSync('src/components/voice/VoiceRecorderModal.tsx', 'utf8').split('\r\n').join('\n');
modal = replaceOnce(
  modal,
  "          {view === 'error' && error && (\n            <div className=\"voice-recorder-block\">\n              <p className=\"voice-recorder-alert\">{t(error.i18nKey)}</p>\n              <button type=\"button\" className=\"voice-recorder-action\" onClick={handleClose}>\n                {t('voice.close')}\n              </button>\n            </div>\n          )}",
  "          {view === 'error' && error && (\n            <div className=\"voice-recorder-block\">\n              <p className=\"voice-recorder-alert\">{t(error.i18nKey)}</p>\n              {error.retryable && (\n                <button\n                  type=\"button\"\n                  className=\"voice-recorder-action\"\n                  onClick={() => {\n                    void start();\n                  }}\n                >\n                  {t('btn_retry')}\n                </button>\n              )}\n              <button\n                type=\"button\"\n                className={`voice-recorder-action${error.retryable ? ' is-secondary' : ''}`}\n                onClick={handleClose}\n              >\n                {t('voice.close')}\n              </button>\n            </div>\n          )}",
  'modal-error'
);
fs.writeFileSync('src/components/voice/VoiceRecorderModal.tsx', modal);
console.log('modal OK');

// 6. es.ts: mic_denied instructivo + 2 claves nuevas
let es = fs.readFileSync('src/locales/es.ts', 'utf8').split('\r\n').join('\n');
es = replaceOnce(
  es,
  '  mic_denied: "Necesitamos permiso para usar el micrófono.",',
  '  mic_denied: "El navegador bloqueó el micrófono. Tocá el candado o el ícono de información junto a la dirección del sitio, poné Micrófono en Permitir y volvé a intentar. En iPhone (Safari): tocá Aa → Configuración del sitio web → Micrófono.",\n  mic_busy: "El micrófono lo está usando otra aplicación. Cerrala y volvé a intentar.",\n  mic_unavailable: "Acá el navegador no permite usar el micrófono. Si estás dentro de otra app (por ejemplo el visor de un enlace), abrí el sitio con el Chrome o el Safari del teléfono.";',
  'es-mic'
);
fs.writeFileSync('src/locales/es.ts', es);
console.log('es.ts OK');