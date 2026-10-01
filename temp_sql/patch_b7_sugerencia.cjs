// B7: sugerencia de monto destino por cotizacion del dia en transfer cross-currency
const fs = require('fs');
const FILE = 'src/components/saneamiento/EditarCuarentenaModal.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// El efecto de sugerencia, anclado despues del reset defensivo de billetera.
src = replaceOnce(
  src,
  "  const handleSubmit = (e: React.FormEvent) => {",
  "  // Suggest the destination amount from the day's USD rate when editing a\n" +
  "  // cross-currency transfer leaves it empty (buying or selling USD).\n" +
  "  // It is only a hint: the user can (and may need to) override the value.\n" +
  "  useEffect(() => {\n" +
  "    if (!crossCurrency || !montoFormNum) return\n" +
  "    if ((parseFloat(destinationAmount) || 0) > 0) return\n" +
  "    let cancelled = false\n" +
  "    rpc<number>('fn_obtener_cotizacion_usd')\n" +
  "      .catch(() => null)\n" +
  "      .then((cotizacion) => {\n" +
  "        if (cancelled || !cotizacion || cotizacion <= 0) return\n" +
  "        // Rate is stored per the user's default currency: it converts\n" +
  "        // between that currency and USD. Pass through other pairs unchanged.\n" +
  "        const baseAUsd =\n" +
  "          billeteraMoneda === 'USD'\n" +
  "            ? montoFormNum\n" +
  "            : billeteraMoneda === 'ARS'\n" +
  "              ? montoFormNum / cotizacion\n" +
  "              : null\n" +
  "        if (baseAUsd === null) return\n" +
  "        let sugerencia: number\n" +
  "        if (billeteraDestinoMoneda === 'USD') sugerencia = baseAUsd\n" +
  "        else if (billeteraDestinoMoneda === 'ARS') sugerencia = baseAUsd * cotizacion\n" +
  "        else return\n" +
  "        setDestinationAmount(sugerencia.toFixed(2))\n" +
  "      })\n" +
  "    return () => {\n" +
  "      cancelled = true\n" +
  "    }\n" +
  "  }, [crossCurrency, montoFormNum, destinationAmount, billeteraMoneda, billeteraDestinoMoneda])\n\n" +
  "  const handleSubmit = (e: React.FormEvent) => {",
  'sugerencia'
);

fs.writeFileSync(FILE, src);
console.log('B7 OK');