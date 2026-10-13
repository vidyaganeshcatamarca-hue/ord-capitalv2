// Rotacion de CRON_SECRET (H5): genera un secreto, lo setea como env de la Edge
// Function y actualiza el comando de cron.job(1) en una sola corrida. Nunca imprime
// el secreto: solo estados de verificacion.
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'

const readEnv = (k) => (fs.readFileSync('.env.local', 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]
const REF = readEnv('SUPABASE_URL').replace('https://', '').split('.')[0]
const TOKEN = readEnv('ACCESS_TOKEN')

const nuevo = randomBytes(24).toString('hex')

const runSql = (query) =>
  fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  }).then((r) => r.json())

// 1. Setear el secreto nuevo en la Edge Function (CLI, con el token por env).
const { execSync } = await import('node:child_process')
execSync(`npx supabase secrets set CRON_SECRET=${nuevo} --project-ref ${REF}`, {
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: TOKEN },
  stdio: ['ignore', 'pipe', 'pipe'],
})

// 2. Apuntar el cron al secreto nuevo via cron.alter_job (UPDATE directo a cron.job
// da permission denied: la tabla es de la extension).
console.log('alter_job:', JSON.stringify(
  await runSql(
    `SELECT cron.alter_job(1, command := replace((SELECT command FROM cron.job WHERE jobid=1), 'Bearer Amipanda.2026', 'Bearer ${nuevo}'))`
  )
))

// 3. Verificacion sin exponer el secreto.
console.log('verificacion:', JSON.stringify(
  await runSql(
    `select case when command like '%Amipanda.2026%' then 'VIEJO_PRESENTE' else 'VIEJO_ELIMINADO' end as estado, length(command) as len from cron.job where jobid=1`
  )
))