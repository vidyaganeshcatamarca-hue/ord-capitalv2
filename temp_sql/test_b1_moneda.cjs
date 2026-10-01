// Test B1: moneda derivada de billetera/tarjeta en la aprobacion (rollback obligatorio)
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
        res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(out); } });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const parts = [
    "DO $t$ DECLARE",
    "v_uid bigint; v_usd_w bigint; v_ars_w bigint; v_card bigint; v_pid bigint;",
    "v_caja bigint; v_ok int := 0; r RECORD; n int;",
    "BEGIN",
    "PERFORM set_config('request.jwt.claims', '{\"sub\":\"b90d1f17-f691-491a-a840-522510e67640\"}', false);",
    "SELECT user_id INTO v_uid FROM public.usuarios WHERE auth_id = auth.uid();",

    "INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual, activa)",
    "VALUES (v_uid, '__TB1_AR__', 'ARS', 100000, true) RETURNING billetera_id INTO v_ars_w;",
    "INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual, activa)",
    "VALUES (v_uid, '__TB1_USD__', 'USD', 100, true) RETURNING billetera_id INTO v_usd_w;",
    "INSERT INTO public.p_tarjetas_credito (user_id, nombre_tarjeta, banco, moneda_iso, dia_cierre, dia_vencimiento, activa)",
    "VALUES (v_uid, '__TB1_CARD__', 'B', 'USD', 1, 1, true) RETURNING tarjeta_id INTO v_card;",

    "-- T1: expense wallet USD, fila de cuarentena dice ARS -> debe salir USD/es_usd",
    "INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, billetera_id)",
    "VALUES (v_uid, 'voz', 'expense', 50, 'ARS', CURRENT_DATE, 'pendiente', v_usd_w) RETURNING pendiente_id INTO v_pid;",
    "v_caja := public.fn_aprobar_cuarentena_v2(v_pid);",
    "SELECT p.es_usd, p.moneda INTO r FROM public.p_caja p WHERE p.p_caja_id = v_caja;",
    "IF r.es_usd = true AND r.moneda = 'USD' THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T1_FAIL: %/%', r.es_usd, r.moneda; END IF;",

    "-- T2: card_expense con tarjeta USD y fila de cuarentena ARS -> USD/es_usd",
    "INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, tarjeta_id)",
    "VALUES (v_uid, 'voz', 'card_expense', 10, 'ARS', CURRENT_DATE, 'pendiente', v_card) RETURNING pendiente_id INTO v_pid;",
    "v_caja := public.fn_aprobar_cuarentena_v2(v_pid);",
    "SELECT p.es_usd, p.moneda INTO r FROM public.p_caja p WHERE p.p_caja_id = v_caja;",
    "IF r.es_usd = true AND r.moneda = 'USD' THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T2_FAIL: %/%', r.es_usd, r.moneda; END IF;",

    "-- T3: transfer ARS->USD con destination_amount -> 2 filas con moneda correcta por pata",
    "INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, billetera_id, billetera_destino_id, destination_amount)",
    "VALUES (v_uid, 'voz', 'transfer', 1000, 'ARS', CURRENT_DATE, 'pendiente', v_ars_w, v_usd_w, 1) RETURNING pendiente_id INTO v_pid;",
    "v_caja := public.fn_aprobar_cuarentena_v2(v_pid);",
    "-- la pata egreso",
    "SELECT p.es_usd, p.moneda, p.tipo INTO r",
    "FROM public.p_caja p",
    "WHERE p.metadata @> jsonb_build_object('quarantine_id', v_pid) AND p.tipo = 'expense';",
    "IF r.es_usd = false AND r.moneda = 'ARS' THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T3a_FAIL: %/%/%', r.tipo, r.es_usd, r.moneda; END IF;",
    "-- la pata acreditacion",
    "SELECT p.es_usd, p.moneda, p.tipo INTO r",
    "FROM public.p_caja p",
    "WHERE p.metadata @> jsonb_build_object('quarantine_id', v_pid) AND p.tipo = 'income';",
    "IF r.es_usd = true AND r.moneda = 'USD' THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T3b_FAIL: %/%/%', r.tipo, r.es_usd, r.moneda; END IF;",

    "-- T4: la RPC expone es_usd y moneda coherente (incluye filas viejas contradictorias)",
    "SELECT count(*) INTO n FROM public.fn_reporte_movimientos_recientes(100, 0) m WHERE m.es_usd = true AND m.moneda = 'USD';",
    "IF n >= 2 THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T4_FAIL: n=%', n; END IF;",

    "RAISE EXCEPTION 'TEST_RESULT: PASS %/4', v_ok;",
    "END $t$;",
  ];
  const out = await q(parts.join('\n'));
  const s = JSON.stringify(out);
  const i = s.indexOf('P0001: TEST_RESULT');
  console.log(i >= 0 ? '=== ' + s.slice(i, i + 40) : 'respuesta: ' + s.slice(0, 500));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });