// DEBUG temporal: el handler expone SQLERRM
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
    console.error('ABORT ' + label + ': hay ' + count);
    process.exit(1);
  }
  return haystack.split(needle).join(replacement);
}

(async () => {
  const d = await q("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'fn_cargar_movimientos_voz' AND pronamespace = 'public'::regnamespace;");
  let def = (d[0].def || '').split('\r\n').join('\n');
  def = replaceOnce(
    def,
    "            v_error_key := 'error_voice_parse_failed';",
    "            v_error_key := 'DEBUG: ' || SQLERRM;",
    'sqlerrm'
  );
  const r1 = await q(def);
  console.log('fn con SQLERRM:', JSON.stringify(r1));

  const probe = await q("SELECT set_config('request.jwt.claims', '{\\\"sub\\\":\\\"b90d1f17-f691-491a-a840-522510e67640\\\"}', false) AS cfg; SELECT jsonb_agg(to_jsonb(r)) AS resultado FROM public.fn_cargar_movimientos_voz(gen_random_uuid(), jsonb_build_array(jsonb_build_object('type','expense','amount','25000','date',CURRENT_DATE::text,'note','probe','currency','ARS'))) r; ROLLBACK;");
  console.log('=== probe con SQLERRM ===');
  console.log(JSON.stringify(probe, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
