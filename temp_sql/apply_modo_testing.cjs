// Modo avanzado de testing: 2 claves config + override en fn_obtener_modo_app
const https = require('https');
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

(async () => {
  // 0. Los emails existen?
  const emails = await q("SELECT email, user_id, modo_app FROM usuarios WHERE email IN ('vidyaganeshcatamarca@gmail.com','arielderenovsky@yahoo.com');");
  console.log('=== emails en usuarios ===');
  console.log(JSON.stringify(emails));

  // 1. Definicion viva de la fn
  const d = await q("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'fn_obtener_modo_app' AND pronamespace = 'public'::regnamespace;");
  let def = d[0].def;

  // 2. Surgery: vars + query con email + override block
  const n1 = def.split('  v_modo_guardado       TEXT;').length - 1;
  def = def.split('  v_modo_efectivo       TEXT;').join('  v_modo_efectivo       TEXT;\n  v_email               TEXT;\n  v_testing_habilitado  BOOLEAN;\n  v_testing_user        BOOLEAN;');
  def = def.split('  SELECT modo_app INTO v_modo_guardado\n  FROM usuarios WHERE auth_id = auth.uid();').join('  SELECT modo_app, email INTO v_modo_guardado, v_email\n  FROM usuarios WHERE auth_id = auth.uid();');
  const override = [
    '',
    '  -- Override de testing: si el admin encendio modo_avanzado_testing y el',
    '  -- email esta en la lista, ve modo avanzado aunque el switch global siga OFF.',
    '  SELECT (valor = ' + "'true'" + ') INTO v_testing_habilitado',
    '  FROM app_global_config WHERE clave = ' + "'modo_avanzado_testing'" + ';',
    '',
    '  IF COALESCE(v_testing_habilitado, FALSE) AND v_email IS NOT NULL THEN',
    '    SELECT EXISTS (',
    '      SELECT 1 FROM app_global_config',
    '      WHERE clave = ' + "'modo_avanzado_testing_users'",
    '        AND v_email = ANY (string_to_array(replace(valor, ' + "' '" + ', ' + "''" + '), ' + "'," + '))',
    '    ) INTO v_testing_user;',
    '    IF v_testing_user THEN',
    '      v_modo_efectivo := ' + "'avanzado'" + ';',
    '    END IF;',
    '  END IF;',
    ''
  ].join('\n');
  const anchor = '  END;\n\n  -- Feature keys visibles para este modo';
  def = def.split(anchor).join('  END;' + override + '  -- Feature keys visibles para este modo');
  console.log('=== surgery aplicada: override presente =', def.includes('modo_avanzado_testing'));
  // 3. Aplicar la fn
  const r1 = await q(def);
  console.log('fn_obtener_modo_app aplicada:', JSON.stringify(r1));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
