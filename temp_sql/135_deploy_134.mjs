// 135_deploy_134.mjs — despliega temp_sql/134_cambio_modo_ciclo_activo.sql
//
//   node temp_sql/135_deploy_134.mjs
//
// Qué hace, en este orden:
//   1. Guarda la definición anterior de fn_configurar_modo_presupuesto (para poder
//      revertir) y la huella de las tablas.
//   2. Aplica 134 (tabla de historial + fn_archivar_presupuestos_ciclo + la función
//      corregida).
//   3. Verifica la estructura: tabla, RLS, índice, funciones.
//   4. ENSAYO REAL SIN PERSISTENCIA: dentro de un bloque DO que termina lanzando una
//      excepción (eso revierte todo), con el user 135:
//        - le pone día ancla 30 (hoy es 29, así el ciclo activo empezó el mes
//          anterior y el bug del ciclo calendario se puede reproducir),
//        - crea una asignación en el ciclo ACTIVO y otra en el mes calendario,
//        - llama a fn_configurar_modo_presupuesto('anticipado'),
//        - comprueba que se archivó y se puso en 0 el ciclo ACTIVO, y que la fila
//          del mes calendario quedó intacta.
//      Si alguna comprobación falla, la excepción lo dice y no queda nada escrito.
//   5. Comprueba que después del ensayo NADA cambió (huella idéntica).
//
// Ojo: `pg_get_functiondef` no devuelve el CREATE terminado en ';'. Ya rompió una
// reversión en la tanda 1: acá se cierra siempre.

import fs from 'node:fs'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]

const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) {
    const err = new Error(JSON.stringify(json).slice(0, 900))
    err.body = json
    throw err
  }
  return json
}

const terminar = (def) => (/;\s*$/.test(def) ? def : def + ';')
const fmt = (n) => Number(n).toLocaleString('es-AR')

const huella = async () => (
  await q(`select (select count(*) from p_presupuestos) as presupuestos,
                  (select coalesce(sum(monto_limite),0) from p_presupuestos) as monto,
                  (select count(*) from p_presupuestos_config) as config,
                  (select count(*) from p_caja) as caja`)
)[0]

const defAnterior = terminar(
  (
    await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'fn_configurar_modo_presupuesto'`)
  )[0].def,
)

const huellaAntes = await huella()
console.log('=== ANTES ===')
console.log(`huella: ${JSON.stringify(huellaAntes)}`)
console.log(`archivo existe: ${JSON.stringify(await q(`select to_regclass('public.p_presupuestos_historial') is not null as existe`))}`)

const sql = terminar(fs.readFileSync('temp_sql/134_cambio_modo_ciclo_activo.sql', 'utf8'))
const aplicado = await q(`BEGIN;\n${sql}\nCOMMIT;`)
if (aplicado?.message) {
  console.error('✗ el deploy falló: ' + aplicado.message)
  process.exit(1)
}
console.log('\nSQL aplicado.')

console.log('\n=== ESTRUCTURA ===')
const estructura = (
  await q(`select
    (select to_regclass('public.p_presupuestos_historial') is not null) as archivo,
    (select relrowsecurity from pg_class where oid = 'public.p_presupuestos_historial'::regclass) as rls,
    (select count(*) from pg_indexes where tablename = 'p_presupuestos_historial') as indices,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_archivar_presupuestos_ciclo') as fn_archivar,
    (select position('v_mes_ciclo_actual' in pg_get_functiondef(p.oid)) > 0 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_configurar_modo_presupuesto') as usa_ciclo_activo,
    (select position('date_trunc(''month''::text, CURRENT_DATE)' in pg_get_functiondef(p.oid)) > 0 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_configurar_modo_presupuesto') as sigue_mes_calendario`)
)[0]
console.log(JSON.stringify(estructura))

const erroresEstructura = []
if (!estructura.archivo) erroresEstructura.push('no se creó p_presupuestos_historial')
if (!estructura.rls) erroresEstructura.push('la tabla de historial quedó sin RLS')
if (Number(estructura.fn_archivar) !== 1) erroresEstructura.push('falta fn_archivar_presupuestos_ciclo')
if (!estructura.usa_ciclo_activo) erroresEstructura.push('la función no usa el ciclo activo')
if (estructura.sigue_mes_calendario) erroresEstructura.push('la función sigue apuntando al mes calendario')

if (erroresEstructura.length) {
  console.error('\n✗ ESTRUCTURA MAL')
  for (const e of erroresEstructura) console.error('  - ' + e)
  console.error('revirtiendo la función...')
  await q(`BEGIN;\n${defAnterior}\nCOMMIT;`)
  process.exit(1)
}

// ─── Ensayo real sin persistencia ─────────────────────────────────────────────
// El bloque termina SIEMPRE en excepción: si todo está bien, la excepción lleva el
// JSON del resultado; si algo está mal, lleva el motivo. En los dos casos Postgres
// revierte la transacción y no queda una sola fila escrita.
const ensayo = `
DO $$
DECLARE
    v_user bigint := 135;
    v_ini_ciclo date;
    v_periodo_activo date;
    v_periodo_calendario date;
    v_estructura_a bigint;
    v_estructura_b bigint;
    v_activo_limite numeric;
    v_calendario_limite numeric;
    v_archivado numeric;
    v_motivo text;
    v_total_archivo integer;
BEGIN
    PERFORM set_config('request.jwt.claims',
        (select json_build_object('sub', auth_id, 'role', 'authenticated')::text from usuarios where user_id = v_user)
        , true);

    -- Día ancla 30 con hoy 29: el ciclo activo arrancó el mes anterior.
    UPDATE p_presupuestos_config SET dia_ancla_ciclo = 30 WHERE user_id = v_user;

    SELECT fecha_inicio INTO v_ini_ciclo FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
    v_periodo_activo := date_trunc('month', v_ini_ciclo);
    v_periodo_calendario := date_trunc('month', CURRENT_DATE);

    IF v_periodo_activo = v_periodo_calendario THEN
        RAISE EXCEPTION 'ENSAYO NO CONCLUYENTE: el ciclo activo coincide con el mes calendario (%)', v_periodo_activo;
    END IF;

    SELECT estructura_id INTO v_estructura_a FROM p_estructuras_egresos ORDER BY estructura_id LIMIT 1;
    SELECT estructura_id INTO v_estructura_b FROM p_estructuras_egresos ORDER BY estructura_id OFFSET 1 LIMIT 1;

    DELETE FROM p_presupuestos WHERE user_id = v_user;
    INSERT INTO p_presupuestos (estructura_egreso_id, user_id, monto_limite, mes_periodo, dia_ancla)
    VALUES (v_estructura_a, v_user, 100000, v_periodo_activo, 30),
           (v_estructura_b, v_user, 200000, v_periodo_calendario, 30);

    -- El modo arranca en base cero, así que el cambio a anticipado es una transición.
    UPDATE p_presupuestos_config SET modo_presupuesto = 'base_cero' WHERE user_id = v_user;

    PERFORM public.fn_configurar_modo_presupuesto('anticipado');

    SELECT monto_limite INTO v_activo_limite FROM p_presupuestos
     WHERE user_id = v_user AND estructura_egreso_id = v_estructura_a;
    SELECT monto_limite INTO v_calendario_limite FROM p_presupuestos
     WHERE user_id = v_user AND estructura_egreso_id = v_estructura_b;
    SELECT monto_limite, motivo INTO v_archivado, v_motivo FROM p_presupuestos_historial
     WHERE user_id = v_user ORDER BY historial_id DESC LIMIT 1;
    SELECT count(*) INTO v_total_archivo FROM p_presupuestos_historial WHERE user_id = v_user;

    IF v_activo_limite <> 0 THEN
        RAISE EXCEPTION 'FALLA: el ciclo activo (%) quedó en % en vez de 0', v_periodo_activo, v_activo_limite;
    END IF;
    IF v_calendario_limite <> 200000 THEN
        RAISE EXCEPTION 'FALLA: el mes calendario (%) se tocó: quedó en %', v_periodo_calendario, v_calendario_limite;
    END IF;
    IF v_archivado IS DISTINCT FROM 100000 THEN
        RAISE EXCEPTION 'FALLA: no se archivó el monto anterior del ciclo activo (archivado: %)', v_archivado;
    END IF;
    IF v_motivo IS DISTINCT FROM 'vuelta_a_anticipado' THEN
        RAISE EXCEPTION 'FALLA: motivo archivado incorrecto: %', v_motivo;
    END IF;

    RAISE EXCEPTION 'OK:%', json_build_object(
        'ciclo_activo', v_periodo_activo,
        'mes_calendario', v_periodo_calendario,
        'activo_quedo_en', v_activo_limite,
        'calendario_quedo_en', v_calendario_limite,
        'archivado', v_archivado,
        'motivo', v_motivo,
        'filas_archivo', v_total_archivo)::text;
END $$;
`

console.log('\n=== ENSAYO (se revierte) ===')
let ensayoOk = false
let ensayoJson = null
try {
  await q(ensayo)
  console.error('✗ el ensayo no lanzó la excepción esperada: la transacción NO se revirtió como se esperaba')
  process.exit(1)
} catch (err) {
  const mensaje = err.body?.message ?? String(err)
  const ok = mensaje.match(/OK:(\{.*\})/s)
  if (ok) {
    ensayoOk = true
    ensayoJson = JSON.parse(ok[1].replace(/\\"/g, '"'))
    console.log('✓ ' + JSON.stringify(ensayoJson))
  } else {
    console.error('✗ ENSAYO FALLÓ: ' + mensaje.slice(0, 600))
  }
}

const huellaDespues = await huella()
console.log(`\nhuella después: ${JSON.stringify(huellaDespues)}`)
const archivoVacio = (await q(`select count(*) as n from p_presupuestos_historial`))[0].n

const errores = []
if (!ensayoOk) errores.push('el ensayo no pasó')
if (JSON.stringify(huellaAntes) !== JSON.stringify(huellaDespues)) {
  errores.push(`el ensayo dejó rastro: ${JSON.stringify(huellaAntes)} -> ${JSON.stringify(huellaDespues)}`)
}
if (Number(archivoVacio) !== 0) {
  errores.push(`la tabla de historial quedó con ${archivoVacio} filas: el ensayo no se revirtió`)
}

if (errores.length) {
  console.error('\n✗ POSTCHECK FALLÓ — revierto la función al estado anterior')
  for (const e of errores) console.error('  - ' + e)
  const revertido = await q(`BEGIN;\n${defAnterior}\nCOMMIT;`)
  console.error(revertido?.message ? '✗✗ NO SE PUDO REVERTIR: ' + revertido.message : '✓ función anterior restaurada')
  process.exit(1)
}

console.log('\n✓ el reset apunta al ciclo activo (' + ensayoJson.ciclo_activo + ') y no al mes calendario')
console.log(`✓ la fila del mes calendario (${ensayoJson.mes_calendario}) quedó intacta con ${fmt(ensayoJson.calendario_quedo_en)}`)
console.log(`✓ el monto anterior del ciclo activo quedó archivado: ${fmt(ensayoJson.archivado)} (motivo ${ensayoJson.motivo})`)
console.log('✓ el ensayo no dejó una sola fila: huella idéntica y archivo vacío')
