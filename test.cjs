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
  // Lácteos
  let res = await fetch(url + '/rest/v1/p_estructuras_egresos?select=estructura_id,user_id&nombre_cuenta=ilike.*cat_dairy*', { headers });
  let cats = await res.json();
  const catId = cats[0].estructura_id;
  const userId = cats[0].user_id;
  console.log('Lácteos ID:', catId, 'User:', userId);

  // Budgets
  res = await fetch(url + '/rest/v1/p_presupuestos?select=mes_periodo,monto_limite&estructura_egreso_id=eq.' + catId, { headers });
  let budgets = await res.json();
  console.log('Budgets:', budgets);

  // Expenses
  res = await fetch(url + '/rest/v1/p_caja?select=fecha,valor_egreso,tipo&estructura_egreso_id=eq.' + catId + '&tipo=eq.expense', { headers });
  let expenses = await res.json();
  console.log('Expenses:', expenses);
}
run();
