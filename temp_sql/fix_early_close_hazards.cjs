// 2 correcciones sobre el cierre temprano
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

// 1) empty_result: sin auto-cierre (riesgo HIGH: rip mid-recording)
src = replaceOnce(
  src,
  "        if (movements.length === 0) {\n          showToast(t('voice.empty_result'), 'info')\n          if (open) onCloseRef.current()\n          continue\n        }",
  "        if (movements.length === 0) {\n          // The modal is usually already closed by now (early close on accept);\n          // if the user reopened it to record a new note, a completion must not\n          // rip it away mid-recording. The toast is the whole notification.\n          showToast(t('voice.empty_result'), 'info')\n          continue\n        }",
  'empty_result close'
);

// 2) success: sin auto-cierre (mismo riesgo)
src = replaceOnce(
  src,
  "          showToast(t('voice.sent'), 'success')\n          if (open) onCloseRef.current()\n        })()",
  "          showToast(t('voice.sent'), 'success')\n          // No auto-close: with the modal closed the guard is a no-op, and if\n          // the user reopened it to record, completion must not close it\n          // mid-recording. Toast + FAB are the notification.\n        })()",
  'success close'
);

// 3) NETWORK con modal cerrado: toast (si no, el usuario cree que sigue procesando)
src = replaceOnce(
  src,
  "        } else if (errorCode !== 'NETWORK') {\n          // A transport drop is silent (no toast): the modal state below is the\n          // only feedback, and it is not shown while the modal is closed.\n          showToast(t(mapVoiceErrorToI18nKey(errorCode)), 'error')\n        }",
  "        } else if (errorCode !== 'NETWORK') {\n          showToast(t(mapVoiceErrorToI18nKey(errorCode)), 'error')\n        } else if (!open) {\n          // Transport drop with the modal closed would otherwise be invisible:\n          // the user believes the audio is still processing. With the modal\n          // open it stays silent on purpose (the send_error view is the feedback).\n          showToast(t(mapVoiceErrorToI18nKey(errorCode)), 'error')\n        }",
  'network closed toast'
);

fs.writeFileSync(FILE, src);
console.log('3 correcciones aplicadas');
console.log('onCloseRef en sweep restante:', (src.match(/if \(open\) onCloseRef\.current\(\)/g) || []).length);
