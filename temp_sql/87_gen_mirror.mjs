// Escribe el espejo funcionesSQL/fn_obtener_modo_app.md con la def EXACTA viva.
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m=l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]]=m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const r = await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:`select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_obtener_modo_app'`})})
const j = await r.json(); if(!r.ok) throw new Error(JSON.stringify(j).slice(0,600))
const def = j[0].def.split('\r\n').join('\n').replace(/\n+$/,'\n')

const head = `# fn_obtener_modo_app

## Descripcion
Devuelve el modo de experiencia (simple/avanzado) y la lista de features del usuario. Definicion extraida real desde Supabase con pg_get_functiondef (byte-exacto con produccion).

- Identidad con auth.uid() (regla del proyecto, SECURITY DEFINER).
- Global switch modo_avanzado_habilitado (app_global_config, clave/valor): si false -> todos 'simple' salvo testing.
- Testing (rev.5): modo_avanzado_testing + lista modo_avanzado_testing_users -> el usuario de testing recibe la CAPACIDAD de cambiar (avanzado_disponible=true); no se fuerza el modo. El parse de la lista hace strip de TODO whitespace con regexp_replace.
- Feature flags con modo_minimo: 'simple' siempre; 'avanzado' solo si el modo efectivo es avanzado; 'intermedio' con pref_key (nivel sin uso practico hoy).
- REV.4 (2026-10-01, anti-abuso): filtro NOT EXISTS contra app_usuario_bloqueos (usuario_id, feature_key, activo, hasta) — prioridad bloqueo > preferencia > modo.
- REV.6 (2026-10-23, modo testing por feature, autorizado): app_feature_flags.activo_testing (boolean NOT NULL DEFAULT **true**) REEMPLAZA a activo para los usuarios de la allowlist de testing. Se puede prender una feature solo para testing (activo=false, activo_testing=true) y apagarle a los testers algo que produccion ya tiene (activo=true, activo_testing=false). El resto de los usuarios no cambia: sigue leyendo activo. Semilla unica del deploy: activo_testing = activo en las 21 filas, marcada en app_global_config.ff_testing_seed_aplicada para que un re-run nunca pise las ediciones del dueño (dia 1 sin cambios; set real del tester verificado identico: 16 features; el default true hace que una fila NUEVA nazca visible para testing). Test transaccional 12/12 PASS (tests/sql/run_modo_testing_flag_test.js, BEGIN/ROLLBACK, sin residuos).

## Codigo SQL (definicion deployada rev.6)
`
fs.mkdirSync('funcionesSQL', { recursive: true })
fs.writeFileSync('funcionesSQL/fn_obtener_modo_app.md', head + def)
console.log('OK funcionesSQL/fn_obtener_modo_app.md')
