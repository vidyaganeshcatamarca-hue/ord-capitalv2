// Corre un .sql de tests/sql/ contra el proyecto real.
//   node tests/sql/run_etapa1_integridad.js [archivo.sql] [--modo base_cero|libertad] [--usuario N]
//
// Cuentas autorizadas: base_cero -> 1 · libertad -> 198. `--usuario` las pisa.
//
// La cuenta de prueba NO se elige sola. Antes, cada prueba hacia
// `ORDER BY user_id LIMIT 1` y terminaba escribiendo sobre la cuenta del duenio. Ahora
// el id se pasa explicito (o se usa el designado: el 20) y el archivo lo recibe en el
// marcador {{USUARIO}}. Si la cuenta no existe o no esta en el modo que la prueba
// necesita, la prueba lo dice en vez de adivinar.
//
// La prueba corre en una transaccion que termina en RAISE EXCEPTION: el error es el
// resultado, no un fallo. La sentencia esperada viene en el mensaje, como JSON.
// Sale con codigo 1 si algun caso falla, para que sirva en un pipeline.
import fs from 'node:fs'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '..', '..')
const env = {}
for (const linea of fs.readFileSync(path.join(raiz, '.env.local'), 'utf-8').split('\n')) {
  const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const token = env.ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN
if (!url || !token) {
  console.error('faltan SUPABASE_URL o ACCESS_TOKEN')
  process.exit(1)
}
const ref = url.replace(/^https?:\/\//, '').split('.')[0]

// Cuentas autorizadas por el duenio (19/11), por modo. No se elige ninguna sola.
const CUENTAS_AUTORIZADAS = { base_cero: 1, libertad: 198 }
const args = process.argv.slice(2)
const iUsuario = args.indexOf('--usuario')
const iModo = args.indexOf('--modo')
let usuario
if (iUsuario >= 0) {
  usuario = Number(args[iUsuario + 1])
} else if (iModo >= 0) {
  usuario = CUENTAS_AUTORIZADAS[args[iModo + 1]]
  if (!usuario) {
    console.error(`--modo acepta: ${Object.keys(CUENTAS_AUTORIZADAS).join(' | ')}`)
    process.exit(1)
  }
} else {
  usuario = CUENTAS_AUTORIZADAS.base_cero
}
if (!Number.isInteger(usuario) || usuario <= 0) {
  console.error('la cuenta tiene que ser un id numerico')
  process.exit(1)
}
console.log(`cuenta de prueba: ${usuario}`)
const archivoSql = args.find((a) => a.endsWith('.sql')) || 'etapa1_integridad.sql'
const sql = fs
  .readFileSync(path.join(raiz, 'tests', 'sql', archivoSql), 'utf-8')
  .replaceAll('{{USUARIO}}', String(usuario))
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const texto = await r.text()

const m = texto.match(/RESULTADO (\[[\s\S]*?\])/)
if (!m) {
  console.error('no se pudo leer el resultado')
  console.error(texto.slice(0, 1200))
  process.exit(1)
}

const casos = JSON.parse(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'))
for (const c of casos) {
  const marca = c.ok ? 'PASS' : 'FALLA'
  const detalle = Object.entries(c)
    .filter(([k]) => !['caso', 'ok'].includes(k))
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ')
  console.log(`${marca.padEnd(6)}${String(c.caso).padEnd(28)}${detalle}`)
}

const fallas = casos.filter(c => !c.ok).length
console.log(`\n${casos.length - fallas}/${casos.length} casos · ${fallas ? 'HAY FALLAS' : 'todo verde'}`)
process.exitCode = fallas ? 1 : 0
