// fn_cargar: normalizaciones + handler que inserta fallback (no pierde filas)
const https = require('https');
const fs = require('fs');
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
        res.on('end', () => {
          try { resolve(JSON.parse(out)); } catch (e) { resolve(out); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) {
    console.error('ABORT ' + label + ': se esperaba 1 match, hay ' + count);
    process.exit(1);
  }
  return haystack.split(needle).join(replacement);
}

(async () => {
  const d = await q("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'fn_cargar_movimientos_voz' AND pronamespace = 'public'::regnamespace;");
  let def = (d[0].def || '').split('\r\n').join('\n');

  // R1: normalizaciones despues del parseo (dentro del bloque protegido)
  def = replaceOnce(
    def,
    "            v_note := NULLIF(v_movement->>'note', '');",
    [
      "            v_note := NULLIF(v_movement->>'note', '');",
      '',
      '            -- Normalizacion: valores que violarian CHECKs se vuelven NULL',
      '            -- (la cuarentena existe para datos incompletos; el usuario edita).',
      '            IF v_destination_amount IS NOT NULL AND v_destination_amount <= 0 THEN',
      '                v_destination_amount := NULL;',
      '            END IF;',
      '            IF v_installments IS NOT NULL AND v_installments <= 0 THEN',
      '                v_installments := NULL;',
      '            END IF;',
      '            v_currency := UPPER(TRIM(COALESCE(v_currency, ' + "''" + ')));',
      "            IF v_currency = '' OR v_currency NOT IN ('ARS', 'USD') THEN",
      '                v_currency := NULL;',
      '            END IF;'
    ].join('\n'),
    'normalizaciones'
  );

  // R2: el handler inserta la fila fallback (el movimiento no se pierde)
  def = replaceOnce(
    def,
    [
      '        EXCEPTION WHEN OTHERS THEN',
      '            v_ok := false;',
      "            v_error_key := 'error_voice_insert_failed';",
      '            v_pending_id := NULL;',
      '        END;'
    ].join('\n'),
    [
      '        EXCEPTION WHEN OTHERS THEN',
      '            v_ok := false;',
      "            v_error_key := 'error_voice_parse_failed';",
      '            v_pending_id := NULL;',
      '            -- El movimiento NO se pierde: cae como item incompleto editable',
      '            -- (tipo NULL, monto 0, fecha de hoy, el movimiento crudo en metadata).',
      '            BEGIN',
      '                INSERT INTO p_caja_cuarentena (',
      '                    user_id, origen, tipo, estado, monto, fecha, detalle, metadata',
      '                )',
      '                VALUES (',
      "                    v_user_id, 'api_banco', NULL, 'pendiente', 0, CURRENT_DATE, v_note,",
      "                    jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'parse_error', v_error_key, 'raw_movement', v_movement)",
      '                )',
      '                RETURNING pendiente_id INTO v_pending_id;',
      '            EXCEPTION WHEN OTHERS THEN',
      '                v_pending_id := NULL;',
      '            END;',
      '        END;'
    ].join('\n'),
    'handler fallback'
  );

  fs.writeFileSync('temp_sql/voice_fn_cargar_sanitize.sql', def);
  console.log('surgery OK. Sanitize presente:', def.includes('v_parse_failed') ? 'no (handler approach)' : 'ok', '| fallback presente:', def.includes('error_voice_parse_failed'));

  const r1 = await q(def);
  console.log('fn aplicada:', JSON.stringify(r1));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
