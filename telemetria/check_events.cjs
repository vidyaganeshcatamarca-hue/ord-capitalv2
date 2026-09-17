// Verification query for Tanda 1 telemetry events.
// Usage: node telemetria/check_events.cjs  (orquestador lo ejecuta bajo pedido del usuario)
const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${ref}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(data.slice(0, 800))); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('=== p_telemetry_events: resumen por evento (últimas 24h) ===');
  const summary = await runQuery(`
    SELECT event_name, COUNT(*) AS total,
           COUNT(DISTINCT session_id) AS sesiones,
           COUNT(DISTINCT user_id) AS usuarios,
           MIN(event_timestamp)::time AS primero,
           MAX(event_timestamp)::time AS ultimo
    FROM p_telemetry_events
    WHERE received_at >= now() - interval '24 hours'
    GROUP BY event_name
    ORDER BY total DESC;`);
  console.table(summary);

  console.log('=== Últimos 20 eventos (detalle) ===');
  const detail = await runQuery(`
    SELECT event_timestamp, event_name, platform, app_version, priority, properties
    FROM p_telemetry_events
    ORDER BY received_at DESC
    LIMIT 20;`);
  console.table(detail);

  console.log('=== Sesiones hoy (sistema previo de tiempo de uso, sin cambios) ===');
  const sessions = await runQuery(`
    SELECT status, COUNT(*) AS sesiones, COALESCE(SUM(total_active_seconds),0) AS segundos
    FROM p_app_sessions
    WHERE started_at >= CURRENT_DATE
    GROUP BY status;`);
  console.table(sessions);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });