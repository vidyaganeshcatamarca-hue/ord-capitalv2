// Test transaccional: aprobar cuarentena de voz con card_expense genera cuotas.
// Todo en BEGIN ... ROLLBACK (nada persiste). RAISE en el primer fail.
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { ACCESS_TOKEN, SUPABASE_URL } = env
const PROJECT = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]

const AUTH_ID = 'b90d1f17-f691-491a-a840-522510e67640' // user 1
const CARD = 2 // Galicia gold: cierre 18, venc 25, ARS

const sql = `BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"${AUTH_ID}","role":"authenticated"}', true);

DO $do$
DECLARE
    v_pid bigint;
    v_caja1 bigint;
    v_caja2 bigint;
    n int;
    fechas text;
    ok_mountos int;
BEGIN
    -- 3 cuotas: compra 15-jun (dia 15 <= cierre 18 => base jun; venc 25 > cierre => sin mes extra)
    SELECT COALESCE(max(pendiente_id), 0) + 1 INTO v_pid FROM public.p_caja_cuarentena;
    INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, tarjeta_id, monto, fecha, cuotas, detalle, metadata)
    VALUES ( 1, 'voz', 'card_expense', ${CARD}, 3000, date '2026-06-15', 3, 'test cuotas voz', '{"test": true}'::jsonb)
    RETURNING pendiente_id INTO v_pid;

    v_caja1 := public.fn_aprobar_cuarentena_v2(v_pid);

    SELECT count(*), string_agg(CASE WHEN numero_cuota = 1 AND abs(monto_cuota - 1000) < 0.01 AND fecha_estimada_pago = date '2026-06-25' THEN 'ok1'
                                    WHEN numero_cuota = 2 AND abs(monto_cuota - 1000) < 0.01 AND fecha_estimada_pago = date '2026-07-25' THEN 'ok2'
                                    WHEN numero_cuota = 3 AND abs(monto_cuota - 1000) < 0.01 AND fecha_estimada_pago = date '2026-08-25' THEN 'ok3' END, ',')
      INTO n, fechas
    FROM public.p_cuotas_detalle WHERE p_caja_id = v_caja1;

    IF n <> 3 OR fechas IS DISTINCT FROM 'ok1,ok2,ok3' THEN
        RAISE EXCEPTION 'FAIL cuotas 3x1000: n=% fechas=%', n, coalesce(fechas, '(null)');
    END IF;

    -- compromiso del primer mes existe para esa tarjeta
    SELECT count(*) INTO n FROM public.p_compromisos_tarjeta
     WHERE tarjeta_id = ${CARD} AND mes_periodo = date '2026-06-01' AND user_id = 1;
    IF n < 1 THEN RAISE EXCEPTION 'FAIL compromiso junio ausente'; END IF;

    -- 1 cuota: fecha 20-jun (<= cierre 18? no, dia 20 > 18 => base jul; venc 25 > 18 => sin extra)
    SELECT COALESCE(max(pendiente_id), 0) + 1 INTO v_pid FROM public.p_caja_cuarentena;
    INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, tarjeta_id, monto, fecha, cuotas, detalle, metadata)
    VALUES ( 1, 'voz', 'card_expense', ${CARD}, 500, date '2026-06-20', 1, 'test una cuota', '{"test": true}'::jsonb)
    RETURNING pendiente_id INTO v_pid;

    v_caja2 := public.fn_aprobar_cuarentena_v2(v_pid);

    SELECT count(*) INTO n FROM public.p_cuotas_detalle WHERE p_caja_id = v_caja2;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL una cuota: n=%', n; END IF;

    SELECT count(*) INTO ok_mountos FROM public.p_cuotas_detalle
     WHERE p_caja_id = v_caja2 AND abs(monto_cuota - 500) < 0.01 AND fecha_estimada_pago = date '2026-07-25';
    IF ok_mountos <> 1 THEN RAISE EXCEPTION 'FAIL una cuota fecha/monto: compra 20-jun debe caer jul-25'; END IF;

    RAISE INFO 'ALL PASS: 3-cuotas fechas ok1,ok2,ok3 + compromiso junio + 1-cuota jul-25';
END;
$do$;
SELECT 'TEST-PASS' AS verdict;
ROLLBACK;`

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const out = await res.json()
console.log(JSON.stringify(out, null, 1))