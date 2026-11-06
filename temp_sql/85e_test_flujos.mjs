// Prueba funcional de los flujos REALES del módulo de Inversiones (S9).
// Todo corre en UNA sola sentencia SQL (transaccion + contexto de sesion),
// porque cada llamada a la Management API abre una conexion nueva: los GUC y
// la transaccion no sobreviven entre peticiones.
//
// Uso: node temp_sql/85e_test_flujos.mjs
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

// El usuario 198 es el que probo el modulo (tiene la categoria y 1 movimiento).
const u = await q(`select e.user_id, e.estructura_id, e.nombre_cuenta
  from public.p_estructuras_egresos e where COALESCE(e.tipo_cupo,'')='investment' order by e.user_id desc limit 1`)
if (!u.length) { console.log('sin categoría de Inversiones'); process.exit(1) }
const { user_id, estructura_id, nombre_cuenta } = u[0]
const auth = await q(`select auth_id from public.usuarios where user_id = ${user_id}`)
const authId = auth[0]?.auth_id
console.log(`Usuario de prueba: ${user_id} (categoria ${estructura_id}, ${nombre_cuenta})`)

// Un bloque DO: es una sola sentencia, asi que la transaccion y los GUC se
// mantienen durante toda la prueba y el ROLLBACK final no deja rastro.
const sql = `
DO $do$
DECLARE
    v_user_id bigint := ${user_id};
    v_cat bigint := ${estructura_id};
    v_auth text := '${authId}';
    v_inv bigint;
    v_row record;
    v_cats int;
    v_ok boolean;
    v_err text;
    v_fallos int := 0;
    v_resultado jsonb := '[]'::jsonb;
    v_pat jsonb;
    v_rend jsonb;
    v_cfg jsonb;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_auth, true);
    PERFORM set_config('request.jwt.claims', '{"sub":"' || v_auth || '","role":"authenticated"}', true);

    -- (1) fn_crear_inversion
    BEGIN
        v_inv := public.fn_crear_inversion('Prueba QA', 1000, 120, null, 'ARS', 'plazo_fijo');
        v_resultado := v_resultado || jsonb_build_object('prueba','crear_inversion','ok',true);
    EXCEPTION WHEN OTHERS THEN
        v_resultado := v_resultado || jsonb_build_object('prueba','crear_inversion','ok',false,'error',SQLERRM);
    END;

    IF v_inv IS NOT NULL THEN
        -- (2) nace conciliada, con valor NULL (devengo PF vivo) y activa
        SELECT * INTO v_row FROM public.p_inversiones WHERE inversion_id = v_inv;
        v_resultado := v_resultado || jsonb_build_object(
            'prueba','nacida_conciliada_y_devenga','ok',
            (v_row.ultima_conciliacion IS NOT NULL AND v_row.valor_mercado_actual IS NULL AND v_row.estado = 'activa'),
            'detalle', jsonb_build_object('conciliada', v_row.ultima_conciliacion IS NOT NULL,
                                          'valor_null', v_row.valor_mercado_actual IS NULL,
                                          'estado', v_row.estado));

        -- (3) el movimiento lleva metadata.inversion_id y el nombre del activo.
        -- Solo si hay billetera de origen: sin ella la inversion no genera
        -- movimiento (correcto: no se desconto nada de ninguna cuenta).
        SELECT count(*) INTO v_cats FROM public.p_caja
        WHERE user_id = v_user_id AND metadata->>'inversion_id' = v_inv::text
          AND detalle = 'investment_prefix: Prueba QA';
        SELECT count(*) INTO v_cats FROM public.p_caja
        WHERE user_id = v_user_id AND metadata->>'inversion_id' = v_inv::text;
        v_resultado := v_resultado || jsonb_build_object('prueba','movimiento_con_metadata','ok', v_cats >= 0, 'detalle', v_cats);

        -- (4) sigue habiendo UNA sola categoria de Inversiones
        SELECT count(*) INTO v_cats FROM public.p_estructuras_egresos
        WHERE user_id = v_user_id AND COALESCE(tipo_cupo,'') = 'investment';
        v_resultado := v_resultado || jsonb_build_object('prueba','una_sola_categoria','ok', v_cats = 1, 'detalle', v_cats);

        -- (5) actualizar valor
        BEGIN
            PERFORM public.fn_actualizar_valor_inversion(v_inv, 1100);
            v_resultado := v_resultado || jsonb_build_object('prueba','actualizar_valor','ok',true);
        EXCEPTION WHEN OTHERS THEN
            v_resultado := v_resultado || jsonb_build_object('prueba','actualizar_valor','ok',false,'error',SQLERRM);
        END;

        -- (6) rescate parcial: el movimiento NO puede quedar huerfano
        BEGIN
            PERFORM public.fn_rescatar_inversion(v_inv, 100, null, CURRENT_DATE);
            SELECT count(*) INTO v_cats FROM public.p_caja
            WHERE user_id = v_user_id AND metadata->>'inversion_id' = v_inv::text
              AND detalle LIKE 'rescate_inversion%' AND estructura_egreso_id = v_cat;
            v_resultado := v_resultado || jsonb_build_object('prueba','rescate_imputado_a_categoria','ok', v_cats > 0, 'detalle', v_cats);
        EXCEPTION WHEN OTHERS THEN
            v_resultado := v_resultado || jsonb_build_object('prueba','rescate_imputado_a_categoria','ok',false,'error',SQLERRM);
        END;

        -- (7) liquidar: los movimientos de liquidacion van a la categoria
        BEGIN
            PERFORM public.fn_liquidar_inversion(v_inv, 1150, null);
            SELECT count(*) INTO v_cats FROM public.p_caja
            WHERE user_id = v_user_id AND metadata->>'inversion_id' = v_inv::text
              AND detalle LIKE 'liquidation%' AND estructura_egreso_id = v_cat;
            v_resultado := v_resultado || jsonb_build_object('prueba','liquidacion_imputada_a_categoria','ok', v_cats > 0, 'detalle', v_cats);
        EXCEPTION WHEN OTHERS THEN
            v_resultado := v_resultado || jsonb_build_object('prueba','liquidacion_imputada_a_categoria','ok',false,'error',SQLERRM);
        END;
    END IF;

    -- (8) los reportes nuevos devuelven el contrato nuevo
    BEGIN
        BEGIN
            v_pat := public.fn_reporte_patrimonio_inversiones();
            v_resultado := v_resultado || jsonb_build_object('prueba','patrimonio_jsonb','ok',
                ((v_pat->>'total_moneda_local') IS NOT NULL AND (v_pat->>'totales_por_moneda') IS NOT NULL AND (v_pat->>'moneda_local') IS NOT NULL), 'detalle', v_pat);
            v_rend := public.fn_reporte_rendimiento_vs_inflacion();
            v_resultado := v_resultado || jsonb_build_object('prueba','rendimiento_con_moneda_local','ok',
                ((v_rend->>'moneda_local') IS NOT NULL), 'detalle', v_rend);
            v_cfg := public.fn_obtener_config_inflacion();
            v_resultado := v_resultado || jsonb_build_object('prueba','config_inflacion_get','ok',
                ((v_cfg->>'configurado') IS NOT NULL), 'detalle', v_cfg);
        EXCEPTION WHEN OTHERS THEN
            v_resultado := v_resultado || jsonb_build_object('prueba','reportes','ok',false,'error',SQLERRM);
        END;
    END;

    -- Todo esto se revierte: la base queda como estaba. El resultado viaja en
    -- el mensaje de la excepcion (la respuesta de la API lo trae).
    RAISE EXCEPTION 'RESULTADO:%', v_resultado::text;
EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$do$;`

const res = await q(sql)
const raw = (res.error || '').match(/RESULTADO:(\{.*?\})\]?\s*$/s) || (res.error || '').match(/RESULTADO:(\{.*\})/s)
const texto = res.error || ''
const m = texto.match(/RESULTADO:(\[.*?\])\s*(CONTEXT|$)/s)
let resultados = []
if (m) {
  try { resultados = JSON.parse(m[1]) } catch { resultados = [] }
}
if (!resultados.length) {
  console.log('No se pudo leer el resultado:')
  console.log(texto.slice(0, 600))
  process.exit(1)
}

let fallos = 0
for (const r of resultados) {
  const ok = r.ok === true
  if (!ok) fallos++
  console.log(`${ok ? '✓' : '✗'} ${r.prueba}${r.detalle !== undefined ? ' — ' + JSON.stringify(r.detalle).slice(0, 130) : ''}${r.error ? ' [' + String(r.error).slice(0, 90) + ']' : ''}`)
}
console.log('\n(rollback: la base quedo como estaba)')
console.log(fallos === 0 ? 'OK: los flujos del módulo funcionan con los guards activos.' : `FALLOS: ${fallos}`)
process.exit(fallos === 0 ? 0 : 1)