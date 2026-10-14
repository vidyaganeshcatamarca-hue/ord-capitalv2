// Fix raiz + backfill para cuotas de tarjeta no generadas por fn_aprobar_cuarentena_v2.
// 1) Dumps the live definition, patches the card_expense branch to generate
//    p_cuotas_detalle + p_compromisos_tarjeta (same schedule formula as the manual
//    fn_registrar_gasto_tarjeta), and deploys via CREATE OR REPLACE.
// 2) Backfills the missing cuotas for orphan movements (real write, authorized).
// 3) Post-checks.
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { ACCESS_TOKEN, SUPABASE_URL } = env
const PROJECT = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]
const q = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json))
  return json
}

// ---------- 1. Patch + deploy ----------
let def = fs.readFileSync('temp_sql/_live/fn_aprobar_cuarentena_v2_32164.sql', 'utf8')
def = def.replace(/\r\n/g, '\n')

const declOld = `    v_moneda text;
    v_moneda_2 text;
    v_trans_detalle text;`
const declNew = `    v_moneda text;
    v_moneda_2 text;
    v_trans_detalle text;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_dia_compra int;
    v_monto_cuota numeric;
    v_mes_compra date;
    v_base_date date;
    v_fecha_estimada date;
    v_mes_periodo date;
    v_i int;`
if (!def.includes(declOld)) throw new Error('DECLARE block not found')
def = def.replace(declOld, declNew)

const anchor = `            COALESCE(v_rec.cuotas, 1), (v_moneda = 'USD'), v_moneda
        )
        RETURNING p_caja_id INTO v_caja_id;`
if (!def.includes(anchor)) throw new Error('card_expense INSERT not found')

const cuotasBlock = anchor + `

        -- Voice-approved card expenses must generate the same installment
        -- schedule the manual card flow generates (fn_registrar_gasto_tarjeta):
        -- one p_cuotas_detalle row per installment linked to the movement plus
        -- the monthly compromiso. Without them the purchase never appears in a
        -- card summary (bug 2026-10-13: voz movements had cuotas_totales but 0
        -- detalle rows).
        SELECT tc.dia_cierre, tc.dia_vencimiento
          INTO v_dia_cierre, v_dia_vencimiento
          FROM public.p_tarjetas_credito tc
          WHERE tc.tarjeta_id = v_rec.tarjeta_id;
        v_dia_compra := EXTRACT(DAY FROM v_rec.fecha)::int;
        v_monto_cuota := v_rec.monto / GREATEST(COALESCE(v_rec.cuotas, 1), 1);
        v_mes_compra := date_trunc('month', v_rec.fecha);
        IF v_dia_compra <= COALESCE(v_dia_cierre, v_dia_compra) THEN
            v_base_date := v_mes_compra;
        ELSE
            v_base_date := v_mes_compra + INTERVAL '1 month';
        END IF;
        IF COALESCE(v_dia_vencimiento, v_dia_compra) <= COALESCE(v_dia_cierre, v_dia_compra) THEN
            v_base_date := v_base_date + INTERVAL '1 month';
        END IF;
        FOR v_i IN 0..(GREATEST(COALESCE(v_rec.cuotas, 1), 1) - 1) LOOP
            v_fecha_estimada := (v_base_date + (v_i || ' months')::interval)
                + (COALESCE(v_dia_vencimiento, v_dia_compra) - 1) * INTERVAL '1 day';
            SELECT date_trunc('month', fecha_inicio)::date INTO v_mes_periodo
              FROM public.fn_obtener_fechas_ciclo_presupuesto(v_fecha_estimada);
            INSERT INTO public.p_cuotas_detalle (
                user_id, tarjeta_id, numero_cuota, monto_cuota, moneda,
                fecha_estimada_pago, pagado, p_caja_id
            ) VALUES (
                v_user_id, v_rec.tarjeta_id, v_i + 1, v_monto_cuota, v_moneda,
                v_fecha_estimada, false, v_caja_id
            );
            INSERT INTO public.p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
            VALUES (v_rec.tarjeta_id, v_user_id, v_monto_cuota, v_mes_periodo)
            ON CONFLICT (tarjeta_id, mes_periodo, user_id)
            DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
        END LOOP;`
def = def.replace(anchor, cuotasBlock)
fs.writeFileSync('temp_sql/54_fn_aprobar_cuarentena_v2_fix.sql', def)

await q(def)
console.log('deployed CREATE OR REPLACE fn_aprobar_cuarentena_v2 ✓')

// ---------- 2. Backfill por-usuario (con claims de cada user) ----------
// fn_obtener_fechas_ciclo_presupuesto resuelve el user via auth.uid(); corriendo
// por usuario con sus claims el mes_periodo es identico al del flujo manual.
const orphansByUser = await q(`
SELECT m.user_id, u.auth_id, count(*) movs, sum(m.cuotas_totales) cuotas
FROM p_caja m JOIN usuarios u ON u.user_id = m.user_id
WHERE m.tipo='expense' AND m.cuotas_totales > 0 AND m.tarjeta_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM p_cuotas_detalle cd WHERE cd.p_caja_id = m.p_caja_id)
GROUP BY m.user_id, u.auth_id ORDER BY m.user_id`)
console.log('usuarios con huerfanos:', JSON.stringify(orphansByUser))

const backfill = (uid) => `
WITH huerfanos AS (
    SELECT m.p_caja_id, m.user_id, m.tarjeta_id, m.valor_egreso, m.fecha, m.cuotas_totales, m.moneda,
           tc.dia_cierre, tc.dia_vencimiento
    FROM p_caja m
    JOIN p_tarjetas_credito tc ON tc.tarjeta_id = m.tarjeta_id
    WHERE m.tipo = 'expense' AND m.cuotas_totales > 0 AND m.tarjeta_id IS NOT NULL
      AND m.user_id = ${uid}
      AND NOT EXISTS (SELECT 1 FROM p_cuotas_detalle cd WHERE cd.p_caja_id = m.p_caja_id)
),
d_generadas AS (
    INSERT INTO p_cuotas_detalle (user_id, tarjeta_id, numero_cuota, monto_cuota, moneda, fecha_estimada_pago, pagado, p_caja_id)
    SELECT h.user_id, h.tarjeta_id, gs.i,
           h.valor_egreso / GREATEST(h.cuotas_totales, 1),
           h.moneda,
           CASE
             WHEN COALESCE(h.dia_vencimiento, EXTRACT(DAY FROM h.fecha)::int) <= COALESCE(h.dia_cierre, EXTRACT(DAY FROM h.fecha)::int)
             THEN date_trunc('month', CASE WHEN EXTRACT(DAY FROM h.fecha)::int > COALESCE(h.dia_cierre, EXTRACT(DAY FROM h.fecha)::int)
                                THEN h.fecha + INTERVAL '1 month' ELSE h.fecha END)
                  + INTERVAL '1 month'
                  + ((COALESCE(h.dia_vencimiento, EXTRACT(DAY FROM h.fecha)::int) - 1) * INTERVAL '1 day')
             ELSE date_trunc('month', CASE WHEN EXTRACT(DAY FROM h.fecha)::int > COALESCE(h.dia_cierre, EXTRACT(DAY FROM h.fecha)::int)
                                THEN h.fecha + INTERVAL '1 month' ELSE h.fecha END)
                  + ((COALESCE(h.dia_vencimiento, EXTRACT(DAY FROM h.fecha)::int) - 1) * INTERVAL '1 day')
           END + ((gs.i - 1) * INTERVAL '1 month'),
           false,
           h.p_caja_id
    FROM huerfanos h
    CROSS JOIN LATERAL generate_series(1, GREATEST(h.cuotas_totales, 1)) gs(i)
    RETURNING *
),
c_generadas AS (
    INSERT INTO p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
    SELECT d.tarjeta_id, d.user_id, SUM(d.monto_cuota),
           (SELECT date_trunc('month', f.fecha_inicio)::date FROM fn_obtener_fechas_ciclo_presupuesto(d.fecha_estimada_pago) f)
    FROM d_generadas d
    GROUP BY d.tarjeta_id, d.user_id, (SELECT date_trunc('month', f.fecha_inicio)::date FROM fn_obtener_fechas_ciclo_presupuesto(d.fecha_estimada_pago) f)
    ON CONFLICT (tarjeta_id, mes_periodo, user_id)
    DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false
    RETURNING compromiso_id
)
SELECT (SELECT count(*) FROM d_generadas) cuotas_creadas, (SELECT count(*) FROM c_generadas) compromisos_tocados;`

for (const row of orphansByUser) {
  const { user_id: uid, auth_id } = row

  const res = await q(`BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"${auth_id}","role":"authenticated"}', true);
${backfill(uid)}
COMMIT;`)
  console.log(`backfill user ${uid}:`, JSON.stringify(res))
}

// ---------- 3. Post-checks ----------
console.log('huerfanos restantes:', JSON.stringify(await q(`
SELECT count(*) FROM p_caja m
WHERE m.tipo='expense' AND m.cuotas_totales > 0 AND m.tarjeta_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM p_cuotas_detalle cd WHERE cd.p_caja_id = m.p_caja_id)`)))
const v1 = await q(`BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"b90d1f17-f691-491a-a840-522510e67640","role":"authenticated"}', true);
SELECT public.fn_reporte_vencimientos_tarjetas();
ROLLBACK;`)
console.log('vencimientos user1 (post backfill):')
console.log(JSON.stringify(v1, null, 1).slice(0, 1500))
