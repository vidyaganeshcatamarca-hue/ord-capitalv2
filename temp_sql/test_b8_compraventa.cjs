// Test B8: patas de transferencia con detalle = clave i18n segun direccion + RPC titulo
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
    "v_uid bigint; v_usd_w bigint; v_ars_w bigint; v_pid bigint;",
    "v_ok int := 0; r RECORD; n int;",
    "BEGIN",
    "PERFORM set_config('request.jwt.claims', '{\"sub\":\"b90d1f17-f691-491a-a840-522510e67640\"}', false);",
    "SELECT user_id INTO v_uid FROM public.usuarios WHERE auth_id = auth.uid();",

    "INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual, activa)",
    "VALUES (v_uid, '__TB8_AR__', 'ARS', 100000, true) RETURNING billetera_id INTO v_ars_w;",
    "INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual, activa)",
    "VALUES (v_uid, '__TB8_USD__', 'USD', 100, true) RETURNING billetera_id INTO v_usd_w;",

    "-- T1: ARS->USD sin nota -> ambas patas = transfer_compra_dolares",
    "INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, billetera_id, billetera_destino_id, destination_amount)",
    "VALUES (v_uid, 'voz', 'transfer', 1000, 'ARS', CURRENT_DATE, 'pendiente', v_ars_w, v_usd_w, 1) RETURNING pendiente_id INTO v_pid;",
    "PERFORM public.fn_aprobar_cuarentena_v2(v_pid);",
    "SELECT count(*) INTO n FROM public.p_caja p WHERE p.metadata @> jsonb_build_object('quarantine_id', v_pid) AND p.detalle = 'transfer_compra_dolares';",
    "IF n = 2 THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T1_FAIL: patas=%', n; END IF;",
    "-- y el titulo via RPC",
    "SELECT count(*) INTO n FROM public.fn_reporte_movimientos_recientes(100, 0) m WHERE m.nombre_categoria = 'transfer_compra_dolares' AND m.billetera_origen_id IN (v_ars_w, v_usd_w);",
    "IF n >= 2 THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T1b_FAIL: rpc=%', n; END IF;",

    "-- T2: USD->ARS sin nota -> transfer_venta_dolares",
    "INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, billetera_id, billetera_destino_id, destination_amount)",
    "VALUES (v_uid, 'voz', 'transfer', 1, 'USD', CURRENT_DATE, 'pendiente', v_usd_w, v_ars_w, 1500) RETURNING pendiente_id INTO v_pid;",
    "PERFORM public.fn_aprobar_cuarentena_v2(v_pid);",
    "SELECT count(*) INTO n FROM public.p_caja p WHERE p.metadata @> jsonb_build_object('quarantine_id', v_pid) AND p.detalle = 'transfer_venta_dolares';",
    "IF n = 2 THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T2_FAIL: patas=%', n; END IF;",

    "-- T3: con nota del usuario -> la nota gana en ambas patas",
    "INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, detalle, billetera_id, billetera_destino_id, destination_amount)",
    "VALUES (v_uid, 'voz', 'transfer', 500, 'ARS', CURRENT_DATE, 'pendiente', 'mi nota de prueba', v_ars_w, v_usd_w, 1) RETURNING pendiente_id INTO v_pid;",
    "PERFORM public.fn_aprobar_cuarentena_v2(v_pid);",
    "SELECT count(*) INTO n FROM public.p_caja p WHERE p.metadata @> jsonb_build_object('quarantine_id', v_pid) AND p.detalle = 'mi nota de prueba';",
    "IF n = 2 THEN v_ok := v_ok + 1; ELSE RAISE EXCEPTION 'T3_FAIL: patas=%', n; END IF;",

    "RAISE EXCEPTION 'TEST_RESULT: PASS %/4', v_ok;",
    "END $t$;",
  ];
  const out = await q(parts.join('\n'));
  const s = JSON.stringify(out);
  const i = s.indexOf('P0001: TEST_RESULT');
  console.log(i >= 0 ? '=== ' + s.slice(i, i + 40) : 'respuesta: ' + s.slice(0, 600));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });