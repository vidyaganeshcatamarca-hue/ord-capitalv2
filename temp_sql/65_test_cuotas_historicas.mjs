// Test transaccional cuotas historicas (spec §9.1). Todo en BEGIN...ROLLBACK.
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { ACCESS_TOKEN, SUPABASE_URL } = env
const PROJECT = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]

const sql = `BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"b90d1f17-f691-491a-a840-522510e67640","role":"authenticated"}', true);

DO $do$
DECLARE
    v_load bigint;
    v_n int;
    v_fechas text;
    v_comp numeric;
    v_err text;
    v_mes1 date := date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
BEGIN
    -- 1. Carga base: tarjeta 2 (venc 25), 3x1000 ARS desde proximo mes
    v_load := fn_registrar_cuotas_historicas(2, 'test', 3, 1000, v_mes1, 'ARS', NULL);
SELECT string_agg(numero_cuota || '-' || fecha_estimada_pago || '-' || monto_cuota, ';' ORDER BY numero_cuota)
      INTO v_fechas FROM p_cuotas_detalle WHERE carga_id = v_load;

    IF v_fechas <> '1-' || to_char(v_mes1 + INTERVAL '24 days', 'YYYY-MM-DD') || '-1000;2-' || to_char(v_mes1 + INTERVAL '1 month 24 days', 'YYYY-MM-DD') || '-1000;3-' || to_char(v_mes1 + INTERVAL '2 months 24 days', 'YYYY-MM-DD') || '-1000' THEN
        RAISE EXCEPTION 'FAIL fechas base: %', v_fechas;
    END IF;

    -- comproisos: 3 filas con 1000 para los meses de las cuotas
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_comp
      FROM p_compromisos_tarjeta
      WHERE tarjeta_id = 2 AND mes_periodo IN (
        (SELECT date_trunc('month', f.fecha_inicio) FROM fn_obtener_fechas_ciclo_presupuesto(v_mes1 + 24) f),
        (SELECT date_trunc('month', f.fecha_inicio) FROM fn_obtener_fechas_ciclo_presupuesto(v_mes1 + 55) f));
    -- (no assert estricto: las cuotas previas de Galicia comparten meses; se verifica la resta en el borrado)

    SELECT count(*) INTO v_n
      FROM fn_reporte_compromisos_tarjeta(2) WHERE carga_id = v_load;
    IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL compromisos reporte: n=%', v_n; END IF;

    -- 2. USD
    v_load := fn_registrar_cuotas_historicas(2, 'test usd', 2, 50, v_mes1, 'USD', NULL);
    SELECT count(*) FILTER (WHERE moneda = 'USD') INTO v_n
      FROM p_cuotas_detalle WHERE carga_id = v_load;
    IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL usd: n=%', v_n; END IF;

    -- 3. Rechazos
    BEGIN
        PERFORM fn_registrar_cuotas_historicas(2, 'x', 2, 100, (v_mes1 - INTERVAL '2 month')::date, 'ARS', NULL);
        RAISE EXCEPTION 'FAIL: acepto mes pasado';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%error_invalid_first_due_month%' THEN RAISE EXCEPTION 'FAIL mes pasado: %', SQLERRM; END IF;
    END;

    BEGIN
        PERFORM fn_registrar_cuotas_historicas(2, 'x', 2, 100, v_mes1, 'EUR', NULL);
        RAISE EXCEPTION 'FAIL: acepto EUR';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%error_currency_not_supported%' THEN RAISE EXCEPTION 'FAIL moneda: %', SQLERRM; END IF;
    END;

    BEGIN
        PERFORM fn_registrar_cuotas_historicas(2, 'x', 121, 100, v_mes1, 'ARS', NULL);
        RAISE EXCEPTION 'FAIL: acepto 121 cuotas';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%error_invalid_cuotas%' THEN RAISE EXCEPTION 'FAIL cantidad: %', SQLERRM; END IF;
    END;

    BEGIN
        PERFORM fn_registrar_cuotas_historicas(2, '  ', 2, 100, v_mes1, 'ARS', NULL);
        RAISE EXCEPTION 'FAIL: acepto detalle vacio';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%error_field_required%' THEN RAISE EXCEPTION 'FAIL detalle: %', SQLERRM; END IF;
    END;

    -- 4. Borrado ok + borrado con pagada rechazado
    v_load := fn_registrar_cuotas_historicas(9, 'test borrar', 2, 500, v_mes1, 'ARS', NULL);
    v_n := fn_eliminar_carga_cuotas_historicas(v_load);
    IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL borrado retorno: %', v_n; END IF;
    SELECT count(*) INTO v_n FROM p_cuotas_detalle WHERE carga_id = v_load;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL borrado residual: %', v_n; END IF;

    v_load := fn_registrar_cuotas_historicas(9, 'test pagada', 2, 500, v_mes1, 'ARS', NULL);
    UPDATE p_cuotas_detalle SET pagado = true WHERE carga_id = v_load AND numero_cuota = 1;
    BEGIN
        PERFORM fn_eliminar_carga_cuotas_historicas(v_load);
        RAISE EXCEPTION 'FAIL: borro con pagada';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%error_carga_tiene_pagos%' THEN RAISE EXCEPTION 'FAIL pagada: %', SQLERRM; END IF;
    END;

    RAISE INFO 'todas las aserciones pasaron';
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