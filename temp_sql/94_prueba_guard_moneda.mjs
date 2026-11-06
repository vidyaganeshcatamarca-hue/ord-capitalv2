// Prueba FUNCIONAL del guard de moneda y del nominal con retiro parcial.
// Todo dentro de BEGIN ... ROLLBACK: no queda nada en producción.
// Se simula el JWT del usuario 198 con set_config('request.jwt.claims').
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
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 900))
  return json
}

const AUTH_198 = '5e70854e-8cfa-4b0e-946d-64a055cc29c3'
const INV_GBP = 21      // Ypf, GBP, 500, sin retiros
const WALLET_BRL = 1376  // Reales, BRL  -> debe rechazarse
const WALLET_GBP = 1358 // GBP          -> debe aceptarse
const INV_CON_RETIRO = 20 // Xxx: capital 1000, retirado 200, valor actual 1000

const sql = `
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"${AUTH_198}","role":"authenticated"}', true);

CREATE OR REPLACE FUNCTION pg_temp.probar() RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_mal text := 'no_intentado';
  v_bien text := 'no_intentado';
  v_movs_antes int;
  v_movs_despues int;
  v_detalle jsonb;
  v_cartera jsonb;
BEGIN
  SELECT count(*) INTO v_movs_antes FROM public.p_caja WHERE metadata->>'inversion_id' = '${INV_GBP}';

  -- 1) Billetera de OTRA moneda (BRL para una inversion GBP): debe fallar.
  BEGIN
    PERFORM public.fn_liquidar_inversion(${INV_GBP}, 500, ${WALLET_BRL});
    v_mal := 'PERMITIO (bug)';
  EXCEPTION WHEN OTHERS THEN
    v_mal := SQLERRM;
  END;

  -- 2) Billetera de la MISMA moneda: debe funcionar.
  BEGIN
    PERFORM public.fn_liquidar_inversion(${INV_GBP}, 500, ${WALLET_GBP});
    v_bien := 'aceptada';
  EXCEPTION WHEN OTHERS THEN
    v_bien := 'FALLO: ' || SQLERRM;
  END;

  SELECT count(*) INTO v_movs_despues FROM public.p_caja WHERE metadata->>'inversion_id' = '${INV_GBP}';

  -- 3) Nominal con retiro parcial: (valor actual + retirado) vs capital.
  v_detalle := public.fn_reporte_detalle_inversion(${INV_CON_RETIRO});

  -- 4) La cartera tiene que dar el mismo criterio.
  SELECT to_jsonb(c) INTO v_cartera FROM public.fn_reporte_cartera_inversiones() c
   WHERE c.inversion_id = ${INV_CON_RETIRO};

  -- 5) El rendimiento vs inflacion (usuario GBP: sin datos).
  RETURN jsonb_build_object(
    'mismatch', v_mal,
    'misma_moneda', v_bien,
    'movs_antes', v_movs_antes,
    'movs_despues', v_movs_despues,
    'detalle_monto_liquidado', v_detalle->>'monto_liquidado',
    'detalle_nominal', v_detalle->>'rendimiento_nominal',
    'detalle_motivo', v_detalle->>'motivo_inflacion',
    'cartera_nominal', v_cartera->>'rendimiento_nominal',
    'rendimiento', public.fn_reporte_rendimiento_vs_inflacion()
  );
END $$;

SELECT pg_temp.probar() AS prueba;
ROLLBACK;`

const r = await q(sql)
console.log(JSON.stringify(r, null, 1))
