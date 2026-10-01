// El evento va en el momento VERIFICADO (loadQuarantine ok), no cuando el job completa
const fs = require('fs');

function replaceOnce(file, needle, replacement, label) {
  let src = fs.readFileSync(file, 'utf8').split('\r\n').join('\n');
  const count = src.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  fs.writeFileSync(file, src.split(needle).join(replacement));
  console.log('OK ' + label);
}

// 1. REMOVER el disparo prematuro de useVoiceJobs (revertir el hunk de ca9209b)
replaceOnce(
  'src/voice/useVoiceJobs.ts',
  "          if (movements.length > 0) {\n            telemetry.track('voice_completed', { count: movements.length }, TELEMETRY_PRIORITY.MEDIUM);\n            // Quarantine views (CuarentenaPage, BandejaCuarentena) reload when\n            // rows land: they load once on mount and only refresh on their own\n            // actions, so an external landing would stay invisible.\n            window.dispatchEvent(new CustomEvent('voice-quarantine-landed'));\n          } else {",
  "          if (movements.length > 0) {\n            telemetry.track('voice_completed', { count: movements.length }, TELEMETRY_PRIORITY.MEDIUM);\n          } else {",
  'remover-prematuro'
);

// 2. camino normal: dispatch justo tras el toast de exito (filas ya insertadas)
replaceOnce(
  'src/components/voice/VoiceRecorderModal.tsx',
  "          showToast(t('voice.sent'), 'success')\n          // No auto-close: with the modal closed the guard is a no-op, and if\n          // the user reopened it to record, completion must not close it\n          // mid-recording. Toast + FAB are the notification.",
  "          showToast(t('voice.sent'), 'success')\n          // The rows are in the DB now (loadQuarantine verified): quarantine\n          // views reload so the item shows up without re-navigating.\n          window.dispatchEvent(new CustomEvent('voice-quarantine-landed'))\n          // No auto-close: with the modal closed the guard is a no-op, and if\n          // the user reopened it to record, completion must not close it\n          // mid-recording. Toast + FAB are the notification.",
  'dispatch-normal'
);

// 3. camino retry: idem tras su toast de exito
replaceOnce(
  'src/components/voice/VoiceRecorderModal.tsx',
  "    loadFailedRef.current = null\n    setLoadFailed(false)\n    showToast(t('voice.sent'), 'success')\n    if (open) onCloseRef.current()",
  "    loadFailedRef.current = null\n    setLoadFailed(false)\n    showToast(t('voice.sent'), 'success')\n    window.dispatchEvent(new CustomEvent('voice-quarantine-landed'))\n    if (open) onCloseRef.current()",
  'dispatch-retry'
);
