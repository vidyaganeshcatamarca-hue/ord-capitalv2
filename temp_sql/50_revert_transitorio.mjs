// Revierte el desbloqueo transitorio (38/38b): el frontend nuevo ya deploys en
// produccion y confirma el pais ANTES de crear billeteras, asi que la rama que
// aceptaba la moneda del cliente cuando no hay pais queda como agujero. Vuelve el
// comportamiento WU1: sin pais confirmado => error_region_not_configured.
// Idempotente: si ya no hay rama transitoria, no hace nada.

import fs from 'node:fs'

const readEnv = (k) => (fs.readFileSync('.env.local', 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]
const REF = readEnv('SUPABASE_URL').replace('https://', '').split('.')[0]
const TOKEN = readEnv('ACCESS_TOKEN')
const endpoint = `https://api.supabase.com/v1/projects/${REF}/database/query`

const FNS = ['fn_crear_billetera_inicial', 'fn_crear_billeteras_iniciales', 'fn_crear_billetera']

const REVERTIDO = `    IF v_moneda_local IS NULL THEN
      RAISE EXCEPTION '{"key": "error_region_not_configured", "params": {}}';
    ELSIF v_moneda_final <> 'USD' AND v_moneda_final <> v_moneda_local THEN
      RAISE EXCEPTION '{"key": "error_currency_not_local", "params": {}}';
    END IF;`

async function q(sql) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query: sql }),
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${t.slice(0, 700)}`)
  return t
}

for (const fn of FNS) {
  const rows = JSON.parse(
    await q(`SELECT p.oid::text AS oid, pg_get_functiondef(p.oid) AS def
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname='public' AND p.proname='${fn}' AND p.prokind='f' ORDER BY p.oid;`)
  )
  for (const row of rows) {
    let def = row.def.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const label = `${fn} (oid ${row.oid})`

    // Detecta el bloque transitorio: desde la linea del comentario TRANSITORIO hasta
    // el END IF; que cierra la cadena IF/ELSIF.
    const iTransitorio = def.indexOf('-- TRANSITORIO:')
    if (iTransitorio === -1) {
      console.log(`${label.padEnd(40)} ya sin rama transitoria`)
      continue
    }
    const iIf = def.indexOf('IF v_moneda_local IS NULL THEN', iTransitorio)
    // El bloque tiene un IF interno (validacion de catalogo): el corte va en el END IF
    // EXTERNO, el que sigue al ELSIF del nivel principal.
    const iElsifM = def.slice(iIf).match(/\n\s*ELSIF v_moneda_final/)
    if (!iElsifM) throw new Error(`[${label}] estructura inesperada\n${def.slice(iIf, iIf + 400)}`)
    const iElsif = iIf + iElsifM.index
    const iEnd = def.indexOf('END IF;', iElsif) + 'END IF;'.length
    const bloqueViejo = def.slice(iTransitorio, iEnd)

    // Reemplaza el bloque transitorio completo (comentarios incluidos) por el original.
    def = def.slice(0, iTransitorio) + REVERTIDO + def.slice(iEnd)

    if (/TRANSITORIO/.test(def)) throw new Error(`[${label}]\nquedo texto TRANSITORIO`)
    if (!/error_region_not_configured/.test(def)) throw new Error(`[${label}]\nfalta el raise original`)

    await q(def)
    console.log(`${label.padEnd(40)} REVERTIDO a error_region_not_configured`)
  }
}

console.log('\nVerificacion final:')
const vivos = JSON.parse(
  await q(`SELECT p.proname AS nombre, p.oid::text AS oid,
                  (pg_get_functiondef(p.oid) LIKE '%TRANSITORIO%') AS transitorio,
                  (pg_get_functiondef(p.oid) LIKE '%error_region_not_configured%') AS original
           FROM pg_proc p
           WHERE p.proname IN ('fn_crear_billetera_inicial', 'fn_crear_billeteras_iniciales', 'fn_crear_billetera')
           ORDER BY p.proname, p.oid`)
)
console.log(JSON.stringify(vivos, null, 1))