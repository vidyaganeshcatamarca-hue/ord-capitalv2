// Aplica la 105 (borrar un movimiento de inversión deshace la operación) y la prueba de
// punta a punta simulando el borrado dentro de una transacción que se REVIERTE.
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())

const sql = fs.readFileSync('temp_sql/105_borrar_movimiento_revierte_inversion.sql','utf8')
const r = await q('BEGIN;\n' + sql + '\nCOMMIT;')
console.log(r?.message ? '✗ 105 falló: ' + r.message : '✓ 105 aplicada')

const def = await q(`select (pg_get_functiondef(oid) like '%investment_contribution:%') as aporte,
                            (pg_get_functiondef(oid) like '%rescate_inversion:%') as rescate,
                            (pg_get_functiondef(oid) like '%investment_prefix:%') as creacion
                       from pg_proc where proname='fn_tr_anular_inversion_al_borrar_movimiento'`)
console.log('DEFINICIÓN:', JSON.stringify(def))

const sim = `
BEGIN;
DO $$
DECLARE
    v_inv bigint; v_mov bigint; v_cap numeric; v_val numeric; v_liq numeric; v_estado text; v_fecha date;
BEGIN
    INSERT INTO public.p_inversiones (user_id, nombre_activo, monto_invertido_original, valor_mercado_actual,
                                      monto_liquidado, moneda, fecha_inicio, ultima_conciliacion, estado, tasa_anual_tna)
    VALUES (1, 'ZZ PRUEBA BORRADO', 1200000, 1200000, 0, 'ARS', CURRENT_DATE, CURRENT_DATE, 'activa', 0)
    RETURNING inversion_id INTO v_inv;

    -- ---- Caso A: borrar un APORTE devuelve capital y valor ----
    SET LOCAL session_replication_role = replica;
    INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, billetera_destino_id, valor_egreso, valor_ingreso,
                               fecha, detalle, metadata, estructura_egreso_id, moneda, valor_local, moneda_local,
                               tasa_snapshot, en_balance_activo)
    SELECT user_id, tipo, billetera_origen_id, billetera_destino_id, 200000, 0, CURRENT_DATE,
           'investment_contribution: ZZ PRUEBA', jsonb_build_object('inversion_id', v_inv, 'es_aporte', true),
           estructura_egreso_id, moneda, 200000, moneda, tasa_snapshot, true
      FROM public.p_caja WHERE p_caja_id = 5333
    RETURNING p_caja_id INTO v_mov;
    SET LOCAL session_replication_role = origin;
    DELETE FROM public.p_caja WHERE p_caja_id = v_mov;
    SELECT monto_invertido_original, valor_mercado_actual INTO v_cap, v_val
      FROM public.p_inversiones WHERE inversion_id = v_inv;
    IF v_cap <> 1000000 OR v_val <> 1000000 THEN
        RAISE EXCEPTION 'A) aporte: capital=% valor=% (esperaba 1000000/1000000)', v_cap, v_val;
    END IF;

    -- ---- Caso B: borrar un RETIRO PARCIAL devuelve el valor y limpia monto_liquidado ----
    UPDATE public.p_inversiones SET monto_liquidado = 200000, valor_mercado_actual = 800000 WHERE inversion_id = v_inv;
    SET LOCAL session_replication_role = replica;
    INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, billetera_destino_id, valor_egreso, valor_ingreso,
                               fecha, detalle, metadata, estructura_egreso_id, moneda, valor_local, moneda_local,
                               tasa_snapshot, en_balance_activo)
    SELECT user_id, tipo, billetera_origen_id, billetera_destino_id, 0, 200000, CURRENT_DATE,
           'rescate_inversion: ZZ PRUEBA', jsonb_build_object('inversion_id', v_inv),
           estructura_egreso_id, moneda, 200000, moneda, tasa_snapshot, true
      FROM public.p_caja WHERE p_caja_id = 5254
    RETURNING p_caja_id INTO v_mov;
    SET LOCAL session_replication_role = origin;
    DELETE FROM public.p_caja WHERE p_caja_id = v_mov;
    SELECT monto_liquidado, valor_mercado_actual INTO v_liq, v_val
      FROM public.p_inversiones WHERE inversion_id = v_inv;
    IF v_liq <> 0 OR v_val <> 1000000 THEN
        RAISE EXCEPTION 'B) rescate: liquidado=% valor=% (esperaba 0/1000000)', v_liq, v_val;
    END IF;

    -- ---- Caso C: si el retiro la había finalizado, vuelve a activa ----
    UPDATE public.p_inversiones
       SET monto_liquidado = 1000000, valor_mercado_actual = 0, estado = 'finalizada', fecha_liquidacion = CURRENT_DATE
     WHERE inversion_id = v_inv;
    SET LOCAL session_replication_role = replica;
    INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, billetera_destino_id, valor_egreso, valor_ingreso,
                               fecha, detalle, metadata, estructura_egreso_id, moneda, valor_local, moneda_local,
                               tasa_snapshot, en_balance_activo)
    SELECT user_id, tipo, billetera_origen_id, billetera_destino_id, 0, 200000, CURRENT_DATE,
           'rescate_inversion: ZZ PRUEBA', jsonb_build_object('inversion_id', v_inv),
           estructura_egreso_id, moneda, 200000, moneda, tasa_snapshot, true
      FROM public.p_caja WHERE p_caja_id = 5254
    RETURNING p_caja_id INTO v_mov;
    SET LOCAL session_replication_role = origin;
    DELETE FROM public.p_caja WHERE p_caja_id = v_mov;
    SELECT monto_liquidado, estado, fecha_liquidacion INTO v_liq, v_estado, v_fecha
      FROM public.p_inversiones WHERE inversion_id = v_inv;
    IF v_liq <> 800000 OR v_estado <> 'activa' OR v_fecha IS NOT NULL THEN
        RAISE EXCEPTION 'C) finalizada: liquidado=% estado=% fecha=% (esperaba 800000/activa/null)', v_liq, v_estado, v_fecha;
    END IF;

    RAISE NOTICE 'los tres casos revierten bien';
END $$;
ROLLBACK;
`
const s = await q(sim)
console.log(s?.message ? '✗ SIMULACIÓN FALLÓ: ' + s.message : '✓ SIMULACIÓN OK (los tres casos, y se revirtió todo)')
console.log('datos de prueba que quedaron:', JSON.stringify(await q(`select count(*) as n from p_inversiones where nombre_activo = 'ZZ PRUEBA BORRADO'`)))
console.log('estado real intacto:', JSON.stringify(await q(`select inversion_id, nombre_activo, monto_invertido_original, valor_mercado_actual, monto_liquidado from p_inversiones where estado='activa' order by inversion_id`)))
