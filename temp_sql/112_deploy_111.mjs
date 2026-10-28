// Aplica la 111 (posición preexistente) y prueba los siete casos dentro de una
// transacción que se REVIERTE: no queda ninguna fila de prueba.
import fs from 'node:fs'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) =>
  (await (await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })).json())

const sql = fs.readFileSync('temp_sql/111_posicion_existente.sql', 'utf8')

const pruebas = `
CREATE TEMP TABLE zz_results (caso text, ok boolean, detalle text) ON COMMIT DROP;

DO $pruebas$
DECLARE
    v_uid uuid;
    v_wallet bigint;
    v_inv bigint;
    v_inv_pre bigint;
    v_inv_wallet bigint;
    v_rec RECORD;
    v_movs integer;
    v_borrado boolean;
    v_err text;
    v_fallo boolean;
BEGIN
    SELECT auth_id INTO v_uid FROM public.usuarios WHERE user_id = 1;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

    SELECT billetera_origen_id INTO v_wallet FROM public.p_inversiones
     WHERE user_id = 1 AND billetera_origen_id IS NOT NULL LIMIT 1;

    -- ---- A: alta preexistente, sin billetera, con fecha histórica ----
    v_inv_pre := public.fn_crear_inversion(
        'ZZ PRUEBA PREEXISTENTE', 1200000, 0, NULL, 'ARS', 'otro', DATE '2021-03-15');
    SELECT * INTO v_rec FROM public.p_inversiones WHERE inversion_id = v_inv_pre;
    SELECT count(*) INTO v_movs FROM public.p_caja
     WHERE (metadata ->> 'inversion_id') = v_inv_pre::text;
    INSERT INTO zz_results VALUES ('A preexistente: sin billetera, fecha histórica, valor=capital, sin p_caja',
        v_rec.billetera_origen_id IS NULL
        AND v_rec.fecha_inicio = DATE '2021-03-15'
        AND v_rec.monto_invertido_original = 1200000
        AND v_rec.valor_mercado_actual = 1200000
        AND v_rec.tasa_anual_tna = 0
        AND v_rec.estado = 'activa'
        AND v_movs = 0,
        format('wallet=%s fecha=%s cap=%s valor=%s tna=%s movs=%s',
               v_rec.billetera_origen_id, v_rec.fecha_inicio, v_rec.monto_invertido_original,
               v_rec.valor_mercado_actual, v_rec.tasa_anual_tna, v_movs));

    -- ---- B: plazo fijo preexistente SIN TNA (regla relajada, S6) ----
    v_fallo := false; v_err := '';
    BEGIN
        PERFORM public.fn_crear_inversion('ZZ PF PREEXISTENTE', 50000, 0, NULL, 'ARS', 'plazo_fijo', DATE '2024-01-10');
    EXCEPTION WHEN OTHERS THEN v_fallo := true; v_err := SQLERRM;
    END;
    INSERT INTO zz_results VALUES ('B plazo fijo preexistente sin TNA: se acepta', NOT v_fallo, COALESCE(v_err, 'ok'));

    -- ---- C: plazo fijo desde billetera SIN TNA: sigue fallando (S8) ----
    v_fallo := false; v_err := '';
    BEGIN
        PERFORM public.fn_crear_inversion('ZZ PF WALLET', 100, 0, v_wallet, 'ARS', 'plazo_fijo');
    EXCEPTION WHEN OTHERS THEN v_fallo := true; v_err := SQLERRM;
    END;
    INSERT INTO zz_results VALUES ('C plazo fijo desde billetera sin TNA: rechazado', v_fallo, COALESCE(v_err, 'no falló'));

    -- ---- D: fecha futura en preexistente: rechazada (S4) ----
    v_fallo := false; v_err := '';
    BEGIN
        PERFORM public.fn_crear_inversion('ZZ FUTURO', 1000, 0, NULL, 'ARS', 'otro', CURRENT_DATE + 1);
    EXCEPTION WHEN OTHERS THEN v_fallo := true; v_err := SQLERRM;
    END;
    INSERT INTO zz_results VALUES ('D preexistente con fecha futura: rechazado', v_fallo AND v_err LIKE '%start_date_future%', COALESCE(v_err, 'no falló'));

    -- ---- E: alta desde billetera: comportamiento previo intacto (S8) ----
    v_inv_wallet := public.fn_crear_inversion('ZZ DESDE WALLET', 1, 0, v_wallet, 'ARS', 'otro');
    SELECT * INTO v_rec FROM public.p_inversiones WHERE inversion_id = v_inv_wallet;
    SELECT count(*) INTO v_movs FROM public.p_caja
     WHERE (metadata ->> 'inversion_id') = v_inv_wallet::text AND detalle LIKE 'investment_prefix:%';
    INSERT INTO zz_results VALUES ('E desde billetera: egreso en p_caja y fecha de hoy',
        v_rec.billetera_origen_id = v_wallet
        AND v_rec.fecha_inicio = CURRENT_DATE
        AND v_rec.valor_mercado_actual = 1
        AND v_movs = 1,
        format('wallet=%s fecha=%s valor=%s movs=%s', v_rec.billetera_origen_id,
               v_rec.fecha_inicio, v_rec.valor_mercado_actual, v_movs));

    -- ---- F: borrar la preexistente (sin movimientos): permitido (S7) ----
    v_borrado := public.fn_eliminar_inversion(v_inv_pre);
    SELECT count(*) INTO v_movs FROM public.p_inversiones WHERE inversion_id = v_inv_pre;
    INSERT INTO zz_results VALUES ('F borrar preexistente sin movimientos: permitido',
        v_borrado AND v_movs = 0, format('borrado=%s filas=%s', v_borrado, v_movs));

    -- ---- G: borrar una inversión CON movimientos: rechazado (S7) ----
    v_fallo := false; v_err := '';
    BEGIN
        PERFORM public.fn_eliminar_inversion(25);
    EXCEPTION WHEN OTHERS THEN v_fallo := true; v_err := SQLERRM;
    END;
    SELECT count(*) INTO v_movs FROM public.p_inversiones WHERE inversion_id = 25;
    INSERT INTO zz_results VALUES ('G borrar inversión con movimientos: rechazado y la fila sobrevive',
        v_fallo AND v_err LIKE '%has_movements%' AND v_movs = 1, COALESCE(v_err, 'no falló'));

    -- ---- H: la preexistente aparece en el patrimonio como activo ----
    SELECT * INTO v_rec FROM public.fn_reporte_patrimonio_inversiones() AS x, LATERAL (SELECT x AS j) t(j) LIMIT 1;
    INSERT INTO zz_results VALUES ('H el reporte de patrimonio sigue respondiendo', v_rec.j IS NOT NULL, left(v_rec.j::text, 90));

    -- ---- I: borrar una inversión CON movimientos también está protegida por
    --         el camino de la que sí tiene egreso de alta ----
    v_fallo := false; v_err := '';
    BEGIN
        PERFORM public.fn_eliminar_inversion(v_inv_wallet);
    EXCEPTION WHEN OTHERS THEN v_fallo := true; v_err := SQLERRM;
    END;
    SELECT count(*) INTO v_movs FROM public.p_inversiones WHERE inversion_id = v_inv_wallet;
    INSERT INTO zz_results VALUES ('I borrar la que salió de billetera: rechazado y sobrevive',
        v_fallo AND v_movs = 1, COALESCE(v_err, 'no falló'));
END
$pruebas$;

SELECT caso, ok, detalle FROM zz_results;
`

const ensayo = await q('BEGIN;\n' + sql + '\n' + pruebas + '\nROLLBACK;')
if (!Array.isArray(ensayo)) {
  console.log('✗ Ensayo falló: ' + JSON.stringify(ensayo).slice(0, 400))
  process.exit(1)
}
let fallas = 0
for (const r of ensayo) {
  if (!r.ok) fallas++
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.caso + '  [' + r.detalle + ']')
}
if (fallas > 0) {
  console.log('\n✗ ' + fallas + ' caso(s) fallaron: no se aplica la migración.')
  process.exit(1)
}

const aplicado = await q('BEGIN;\n' + sql + '\nCOMMIT;')
if (aplicado?.message) { console.log('✗ 111 falló: ' + aplicado.message); process.exit(1) }
console.log('\n✓ 111 aplicada')

const check = await q(`select
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_crear_inversion') as overloas_crear,
    (select pg_get_function_arguments(oid) like '%p_fecha_inicio%' from pg_proc where proname = 'fn_crear_inversion') as tiene_fecha,
    (select pg_get_functiondef(oid) like '%v_es_existente%' from pg_proc where proname = 'fn_crear_inversion') as tiene_modo,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_eliminar_inversion') as eliminar,
    (select pg_get_functiondef(oid) like '%error_investment_has_movements%' from pg_proc where proname = 'fn_eliminar_inversion') as guarda`)
console.log('POSTCHECK ' + JSON.stringify(check))
const filas = await q('select count(*) as total from public.p_inversiones')
console.log('FILAS p_inversiones: ' + JSON.stringify(filas))
