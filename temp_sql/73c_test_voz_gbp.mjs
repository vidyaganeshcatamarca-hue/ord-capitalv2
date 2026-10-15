// Test 73: la cuarentena de voz DEBE conservar amount, billetera, moneda y fecha
// cuando el backend declara una moneda no-ARS/USD (caso GBP de ariel user 198).
// Todo en BEGIN ... ROLLBACK (nada persiste). RAISE en el primer fail.
// Movimiento exacto del caso reproducido (raw_movement de pendiente_id 309).
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { ACCESS_TOKEN, SUPABASE_URL } = env
const PROJECT = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]

const AUTH_ID = '5e70854e-8cfa-4b0e-946d-64a055cc29c3' // arieldere75 user 198 (GBP)
const JOB = '00000000-0000-0000-0000-000000000073'

const MOVEMENTS = JSON.stringify([
  // Caso A: gasto GBP con billetera resuelta por backend
  {
    type: 'expense', amount: 20, destination_amount: null,
    expense_category_id: null, expense_category_name: null,
    source_wallet_id: '1358', source_wallet_name: 'Efectivo',
    destination_wallet_id: null, destination_wallet_name: null,
    card_id: null, card_name: null, income_source_id: null, income_source_name: null,
    currency: 'GBP', installments: null, date: '2026-10-15', note: null,
  },
  // Caso D (regresion): movimiento sin moneda declarada
  {
    type: 'expense', amount: 7, destination_amount: null,
    expense_category_id: null, expense_category_name: null,
    source_wallet_id: '1358', source_wallet_name: 'Efectivo',
    destination_wallet_id: null, destination_wallet_name: null,
    card_id: null, card_name: null, income_source_id: null, income_source_name: null,
    currency: null, installments: null, date: '2026-10-15', note: null,
  },
])

const sql = `BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"${AUTH_ID}","role":"authenticated"}', true);

DO $do$
DECLARE
    rows record;
    mov public.p_caja_cuarentena%ROWTYPE;
BEGIN
    FOR rows IN SELECT * FROM public.fn_cargar_movimientos_voz('${JOB}'::uuid, '${MOVEMENTS}'::jsonb)
    LOOP
        SELECT * INTO mov FROM public.p_caja_cuarentena WHERE pendiente_id = rows.pendiente_id;
        IF rows.pendiente_id IS NULL THEN
            RAISE EXCEPTION 'FAIL idx %: sin fila de cuarentena (error %)', rows.voice_movement_index, rows.error_key;
        END IF;
        IF rows.voice_movement_index = 0 THEN
            IF mov.tipo IS DISTINCT FROM 'expense' THEN RAISE EXCEPTION 'FAIL A tipo=%', mov.tipo; END IF;
            IF mov.monto IS DISTINCT FROM 20 THEN RAISE EXCEPTION 'FAIL A monto=%', mov.monto; END IF;
            IF mov.moneda IS DISTINCT FROM 'GBP' THEN RAISE EXCEPTION 'FAIL A moneda=%', mov.moneda; END IF;
            IF mov.billetera_id IS DISTINCT FROM 1358 THEN RAISE EXCEPTION 'FAIL A billetera=%', mov.billetera_id; END IF;
            IF mov.fecha IS DISTINCT FROM date '2026-10-15' THEN RAISE EXCEPTION 'FAIL A fecha=%', mov.fecha; END IF;
            -- fecha calendario intacta: el dia no se corre
            IF mov.fecha::text <> '2026-10-15' THEN RAISE EXCEPTION 'FAIL A fecha text=%', mov.fecha::text; END IF;
        ELSE
            IF mov.tipo IS DISTINCT FROM 'expense' THEN RAISE EXCEPTION 'FAIL D tipo=%', mov.tipo; END IF;
            IF mov.monto IS DISTINCT FROM 7 THEN RAISE EXCEPTION 'FAIL D monto=%', mov.monto; END IF;
            IF mov.moneda IS NOT NULL AND mov.moneda <> 'GBP' THEN RAISE EXCEPTION 'FAIL D moneda=%', mov.moneda; END IF;
            IF mov.billetera_id IS DISTINCT FROM 1358 THEN RAISE EXCEPTION 'FAIL D billetera=%', mov.billetera_id; END IF;
            IF mov.fecha IS DISTINCT FROM date '2026-10-15' THEN RAISE EXCEPTION 'FAIL D fecha=%', mov.fecha; END IF;
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: caso GBP conserva monto/billetera/moneda/fecha y el caso sin moneda no regresa';
END;
$do$;
ROLLBACK;`

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const json = await res.json()
console.log(JSON.stringify(json, null, 1))
if (!res.ok || JSON.stringify(json).includes('FAIL')) process.exit(1)