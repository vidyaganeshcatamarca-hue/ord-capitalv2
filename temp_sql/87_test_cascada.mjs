// Prueba del trigger de cascada (B7) y del guard de saldo (B2).
// Todo en una transaccion con ROLLBACK.
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) return { error: json.message || JSON.stringify(json) }
  return json
}
const u = await q(`select user_id, auth_id from public.usuarios where user_id=198`)
const { user_id, auth_id } = u[0]
const r = await q(`
DO $do$
DECLARE
    v_user bigint := ${user_id};
    v_auth text := '${auth_id}';
    v_wallet bigint;
    v_inv bigint;
    v_mov bigint;
    v_saldo numeric;
    v_err text;
    v_cnt int;
    v_res jsonb := '[]'::jsonb;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_auth, true);
    PERFORM set_config('request.jwt.claims', '{"sub":"' || v_auth || '","role":"authenticated"}', true);

    SELECT billetera_id, saldo_actual INTO v_wallet, v_saldo
    FROM public.p_billeteras WHERE user_id = v_user AND moneda = 'GBP' AND activa = true
    ORDER BY saldo_actual DESC LIMIT 1;

    -- (B2) invertir mas de lo que hay debe fallar
    BEGIN
        v_inv := public.fn_crear_inversion('Prueba Saldo', v_saldo + 100000, 100, v_wallet, 'GBP', 'plazo_fijo');
        v_res := v_res || jsonb_build_object('prueba','invertir_mas_que_el_saldo_falla','ok',false,
            'detalle','NO FUE RECHAZADO (el saldo quedaria negativo)');
    EXCEPTION WHEN OTHERS THEN
        v_res := v_res || jsonb_build_object('prueba','invertir_mas_que_el_saldo_falla','ok',
            SQLERRM LIKE '%insufficient_balance%', 'detalle', SQLERRM);
    END;

    -- (B2) el saldo no debe haber cambiado
    SELECT saldo_actual INTO v_saldo FROM public.p_billeteras WHERE billetera_id = v_wallet;
    v_res := v_res || jsonb_build_object('prueba','saldo_sin_cambios','ok', v_saldo >= 0, 'detalle', v_saldo);

    -- (B7) crear una inversion valida y luego borrar su movimiento de creacion
    v_inv := public.fn_crear_inversion('Prueba Cascada', 100, 100, v_wallet, 'GBP', 'plazo_fijo');
    SELECT p_caja_id INTO v_mov FROM public.p_caja
    WHERE user_id = v_user AND metadata->>'inversion_id' = v_inv::text AND detalle LIKE 'investment_prefix:%'
    LIMIT 1;

    -- la inversion existe
    v_res := v_res || jsonb_build_object('prueba','inversion_creada','ok', v_inv IS NOT NULL AND v_mov IS NOT NULL, 'detalle', jsonb_build_object('inv',v_inv,'mov',v_mov));

    -- borrar el movimiento de creacion: la inversion debe anularse
    DELETE FROM public.p_caja WHERE p_caja_id = v_mov;
    SELECT count(*) INTO v_cnt FROM public.p_inversiones WHERE inversion_id = v_inv AND user_id = v_user;
    v_res := v_res || jsonb_build_object('prueba','borrar_movimiento_anula_inversion','ok', v_cnt = 0, 'detalle', v_cnt);

    -- el dinero volvio a la billetera
    SELECT saldo_actual INTO v_saldo FROM public.p_billeteras WHERE billetera_id = v_wallet;
    v_res := v_res || jsonb_build_object('prueba','saldo_restaurado','ok', v_saldo >= 0, 'detalle', v_saldo);

    -- (B3/B4) la fuente manual se guarda y se lee
    BEGIN
        PERFORM public.fn_configurar_inflacion('AR', 'manual', 35);
        v_res := v_res || jsonb_build_object('prueba','configurar_inflacion_manual','ok',true);
    EXCEPTION WHEN OTHERS THEN
        v_res := v_res || jsonb_build_object('prueba','configurar_inflacion_manual','ok',false,'detalle',SQLERRM);
    END;

    -- (B3/B4) la fuente manual sin valor debe fallar
    BEGIN
        PERFORM public.fn_configurar_inflacion('AR', 'manual', NULL);
        v_res := v_res || jsonb_build_object('prueba','manual_sin_valor_falla','ok',false,'detalle','NO FUE RECHAZADO');
    EXCEPTION WHEN OTHERS THEN
        v_res := v_res || jsonb_build_object('prueba','manual_sin_valor_falla','ok', SQLERRM LIKE '%manual_value_required%', 'detalle', SQLERRM);
    END;

    -- (B3/B4) api_automatica ya no es valida
    BEGIN
        PERFORM public.fn_configurar_inflacion('AR', 'api_automatica', NULL);
        v_res := v_res || jsonb_build_object('prueba','api_automatica_rechazada','ok',false,'detalle','NO FUE RECHAZADA');
    EXCEPTION WHEN OTHERS THEN
        v_res := v_res || jsonb_build_object('prueba','api_automatica_rechazada','ok', SQLERRM LIKE '%inflation_source_invalid%', 'detalle', SQLERRM);
    END;

    -- (B3/B4) el valor manual queda guardado y se lee
    v_res := v_res || jsonb_build_object('prueba','manual_guardado_y_leido','ok',
        (SELECT (public.fn_obtener_config_inflacion()->>'inflacion_manual_anual_pct')::numeric = 35),
        'detalle', public.fn_obtener_config_inflacion());

    RAISE EXCEPTION 'RESULTADO:%', v_res::text;
END;
$do$;`)
const m = (r.error || '').match(/RESULTADO:(\[.*?\])\s*(CONTEXT|$)/s)
let res = []
if (m) { try { res = JSON.parse(m[1]) } catch { res = [] } }
if (!res.length) { console.log('sin resultado:', (r.error || '').slice(0, 400)); process.exit(1) }
let fallos = 0
for (const x of res) {
  const ok = x.ok === true
  if (!ok) fallos++
  console.log(`${ok ? '✓' : '✗'} ${x.prueba} — ${JSON.stringify(x.detalle ?? x.error ?? '').slice(0, 150)}`)
}
console.log('\n(rollback: la base quedó como estaba)')
console.log(fallos === 0 ? 'OK' : `FALLOS: ${fallos}`)
process.exit(fallos === 0 ? 0 : 1)
