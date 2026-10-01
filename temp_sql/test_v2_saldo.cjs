// Test del patch saldo en las v2: single insuficiente + lote con exclusion
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';

function q(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: 'api.supabase.com',
        path: '/v1/projects/' + REF + '/database/query',
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.ACCESS_TOKEN,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let out = '';
        res.on('data', (d) => { out += d; });
        res.on('end', () => {
          try { resolve(JSON.parse(out)); } catch (e) { resolve(out); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const sql = [
    "DO $test$ DECLARE",
    "v_user_id bigint; v_wallet_id bigint; v_p1 bigint; v_p2 bigint; v_ok int := 0; v_total int := 0; r RECORD;",
    "BEGIN",
    "PERFORM set_config('request.jwt.claims', '{\"sub\":\"b90d1f17-f691-491a-a840-522510e67640\"}', false);",
    "SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();",
    "INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual, activa, saldo_inicial_pendiente)",
    "VALUES (v_user_id, '__TEST_V2__', 'ARS', 100, true, false) RETURNING billetera_id INTO v_wallet_id;",
    "INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, billetera_id)",
    "VALUES (v_user_id, 'ocr', 'expense', 5000, 'ARS', CURRENT_DATE, 'pendiente', v_wallet_id) RETURNING pendiente_id INTO v_p1;",
    "INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, billetera_id)",
    "VALUES (v_user_id, 'ocr', 'expense', 50, 'ARS', CURRENT_DATE, 'pendiente', v_wallet_id) RETURNING pendiente_id INTO v_p2;",
    "-- T1: single v2 insuficiente -> rechaza",
    "v_total := v_total + 1;",
    "BEGIN",
    "PERFORM public.fn_aprobar_cuarentena_v2(v_p1);",
    "RAISE EXCEPTION 'T1_FAIL: aprobo sin saldo';",
    "EXCEPTION WHEN OTHERS THEN",
    "IF SQLERRM LIKE '%error_wallet_saldo_insuficiente%' THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T1_FAIL: %', left(SQLERRM, 100); END IF;",
    "END;",
    "-- T2: item sigue pendiente",
    "v_total := v_total + 1;",
    "SELECT estado INTO r FROM public.p_caja_cuarentena WHERE pendiente_id = v_p1;",
    "IF r.estado = 'pendiente' THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T2_FAIL: %', r.estado; END IF;",
    "-- T3: lote v2 con [insuficiente, suficiente] -> exclusión: ok=false + ok=true",
    "v_total := v_total + 1;",
    "FOR r IN SELECT * FROM public.fn_aprobar_cuarentena_lote_v2(ARRAY[v_p1, v_p2]) LOOP",
    "IF r.pendiente_id = v_p1 AND r.ok = false AND r.error_key = 'error_wallet_saldo_insuficiente' THEN v_ok := v_ok + 1;",
    "ELSIF r.pendiente_id = v_p2 AND r.ok = true AND r.p_caja_id IS NOT NULL THEN v_ok := v_ok + 1;",
    "ELSE RAISE EXCEPTION 'T3_FAIL: % % %', r.pendiente_id, r.ok, r.error_key; END IF;",
    "END LOOP;",
    "IF v_ok <> v_total + 1 THEN RAISE EXCEPTION 'T3b_FAIL: ok=%', v_ok; END IF;",
    "v_ok := v_ok + 1; v_total := v_total + 1; -- T3b conto como el ultimo ok",
    "-- T4: el suficiente quedo procesado",
    "v_total := v_total + 1;",
    "SELECT estado INTO r FROM public.p_caja_cuarentena WHERE pendiente_id = v_p2;",
    "IF r.estado = 'procesado' THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T4_FAIL: %', r.estado; END IF;",
    "RAISE EXCEPTION 'TEST_RESULT: PASS %/%', v_ok, v_total;",
    "END $test$;",
  ].join('\n');

  const out = await q(sql);
  const s = JSON.stringify(out);
  const i = s.indexOf('P0001: TEST_RESULT');
  console.log(i >= 0 ? '=== ' + s.slice(i, Math.min(i + 60, s.length)) + ' ===' : 'respuesta: ' + s.slice(0, 400));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });