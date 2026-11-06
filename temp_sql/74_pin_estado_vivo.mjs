// 74: read-only recon for the PIN backend (T5 of pin-huella).
// Checks: ACCESS_TOKEN works, pgcrypto available, target table free,
// usuarios/auth_id mapping, usuarios.id type.
import fs from 'node:fs'
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => {
    const i = l.indexOf('=')
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
  }),
)
const { ACCESS_TOKEN, SUPABASE_URL } = env
const PROJECT = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]
const q = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json))
  return json
}
console.log('pgcrypto:', JSON.stringify(await q("SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','supabase_vault')")))
console.log('tabla libre:', JSON.stringify(await q("SELECT to_regclass('public.p_pin_seguridad')")))
console.log('rpc libres:', JSON.stringify(await q("SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('fn_tiene_pin','fn_verificar_pin','fn_configurar_pin','fn_reactivar_pin')")))
console.log('usuarios cols:', JSON.stringify(await q("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name IN ('user_id','auth_id')")))
console.log('pares fn_verificar existentes style:', JSON.stringify(await q("SELECT pg_get_userbyid(p.proowner) owner, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_obtener_modo_app'")))
