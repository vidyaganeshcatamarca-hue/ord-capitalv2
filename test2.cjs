const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/\"/g, '').trim();
});
const url = env['VITE_SUPABASE_URL'];
const key = env['VITE_SUPABASE_ANON_KEY'];

async function run() {
  const headers = { 'apikey': key, 'Authorization': 'Bearer ' + key };
  let res = await fetch(url + '/rest/v1/p_estructuras_egresos?select=estructura_id,nombre_cuenta', { headers });
  let cats = await res.json();
  console.log(cats);
}
run();
