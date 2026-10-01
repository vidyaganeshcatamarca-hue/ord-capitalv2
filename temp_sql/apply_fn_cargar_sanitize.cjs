// fn_cargar_movimientos_voz: sanitizar en vez de rechazar (autorizado)
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

  // 1. declaracion nueva
  def = replaceOnce(
    def,
    '    v_date date;\n    v_note text;',
    '    v_date date;\n    v_note text;\n    v_parse_failed boolean;',
    'decl v_parse_failed'
  );

  // 2. bloque de parseo envuelto + normalizaciones + fallback
  const OLD_PARSE = [
    "            v_tipo := v_movement->>'type';",
    "            v_amount := (v_movement->>'amount')::numeric;",
    "            v_destination_amount := NULLIF(v_movement->>'destination_amount', '')::numeric;",
    "            v_expense_category_id := NULLIF(v_movement->>'expense_category_id', '')::bigint;",
    "            v_source_wallet_id := NULLIF(v_movement->>'source_wallet_id', '')::bigint;",
    "            v_destination_wallet_id := NULLIF(v_movement->>'destination_wallet_id', '')::bigint;",
    "            v_card_id := NULLIF(v_movement->>'card_id', '')::bigint;",
    "            v_income_source_id := NULLIF(v_movement->>'income_source_id', '')::bigint;",
    "            v_currency := NULLIF(v_movement->>'currency', '');",
    "            v_installments := NULLIF(v_movement->>'installments', '')::int;",
    "            v_date := NULLIF(v_movement->>'date', '')::date;",
    "            v_note := NULLIF(v_movement->>'note', '');"
  ].join('\n');

  const NEW_PARSE = [
    '            -- Todo el parseo vive en un bloque protegido: basura en cualquier',
    '            -- campo no revienta la llamada (la cuarentena existe para datos',
    '            -- incompletos; el usuario edita lo que vino mal).',
    '            v_parse_failed := false;',
    '            BEGIN',
    "                v_tipo := v_movement->>'type';",
    "                v_amount := (v_movement->>'amount')::numeric;",
    "                v_destination_amount := NULLIF(v_movement->>'destination_amount', '')::numeric;",
    "                v_expense_category_id := NULLIF(v_movement->>'expense_category_id', '')::bigint;",
    "                v_source_wallet_id := NULLIF(v_movement->>'source_wallet_id', '')::bigint;",
    "                v_destination_wallet_id := NULLIF(v_movement->>'destination_wallet_id', '')::bigint;",
    "                v_card_id := NULLIF(v_movement->>'card_id', '')::bigint;",
    "                v_income_source_id := NULLIF(v_movement->>'income_source_id', '')::bigint;",
    "                v_currency := UPPER(TRIM(COALESCE(v_movement->>'currency', ''));",
    "                v_installments := NULLIF(v_movement->>'installments', '')::int;",
    "                v_date := NULLIF(v_movement->>'date', '')::date;",
    "                v_note := NULLIF(v_movement->>'note', '');",
    '            EXCEPTION WHEN OTHERS THEN',
    '                v_parse_failed := true;',
    '            END;',
    '',
    '            -- Normalizacion: valores que violarian CHECKs se vuelven NULL.',
    '            IF v_destination_amount IS NOT NULL AND v_destination_amount <= 0 THEN',
    '                v_destination_amount := NULL;',
    '            END IF;',
    '            IF v_installments IS NOT NULL AND v_installments <= 0 THEN',
    '                v_installments := NULL;',
    '            END IF;',
    "            IF v_currency = '' OR v_currency NOT IN ('ARS', 'USD') THEN",
    '                v_currency := NULL;',
    '            END IF;',
    '',
    '            IF v_parse_failed THEN',
    "                v_error_key := 'error_voice_parse_failed';",
    '                INSERT INTO p_caja_cuarentena (',
    '                    user_id, origen, tipo, estado, monto, fecha, detalle, moneda, metadata',
    '                )',
    '                VALUES (',
    "                    v_user_id, 'api_banco', NULL, 'pendiente', 0, CURRENT_DATE, NULL, NULL,",
    "                    jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'parse_error', v_error_key)",
    '                )',
    '                RETURNING pendiente_id INTO v_pending_id;',
    '                RETURN QUERY SELECT v_index, v_pending_id, false, v_error_key;',
    '                v_index := v_index + 1;',
    '                CONTINUE;',
    '            END IF;'
  ].join('\n');

  def = replaceOnce(def, OLD_PARSE, NEW_PARSE, 'parse block');
  fs.writeFileSync('temp_sql/voice_fn_cargar_sanitize.sql', def);
  console.log('surgery OK (2/2). Sanitize presente:', def.includes('v_parse_failed'));

  // 3. Aplicar
  const r1 = await q(def);
  console.log('fn aplicada:', JSON.stringify(r1));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
