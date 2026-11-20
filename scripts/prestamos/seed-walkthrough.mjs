/**
 * Creates a disposable walkthrough account and the minimum rows the calendar needs
 * from the other modules. Nothing here touches an existing user's data.
 *
 * Idempotent: re-running reuses the same auth user and does not duplicate the seed.
 *
 * Usage: node scripts/prestamos/seed-walkthrough.mjs [--cleanup]
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EMAIL = 'walkthrough-prestamos@ordcapital.test'
const PASSWORD = 'Prestamos2026!'
const LOGIN = 'walkthrough_prestamos'

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[trimmed.slice(0, eq).trim()] = value
  }
  return env
}

const env = loadEnv()
const supaUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const secret = env.SUPABASE_SECRET_KEY
const token = env.ACCESS_TOKEN
if (!supaUrl || !secret) throw new Error('Falta SUPABASE_URL o SUPABASE_SECRET_KEY.')
const ref = supaUrl.match(/https?:\/\/([a-z0-9]+)\./i)?.[1]
if (!ref || !token) throw new Error('No se pudo derivar el project ref o falta ACCESS_TOKEN.')

const authHeaders = { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }

async function findAuthUser() {
  const res = await fetch(`${supaUrl}/auth/v1/admin/users?page=1&per_page=200`, { headers: authHeaders })
  if (!res.ok) throw new Error(`list users ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  return (body.users || []).find((u) => u.email === EMAIL) || null
}

async function createAuthUser() {
  const res = await fetch(`${supaUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`create user ${res.status}: ${text.slice(0, 400)}`)
  return JSON.parse(text)
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`sql ${res.status}: ${text.slice(0, 600)}`)
  return text
}

const cleanup = process.argv.includes('--cleanup')
const existing = await findAuthUser()

if (cleanup) {
  if (!existing) {
    console.log('nada que limpiar: la cuenta no existe')
    process.exit(0)
  }
  await sql(`DELETE FROM public.usuarios WHERE auth_id = '${existing.id}'::uuid;`)
  const res = await fetch(`${supaUrl}/auth/v1/admin/users/${existing.id}`, { method: 'DELETE', headers: authHeaders })
  console.log(`limpieza: usuarios borrado, auth ${res.ok ? 'borrado' : 'fallo ' + res.status}`)
  process.exit(0)
}

const authUser = existing || (await createAuthUser())
console.log(`auth: ${authUser.id} (${existing ? 'reusado' : 'creado'})`)

const seed = `
DO $$
DECLARE
    v_uid bigint;
    v_auth uuid := '${authUser.id}'::uuid;
BEGIN
    INSERT INTO public.usuarios (nombre, login, password, auth_id, creado_at, modo_app)
    VALUES ('Pruebas Préstamos', '${LOGIN}', 'x', v_auth, now() - interval '60 days', 'avanzado')
    ON CONFLICT (auth_id) DO UPDATE
       SET nombre = EXCLUDED.nombre,
           login = EXCLUDED.login,
           creado_at = EXCLUDED.creado_at,
           modo_app = EXCLUDED.modo_app
    RETURNING user_id INTO v_uid;

    IF NOT EXISTS (SELECT 1 FROM public.p_billeteras WHERE user_id = v_uid) THEN
        INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual) VALUES
            (v_uid, 'Efectivo prueba', 'ARS', 150000),
            (v_uid, 'Dólares prueba', 'USD', 800);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.p_tarjetas_credito WHERE user_id = v_uid) THEN
        INSERT INTO public.p_tarjetas_credito
            (user_id, nombre_tarjeta, dia_cierre, dia_vencimiento, moneda_iso, banco)
        VALUES (v_uid, 'Tarjeta prueba', 5, 15, 'ARS', 'Banco prueba');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.p_gastos_recurrentes WHERE user_id = v_uid) THEN
        INSERT INTO public.p_gastos_recurrentes
            (user_id, nombre_custom, monto_base, dia_del_mes, frecuencia, activo, modo)
        VALUES (v_uid, 'Alquiler prueba', 50000, 10, 'mensual', true, 'simple');
    END IF;

    RAISE NOTICE 'seed user_id=%', v_uid;
END $$;

SELECT user_id, nombre, modo_app, (now()::date - creado_at::date) AS dias
FROM public.usuarios WHERE auth_id = '${authUser.id}'::uuid;
`

console.log(await sql(seed))
console.log(`login: ${EMAIL} / ${PASSWORD}`)
