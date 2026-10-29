// Prueba transaccional de 136_vista_reportable.sql: mide los reportes ANTES y DESPUES
// dentro de la misma transaccion y hace ROLLBACK. No deja nada aplicado.
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const sql = fs.readFileSync('temp_sql/136_vista_reportable.sql', 'utf8')

const run = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  const j = await r.json()
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 700))
  return j
}

// Cada RPC de solo lectura que cambia de fuente, con los argumentos con que la llama la app.
const LECTURAS = [
  ['fn_reporte_safe_to_spend()', 'fn_reporte_safe_to_spend()'],
  ['fn_reporte_variacion_intermensual()', 'fn_reporte_variacion_intermensual()'],
  ['fn_reporte_timeline_proyeccion()', 'fn_reporte_timeline_proyeccion()'],
  ['fn_reporte_resumen_cuadrantes()', 'fn_reporte_resumen_cuadrantes()'],
  // el overload sin argumentos no es llamable desde SQL (ambigue con el de fecha con DEFAULT)
  ['fn_reporte_termometro_presupuestos(date)', "fn_reporte_termometro_presupuestos('2026-09-30'::date)"],
  ['fn_reporte_termometro_presupuestos(null)', "fn_reporte_termometro_presupuestos(NULL::date)"],
  ['fn_reporte_termometro_tarjeta(null)', 'fn_reporte_termometro_tarjeta(NULL::bigint)'],
  ['fn_reporte_reto_hormigas()', 'fn_reporte_reto_hormigas()'],
  ['fn_reporte_reto_buzon_deseos()', 'fn_reporte_reto_buzon_deseos()'],
  ['fn_reporte_sobres_detalle(date)', "fn_reporte_sobres_detalle('2026-09-30'::date)"],
  ['fn_sugerir_distribucion_activacion()', 'fn_sugerir_distribucion_activacion()'],
  ['fn_reporte_simulador_escenarios()', 'fn_reporte_simulador_escenarios()'],
  ['CONTROL sin tocar: top_categorias', "fn_reporte_top_categorias_mes('2026-09-01'::date,'2026-09-30'::date,NULL,NULL)"],
  ['CONTROL sin tocar: movimientos_recientes', "fn_reporte_movimientos_recientes(5,0,'all',NULL,'2026-09-01'::date,'2026-09-30'::date,NULL)"]
]

const medir = async () => {
  const out = {}
  for (const [etiqueta, call] of LECTURAS) {
    const rows = await run(`
      select coalesce(json_agg(t), '[]'::json)::text as j from (
        select * from (
          select set_config('request.jwt.claims',
            json_build_object('sub',(select auth_id from usuarios where user_id=1),'role','authenticated')::text,true) as _c
        ) c
        cross join lateral ${call} t
      ) t`)
    out[etiqueta] = rows[0].j
  }
  return out
}

const totales = async () => run(`
  select tipo, round(sum(coalesce(valor_local,valor_egreso,valor_ingreso)),2) as con_patas,
         round(sum(coalesce(valor_local,valor_egreso,valor_ingreso))
           filter (where coalesce(metadata->>'transfer_double_insert','false') <> 'true'),2) as sin_patas
  from p_caja where user_id=1 and es_compartido=false and tipo in ('expense','income')
    and fecha between '2026-09-01' and '2026-09-30' group by tipo order by tipo`)

let fallos = 0
await run('BEGIN')
try {
  const antes = await run('select 1')  // conexion viva
  const totalesAntes = await totales()
  const medAntes = await medir()

  await run(sql)

  const medDespues = await medir()
  const vistas = await run(`select count(*)::int as n from pg_views where viewname='v_p_caja_reportable'`)
  const totalesDespues = await totales()

  console.log('=== la vista existe dentro de la transaccion:', vistas[0].n === 1 ? 'si' : 'NO')
  console.log('=== totales de septiembre (no cambian: son SQL directo sobre p_caja):')
  console.log('   ', JSON.stringify(totalesAntes), '\n   ', JSON.stringify(totalesDespues))

  console.log('\n=== reportes (antes -> despues)')
  for (const [etiqueta] of LECTURAS) {
    const a = medAntes[etiqueta], d = medDespues[etiqueta]
    const iguales = a === d
    const control = etiqueta.startsWith('CONTROL')
    let marca
    if (control) marca = iguales ? 'OK  control intacto' : 'FALLA el control cambio'
    else marca = iguales ? '(sin cambio: el usuario no tiene patas en esa ventana)' : 'CAMBIO'
    if (control && !iguales) fallos++
    console.log(`  ${etiqueta.padEnd(44)} ${marca}`)
    if (!iguales && !control) {
      console.log('      antes:   ' + a.slice(0, 220))
      console.log('      despues: ' + d.slice(0, 220))
    }
  }
} finally {
  await run('ROLLBACK')
}
const quedo = await run(`select count(*)::int as n from pg_views where viewname='v_p_caja_reportable'`)
console.log('\n=== despues del ROLLBACK la vista existe:', quedo[0].n, quedo[0].n === 0 ? '(limpio)' : '(QUEDO ALGO)')
console.log(fallos === 0 ? '\nTRIAL OK' : `\nTRIAL CON ${fallos} FALLA(S)`)
