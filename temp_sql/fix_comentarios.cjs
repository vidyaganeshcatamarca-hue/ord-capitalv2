const fs = require('fs');
function replaceOnce(file, needle, replacement, label) {
  let src = fs.readFileSync(file, 'utf8').split('\r\n').join('\n');
  const count = src.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  fs.writeFileSync(file, src.split(needle).join(replacement));
  console.log('OK ' + label);
}

replaceOnce(
  'src/components/voice/VoiceHomeFab.tsx',
  " * `origen` alone is not a valid discriminator: imported bank statements also\n * use `origen = 'api_banco'`. Voice-originated rows are the only ones carrying a\n * non-null `metadata.job_id`, so that field is the discriminator.",
  " * `metadata.job_id` is the discriminator for voice rows. `origen = 'voz'`\n * is authoritative in new data; job_id keeps legacy rows identifiable.",
  'fab-comentario'
);

replaceOnce(
  'src/pages/Saneamiento/SaneamientoPage.tsx',
  " * The dashboard widgets group by `origen`, but voice rows are stored with\n * `origen = 'api_banco'` and are only identifiable through `metadata.job_id`.\n * Normalizing here keeps the widgets dumb and their counts correct.",
  " * The dashboard widgets group by `origen`; voice rows carry\n * `origen = 'voz'` (and `metadata.job_id`). Normalizing here keeps the\n * widgets dumb and their counts correct.",
  'saneamiento-comentario'
);
