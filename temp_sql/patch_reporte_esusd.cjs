// B1 RPC: fn_reporte_movimientos_recientes devuelve es_usd y moneda = USD cuando es_usd
const fs = require('fs');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

let s = fs.readFileSync('funcionesSQL/fn_reporte_movimientos_recientes.md', 'utf8').split('\r\n').join('\n');

// 1. RETURNS TABLE += es_usd boolean
s = replaceOnce(
  s,
  'padre_id bigint, nombre_rubro_padre text, color_rubro_padre text)',
  'padre_id bigint, nombre_rubro_padre text, color_rubro_padre text, es_usd boolean)',
  'returns'
);

// 2. SELECT: moneda = CASE es_usd + columna es_usd al final
s = replaceOnce(
  s,
  "    c.moneda::text AS moneda,\n",
  "    CASE WHEN c.es_usd THEN 'USD' ELSE c.moneda END::text AS moneda,\n",
  'moneda'
);

// 3. la ultima columna del select (color_rubro_padre) -> agregar c.es_usd
s = replaceOnce(
  s,
  "    p.color::text AS color_rubro_padre\n",
  "    p.color::text AS color_rubro_padre,\n    c.es_usd\n",
  'select-col'
);

fs.writeFileSync('temp_sql/reporte_es_usd.sql', s);
console.log('RPC patch OK, ' + s.length + ' chars');