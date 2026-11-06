// Deploy 74: PIN security backend (feature: pin-huella, T5) — owner-authorized.
// Trial with rollback first, then real deploy, then per-scenario smoke (73b pattern).
// Contract note: fn_verificar_pin RETURNS rows for expected outcomes (a raised
// error rolls the attempt counter back with the transaction — trial 74a);
// exceptions stay for misuse. Each smoke runs BEGIN...ROLLBACK (no real data).
import fs from 'node:fs'
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => {
    const i = l.indexOf('=')
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
  }),
)
const { ACCESS_TOKEN, SUPABASE_URL } = env
const PROJECT = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]
const USER = '5e70854e-8cfa-4b0e-946d-64a055cc29c3' // smoke user; every txn rolls back

const q = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  return { ok: res.ok, json }
}
let fails = 0
const ok = (name, cond, detail) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${name}${detail ? ` → ${detail}` : ''}`)
  if (!cond) fails++
}

const inTx = async (...statements) => q(`BEGIN;\nSELECT set_config('request.jwt.claims', '{"sub":"${USER}","role":"authenticated"}', true);\n${statements.join('\n')}\nROLLBACK;`)

console.log('ensayo (rollback)...')
{
  const ddl = fs.readFileSync('temp_sql/74_pin_backend.sql', 'utf8')
  const { ok: trialOk, json } = await q(`BEGIN;\n${ddl}\nROLLBACK;`)
  ok('ensayo sin error', trialOk, JSON.stringify(json))
}
if (fails) process.exit(1)

console.log('deploy REAL...')
{
  const ddl = fs.readFileSync('temp_sql/74_pin_backend.sql', 'utf8')
  const { ok: realOk, json } = await q(ddl)
  ok('deploy real', realOk, JSON.stringify(json))
  if (!realOk) process.exit(1)
}

// estructura
{
  const { json } = await q(`
    SELECT 'rpc ' || p.proname AS obj FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('fn_tiene_pin','fn_verificar_pin','fn_configurar_pin','fn_reactivar_pin','fn_desactivar_pin')
    UNION ALL
    SELECT 'tabla p_pin_seguridad'::text WHERE to_regclass('public.p_pin_seguridad') IS NOT NULL
    UNION ALL
    SELECT 'idx ' || indexname FROM pg_indexes WHERE schemaname='public' AND tablename='p_pin_seguridad'
    UNION ALL
    SELECT 'rls_enabled' WHERE (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.p_pin_seguridad'::regclass)
    ORDER BY 1`)
  const objs = json.map(r => r.obj).sort()
  const need = ['rpc fn_tiene_pin','rpc fn_verificar_pin','rpc fn_configurar_pin','rpc fn_reactivar_pin','rpc fn_desactivar_pin','tabla p_pin_seguridad','idx idx_p_pin_seguridad_estado','rls_enabled']
  ok('objetos desplegados', need.every(n => objs.includes(n)), JSON.stringify(objs))
}

// smoke 1: alta sin pin previo → activa/0 (columnas, no composite)
{
  const { json } = await inTx(`SELECT fn_configurar_pin('1234');`, `SELECT estado, intentos_fallidos, bloqueado_hasta IS NOT NULL AS ventana FROM public.p_pin_seguridad;`)
  const r = Array.isArray(json) && json.at(-1)
  ok('smoke1 alta → activa/0', r?.estado === 'activa' && r?.intentos_fallidos === 0 && r?.ventana === false, JSON.stringify(json))
}

// smoke 2: desactivar con PIN actual incorrecto (raise, sin efectos)
{
  const { ok: eOk, json } = await inTx(`SELECT fn_configurar_pin('1234');`, `SELECT fn_desactivar_pin('9999');`)
  ok('smoke2 error_pin_actual_incorrecto', !eOk && JSON.stringify(json).includes('error_pin_actual_incorrecto'), JSON.stringify(json))
}

// smoke 3: desactivar con el PIN correcto (misma txn) → sin_pin
{
  const { json } = await inTx(`SELECT fn_configurar_pin('1234');`, `SELECT fn_desactivar_pin('1234');`, `SELECT estado FROM fn_tiene_pin();`)
  ok('smoke3 tras desactivar → sin_pin', Array.isArray(json) && json.at(-1)?.estado === 'sin_pin', JSON.stringify(json))
}

// smoke 4: cambio de PIN con el actual correcto
{
  const { json } = await inTx(`SELECT fn_configurar_pin('1234');`, `SELECT fn_configurar_pin('5678', '1234');`, `SELECT estado FROM fn_tiene_pin();`)
  ok('smoke4 cambio de PIN OK', Array.isArray(json) && json.at(-1)?.estado === 'activa', JSON.stringify(json))
}

// smoke 5: verificar PIN correcto (ok=true) e incorrecto (ok=false + intentos=1)
{
  const a = await inTx(`SELECT fn_configurar_pin('1234');`, `SELECT ok FROM fn_verificar_pin('1234');`)
  ok('smoke5a verificar OK', Array.isArray(a.json) && a.json.at(-1)?.ok === true, JSON.stringify(a.json))
  const b = await inTx(`SELECT fn_configurar_pin('1234');`, `SELECT ok, intentos_fallidos, estado FROM fn_verificar_pin('9999');`)
  const r = Array.isArray(b.json) && b.json.at(-1)
  ok('smoke5b fallo contado', r?.ok === false && r?.intentos_fallidos === 1 && r?.estado === 'activa', JSON.stringify(b.json))
}

// smoke 6: el 9º intento queda en activa (9); el 10º dispara la ventana (S6)
{
  const nove = await inTx(
    `SELECT fn_configurar_pin('1234');`,
    `SELECT count(*) FILTER (WHERE NOT ok) AS fallos, max(intentos_fallidos) AS max_intentos, bool_and(estado='activa') AS todos_activa
       FROM (SELECT (fn_verificar_pin('0000')).* FROM generate_series(1,9)) s;`,
  )
  const n = Array.isArray(nove.json) && nove.json.at(-1)
  ok('smoke6a 9 intentos → activa/9', n?.fallos === 9 && n?.max_intentos === 9 && n?.todos_activa === true, JSON.stringify(nove.json))
  const dec = await inTx(
    `SELECT fn_configurar_pin('1234');`,
    `SELECT (fn_verificar_pin('0000')).* FROM generate_series(1,9);`,
    `SELECT estado, intentos_fallidos, bloqueado_hasta IS NOT NULL AS ventana FROM (SELECT (fn_verificar_pin('0000')).*) s;`,
  )
  const d = Array.isArray(dec.json) && dec.json.at(-1)
  ok('smoke6b 10º → en_cooldown + ventana', d?.estado === 'en_cooldown' && d?.ventana === true, JSON.stringify(dec.json))
}

// smoke 7: reactivar (huella) cancela la ventana activa (S7)
{
  const { json } = await inTx(
    `SELECT fn_configurar_pin('1234');`,
    `UPDATE public.p_pin_seguridad SET estado='en_cooldown', intentos_fallidos=10, bloqueado_hasta = now() + interval '24 hours' WHERE user_id = (SELECT user_id FROM public.usuarios WHERE auth_id = auth.uid());`,
    `SELECT fn_reactivar_pin();`,
    `SELECT estado, intentos_fallidos FROM public.p_pin_seguridad;`,
  )
  const r = Array.isArray(json) && json.at(-1)
  ok('smoke7 reactivar → activa/0', r?.estado === 'activa' && r?.intentos_fallidos === 0, JSON.stringify(json))
}

// smoke 8: ventana vencida se auto-restaura al leer estado (S7)
{
  const { json } = await inTx(
    `SELECT fn_configurar_pin('1234');`,
    `UPDATE public.p_pin_seguridad SET estado='en_cooldown', intentos_fallidos=12, bloqueado_hasta = now() - interval '1 minute' WHERE user_id = (SELECT user_id FROM public.usuarios WHERE auth_id = auth.uid());`,
    `SELECT fn_tiene_pin();`,
    `SELECT (fn_tiene_pin()).estado AS estado, (SELECT pin_hash IS NULL FROM public.p_pin_seguridad) AS sin_hash, (SELECT intentos_fallidos FROM public.p_pin_seguridad) AS intentos;`,
  )
  const post = Array.isArray(json) ? json.at(-1) : undefined
  ok('smoke8 vencida → restaurar sin hash y sin intentos', post?.estado === 'restaurar' && post?.sin_hash === true && post?.intentos === 0, JSON.stringify(json))
}

// smoke 9: formato/debilidad rechazados server-side (raise, sin estados)
{
  const a = await inTx(`SELECT fn_configurar_pin('12ab');`)
  ok('smoke9a formato', !a.ok && JSON.stringify(a.json).includes('error_pin_formato'), JSON.stringify(a.json))
  const b = await inTx(`SELECT fn_configurar_pin('9999');`)
  ok('smoke9b debil', !b.ok && JSON.stringify(b.json).includes('error_pin_debil'), JSON.stringify(b.json))
}

console.log(fails ? `\n${fails} smoke(s) FAIL — revisar antes de continuar` : '\nTODOS los smokes OK')
process.exit(fails ? 1 : 0)