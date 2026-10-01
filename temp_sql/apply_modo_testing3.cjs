// Modo testing override v3: dedup-aware (la 1ra pasada ya inserto las vars)
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
  const d = await q("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'fn_obtener_modo_app' AND pronamespace = 'public'::regnamespace;");
  let def = (d[0].def || '').split('\r\n').join('\n');
  console.log('estado actual: v_email declarada =', def.includes('v_email'), '| SELECT con email =', def.includes('INTO v_modo_guardado, v_email'), '| override =', def.includes('modo_avanzado_testing'));

  // 1. Declaraciones: solo si NO estan (la 1ra pasada ya las dejo)
  if (!def.includes('v_testing_user        BOOLEAN;')) {
    def = replaceOnce(
      def,
      '  v_modo_efectivo       TEXT;',
      '  v_modo_efectivo       TEXT;\n  v_email               TEXT;\n  v_testing_habilitado  BOOLEAN;\n  v_testing_user        BOOLEAN;',
      'declaraciones'
    );
  } else {
    console.log('declaraciones ya presentes (1ra pasada) — skip');
  }

  // 2. Query del usuario con email
  if (!def.includes('INTO v_modo_guardado, v_email')) {
    def = replaceOnce(
      def,
      '  SELECT modo_app INTO v_modo_guardado\n  FROM usuarios WHERE auth_id = auth.uid();',
      '  SELECT modo_app, email INTO v_modo_guardado, v_email\n  FROM usuarios WHERE auth_id = auth.uid();',
      'query email'
    );
  } else {
    console.log('query email ya presente — skip');
  }

  // 3. Override block (aun no existe)
  if (!def.includes('modo_avanzado_testing')) {
    const anchor = "    ELSE 'simple'\n  END;\n\n  -- Feature keys visibles para este modo";
    const override = [
      "    ELSE 'simple'\n  END;",
      '',
      "  -- Override de testing: si el admin encendio modo_avanzado_testing y el",
      '  -- email esta en la lista, ve modo avanzado aunque el switch global siga OFF.',
      "  SELECT (valor = 'true') INTO v_testing_habilitado",
      "  FROM app_global_config WHERE clave = 'modo_avanzado_testing';",
      '',
      '  IF COALESCE(v_testing_habilitado, FALSE) AND v_email IS NOT NULL THEN',
      '    SELECT EXISTS (',
      '      SELECT 1 FROM app_global_config',
      "      WHERE clave = 'modo_avanzado_testing_users'",
      "        AND v_email = ANY (string_to_array(replace(valor, ' ', ''), ','))",
      '    ) INTO v_testing_user;',
      '    IF v_testing_user THEN',
      "      v_modo_efectivo := 'avanzado';",
      '    END IF;',
    '  END IF;',
      '',
      '  -- Feature keys visibles para este modo'
    ].join('\n');
    def = replaceOnce(def, anchor, override, 'override block');
  } else {
    console.log('override ya presente — skip');
  }

  fs.writeFileSync('temp_sql/voice_modo_testing_fn.sql', def);

  // 4. Aplicar
  const r1 = await q(def);
  console.log('fn aplicada:', JSON.stringify(r1));

  // 5. Verificacion: simulacion SIN auth.uid()
  const v = await q("WITH cfg AS (SELECT u.email, u.modo_app, (SELECT (valor = 'true') FROM app_global_config WHERE clave = 'modo_avanzado_habilitado') AS g, (SELECT (valor = 'true') FROM app_global_config WHERE clave = 'modo_avanzado_testing') AS t, (SELECT valor FROM app_global_config WHERE clave = 'modo_avanzado_testing_users') AS testing_users FROM usuarios u WHERE u.email IN ('vidyaganeshcatamarca@gmail.com','arielderenovsky@yahoo.com')) SELECT email, modo_app, CASE WHEN t = TRUE AND email = ANY(string_to_array(replace(testing_users, ' ', ''), ',')) THEN 'avanzado' WHEN g = TRUE THEN modo_app ELSE 'simple' END AS modo_efectivo_final FROM cfg;");
  console.log('=== modo efectivo simulado (post-fix) ===');
  console.log(JSON.stringify(v, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
