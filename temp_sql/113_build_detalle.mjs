import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())

const [row] = await q(`select pg_get_functiondef(oid) as d from pg_proc
                        where proname='fn_reporte_detalle_inversion' and pronamespace='public'::regnamespace`)
let def = row.d
if (def.includes("'billetera_origen_id'")) { console.log('ya estaba'); process.exit(0) }
const ancla = "'monto_liquidado', v_liquidado,"
if (!def.includes(ancla)) { console.log('✗ no encontré el ancla'); process.exit(1) }
def = def.replace(ancla, ancla + "\n        'billetera_origen_id', v_inversion.billetera_origen_id,")

const cabecera = `-- 113 — fn_reporte_detalle_inversion expone billetera_origen_id
--
-- El detalle necesita saber si la posición se cargó como preexistente (sin
-- billetera) para ofrecer "Eliminar" solo donde fn_eliminar_inversion puede
-- funcionar: una posición con billetera tiene movimientos y se borra desde
-- Historial, que revierte cada operación (migración 105).
--
-- La función devuelve jsonb, así que agregar una clave es un cambio de cuerpo:
-- no hay DROP ni cambio de firma. El resto del cuerpo es el vigente en Supabase.

`
fs.writeFileSync('temp_sql/113_detalle_con_billetera.sql', cabecera + def.trimEnd() + '\n')
console.log('✓ escrito temp_sql/113_detalle_con_billetera.sql (' + def.split('\n').length + ' líneas)')
