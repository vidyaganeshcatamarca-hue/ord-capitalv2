// Fix de las aserciones del runner (la fn esta bien; las expectativas estaban mal)
const fs = require('fs');
const f = 'temp_sql/voice_cargar_test_runner.sql';
let s = fs.readFileSync(f, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) {
    console.error('ABORT ' + label + ': hay ' + count);
    process.exit(1);
  }
  return haystack.split(needle).join(replacement);
}

// caso3: 'ars' se NORMALIZA a 'ARS' (comportamiento correcto de la fn)
s = replaceOnce(
  s,
  "    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.moneda IS NULL;\n    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso3_moneda_ars_a_null',",
  "    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.moneda = 'ARS';\n    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso3_moneda_ars_normalizada',",
  'caso3 assert'
);

// caso6: tipo basura -> fallback (tipo NULL + parse_failed)
s = replaceOnce(
  s,
  "    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.metadata->>'parse_error' = 'error_voice_invalid_type';\n    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso6_tipo_basura_parse_error',",
  "    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.tipo IS NULL\n        AND v_db_row.metadata->>'parse_error' = 'error_voice_parse_failed';\n    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso6_tipo_basura_fallback',",
  'caso6 assert'
);

// caso3b nuevo: moneda EUR -> NULL (antes del caso4)
s = replaceOnce(
  s,
  "    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows\n    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(\n        jsonb_build_object('type','expense','amount','50','date','ayer')\n    )) r;",
  [
    "    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows",
    '    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(',
    "        jsonb_build_object('type','expense','amount','50','currency','EUR')",
    '    )) r;',
    '    v_row := v_rows->0;',
    '    SELECT * INTO v_db_row FROM p_caja_cuarentena WHERE pendiente_id = (v_row->>' + "'pendiente_id'" + ')::bigint;',
    "    v_ok := (v_row->>'pendiente_id') IS NOT NULL AND v_db_row.moneda IS NULL;",
    "    v_detail := v_detail || jsonb_build_array(jsonb_build_object('assertion','caso3b_moneda_eur_a_null','ok',COALESCE(v_ok,false),'error',CASE WHEN v_ok THEN NULL ELSE jsonb_build_object('row',v_row,'db_moneda',v_db_row.moneda)::text END));",
    '    IF NOT COALESCE(v_ok,false) THEN v_all_ok := false; END IF;',
    '',
    "    SELECT jsonb_agg(to_jsonb(r)) INTO v_rows",
    '    FROM fn_cargar_movimientos_voz(v_job_id, jsonb_build_array(',
    "        jsonb_build_object('type','expense','amount','50','date','ayer')",
    '    )) r;'
  ].join('\n'),
  'caso3b insert'
);

fs.writeFileSync(f, s);
console.log('runner: 2 asserts corregidos + caso3b agregado');
