// Evento voice-quarantine-landed: el Bridge avisa, las 2 vistas de cuarentena refetch
const fs = require('fs');

function replaceOnce(file, needle, replacement, label) {
  let src = fs.readFileSync(file, 'utf8').split('\r\n').join('\n');
  const count = src.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  fs.writeFileSync(file, src.split(needle).join(replacement));
  console.log('OK ' + label);
}

// 1. useVoiceJobs: al completar con movimientos, avisar a las vistas de cuarentena
replaceOnce(
  'src/voice/useVoiceJobs.ts',
  "          if (movements.length > 0) {\n            telemetry.track('voice_completed', { count: movements.length }, TELEMETRY_PRIORITY.MEDIUM);\n          } else {",
  "          if (movements.length > 0) {\n            telemetry.track('voice_completed', { count: movements.length }, TELEMETRY_PRIORITY.MEDIUM);\n            // Quarantine views (CuarentenaPage, BandejaCuarentena) reload when\n            // rows land: they load once on mount and only refresh on their own\n            // actions, so an external landing would stay invisible.\n            window.dispatchEvent(new CustomEvent('voice-quarantine-landed'));\n          } else {",
  'evento'
);

// 2. CuarentenaPage: escuchar y refetch
replaceOnce(
  'src/pages/Cuarentena/CuarentenaPage.tsx',
  "  useEffect(() => {\n    fetchData()\n  }, [fetchData])",
  "  useEffect(() => {\n    fetchData()\n    // A voice job landing in the quarantine refreshes the list without\n    // requiring the user to leave and come back.\n    const onVoiceLanded = () => fetchData()\n    window.addEventListener('voice-quarantine-landed', onVoiceLanded)\n    return () => window.removeEventListener('voice-quarantine-landed', onVoiceLanded)\n  }, [fetchData])",
  'listener-cuarentena'
);

// 3. BandejaCuarentena: idem
replaceOnce(
  'src/components/saneamiento/BandejaCuarentena.tsx',
  "  useEffect(() => {\n    fetchItems()\n  }, [fetchItems])",
  "  useEffect(() => {\n    fetchItems()\n    // A voice job landing in the quarantine refreshes the tray.\n    const onVoiceLanded = () => fetchItems()\n    window.addEventListener('voice-quarantine-landed', onVoiceLanded)\n    return () => window.removeEventListener('voice-quarantine-landed', onVoiceLanded)\n  }, [fetchItems])",
  'listener-bandeja'
);
