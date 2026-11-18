// Corre tests/sql/etapa1_integridad.sql contra el proyecto real.
//   node tests/sql/run_etapa1_integridad.js
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

const sql = fs.readFileSync(path.join(raiz, 'tests', 'sql', 'etapa1_integridad.sql'), 'utf-8')
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
