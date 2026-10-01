// Test: expense sobre el saldo -> fn_registrar_movimiento_caja bloquea?
const https = require('https');
const REF = 'bjszdmheddcxjdhcvibi';
function q(sql) { return new Promise((resolve, reject) => { const body = JSON.stringify({ query: sql }); const req = https.request({ hostname: 'api.supabase.com', path: '/v1/projects/' + REF + '/database/query', method: 'POST', headers: { Authorization: 'Bearer ' + process.env.ACCESS_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let out = ''; res.on('data', (d) => { out += d; }); res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } }); }); req.on('error', reject); req.write(body); req.end(); }); }
(async () => {
  const sql = [
    "DO $test$ DECLARE v_user_id bigint; v_wallet_id bigint; v_saldo numeric; BEGIN",
    "PERFORM set_config('request.jwt.claims', '{\"sub\":\"b90d1f17-f691-491a-a840-522510e67640\"}', false);",
    "SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();",
    "INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual, activa, saldo_inicial_pendiente)",
    "VALUES (v_user_id, '__TEST_EXCESO__', 'ARS', 100, true, false) RETURNING billetera_id INTO v_wallet_id;",
    "BEGIN",
    "PERFORM public.fn_registrar_movimiento_caja('expense', v_wallet_id, NULL, 0, 9999, 'test exceso');",
    "RAISE EXCEPTION 'TEST_FAIL: el gasto de 9999 con saldo 100 PASO';",
    "EXCEPTION WHEN OTHERS THEN",
    "IF SQLERRM LIKE '%insufficient%' THEN RAISE EXCEPTION 'TEST_RESULT: PASS (bloqueo: %)', left(SQLERRM, 80);",
    "ELSE RAISE EXCEPTION 'TEST_RESULT: OTRO_ERROR: %', left(SQLERRM, 120); END IF;",
    "END;",
    "RAISE EXCEPTION 'TEST_END';",
    "END $test$;",
  ].join(' ');
  const r = await q(sql);
  const s = JSON.stringify(r);
  console.log('respuesta: ' + s.slice(0, 400));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
