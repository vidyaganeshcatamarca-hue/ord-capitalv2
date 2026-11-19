// Fotografia verificable del estado actual del modulo de presupuesto.
//
// La Management API corta las respuestas de mas de ~2 KB, asi que esto pide de a poco y
// arma el archivo local. Deja ademas el sha256 del resultado para poder probar despues
// que la foto no se toco.
//
// Importante: es la foto del estado DE DESPUES de las modificaciones de esta sesion. No
// reemplaza la linea base de la etapa 0.3 del plan, que no se hizo, y no se presenta como
// si fuera anterior a los cambios.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const raiz = process.cwd()
const env = fs.readFileSync(path.join(raiz, '.env.local'), 'utf-8')
const leer = (clave) => {
  const m = env.match(new RegExp('^\\s*' + clave + '\\s*=\\s*(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}
const token = leer('ACCESS_TOKEN')
const url = leer('SUPABASE_URL')
const ref = url.replace(/^https?:\/\//, '').split('.')[0]

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status} ${texto.slice(0, 300)}`)
  return JSON.parse(texto)
}

const foto = {
  tomada_en: new Date().toISOString(),
  nota:
    'Foto del estado DESPUES de las modificaciones de esta sesion. La linea base previa que ' +
    'pedia la etapa 0.3 del plan NO existe: no se creo antes de escribir. Esta foto no la reemplaza.',
  totales: null,
  cuentas: [],
  funciones: [],
}

// 1 · totales
foto.totales = (await sql(`
  SELECT json_build_object(
    'config',      (SELECT count(*) FROM public.p_presupuestos_config),
    'presupuestos',(SELECT count(*) FROM public.p_presupuestos),
    'con_techo',   (SELECT count(*) FROM public.p_presupuestos WHERE monto_techo IS NOT NULL),
    'historial',   (SELECT count(*) FROM public.p_presupuestos_historial),
    'md5_presupuestos', (SELECT md5(string_agg(p.presupuesto_id::text || '|' || COALESCE(p.user_id::text,'n') || '|' ||
                             p.estructura_egreso_id::text || '|' || p.mes_periodo::text || '|' ||
                             COALESCE(p.monto_limite,0)::text || '|' || COALESCE(p.monto_techo::text,'nulo'),
                             ',' ORDER BY p.presupuesto_id)) FROM public.p_presupuestos p),
    'md5_historial', (SELECT md5(string_agg(h.historial_id::text || '|' || COALESCE(h.estructura_egreso_id::text,'n') || '|' ||
                             h.mes_periodo::text || '|' || COALESCE(h.monto_limite,0)::text || '|' ||
                             COALESCE(h.monto_techo::text,'nulo') || '|' || COALESCE(h.motivo,''),
                             ',' ORDER BY h.historial_id)) FROM public.p_presupuestos_historial h)
  ) AS t`))[0].t

// 2 · cuentas, de a diez para que ninguna respuesta se corte
let ultimo = 0
for (;;) {
  const filas = await sql(`
    SELECT json_agg(c ORDER BY c.user_id) AS c FROM (
      SELECT cfg.user_id, cfg.modo_presupuesto, cfg.dia_ancla_ciclo, cfg.fecha_activacion_base_cero,
             (SELECT count(*) FROM public.p_presupuestos p WHERE p.user_id = cfg.user_id) AS filas,
             (SELECT count(*) FROM public.p_presupuestos p WHERE p.user_id = cfg.user_id AND p.monto_techo IS NOT NULL) AS con_techo,
             (SELECT count(*) FROM public.p_presupuestos p WHERE p.user_id = cfg.user_id AND COALESCE(p.monto_limite,0) <> 0) AS con_plata,
             (SELECT md5(string_agg(p.mes_periodo::text || '|' || p.estructura_egreso_id::text || '|' ||
                      COALESCE(p.monto_limite,0)::text || '|' || COALESCE(p.monto_techo::text,'nulo'),
                      ',' ORDER BY p.mes_periodo, p.estructura_egreso_id))
                FROM public.p_presupuestos p WHERE p.user_id = cfg.user_id) AS md5_presupuestos,
             (SELECT count(*) FROM public.p_presupuestos_historial h WHERE h.user_id = cfg.user_id) AS historial
        FROM public.p_presupuestos_config cfg
       WHERE cfg.user_id > ${ultimo}
       ORDER BY cfg.user_id LIMIT 10
    ) c`)
  const lote = filas[0]?.c ?? []
  if (lote.length === 0) break
  foto.cuentas.push(...lote)
  ultimo = lote[lote.length - 1].user_id
}

// 3 · funciones instaladas del modulo, en dos mitades por el mismo motivo
for (const [desde, hasta] of [['', 'fn_r'], ['fn_r', 'zzz']]) {
  const r = await sql(`
    SELECT json_agg(f ORDER BY f.nombre) AS f FROM (
      SELECT p.proname AS nombre, pg_get_function_identity_arguments(p.oid) AS firma,
             md5(pg_get_functiondef(p.oid)) AS md5
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname > '${desde}' AND p.proname <= '${hasta}'
         AND (p.proname LIKE '%presupuesto%' OR p.proname LIKE '%sobre%' OR p.proname LIKE '%transferir%'
              OR p.proname LIKE '%techo%' OR p.proname LIKE '%subcuenta%' OR p.proname LIKE '%disponible%'
              OR p.proname LIKE '%arrastre%' OR p.proname LIKE '%saldo%' OR p.proname LIKE '%aviso%')
    ) f`)
  foto.funciones.push(...(r[0]?.f ?? []))
}

const destino = path.join(raiz, 'odd', 'auditoria-etapa4', 'estado-actual.json')
const crudo = JSON.stringify(foto, null, 2) + '\n'
fs.writeFileSync(destino, crudo, 'utf-8')
const sha = crypto.createHash('sha256').update(crudo, 'utf8').digest('hex')
fs.writeFileSync(destino + '.sha256', `${sha}  estado-actual.json\n`, 'utf-8')

console.log('cuentas:', foto.cuentas.length)
console.log('presupuestos:', foto.totales.presupuestos, '· con techo:', foto.totales.con_techo, '· historial:', foto.totales.historial)
console.log('md5 presupuestos:', foto.totales.md5_presupuestos)
console.log('md5 historial   :', foto.totales.md5_historial)
console.log('funciones del modulo:', foto.funciones.length)
console.log('archivo:', destino)
console.log('sha256:', sha)
