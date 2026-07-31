import json
import os
import re
import urllib.request
import urllib.error
import ssl

# Load env from .env.local
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env.local')
env = {}
with open(env_path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            k, v = line.split('=', 1)
            env[k] = v

ACCESS_TOKEN = env['ACCESS_TOKEN']
SUPABASE_URL = env['SUPABASE_URL']
project_ref = re.sub(r'https://([^\.]+)\.supabase\.co', r'\1', SUPABASE_URL)
ENDPOINT = f'https://api.supabase.com/v1/projects/{project_ref}/database/query'

base_dir = os.path.dirname(os.path.abspath(__file__))
files = [
    '01_alter_usuarios.sql',
    '02_create_p_app_sessions.sql',
    '03_idx_user_time.sql',
    '04_idx_open.sql',
    '05_fn_iniciar_sesion_app.sql',
    '06_fn_pausar_sesion_app.sql',
    '07_fn_reanudar_sesion_app.sql',
    '08_fn_finalizar_sesion_app.sql',
    '09_fn_marcar_crash_sesion.sql',
    '10_fn_resumen_uso_app.sql',
]

# Create SSL context
ctx = ssl.create_default_context()

results = []
for fname in files:
    fpath = os.path.join(base_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        sql = f.read()
    payload = json.dumps({'query': sql}).encode('utf-8')
    req = urllib.request.Request(
        ENDPOINT,
        data=payload,
        headers={
            'Authorization': f'Bearer {ACCESS_TOKEN}',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
            body = resp.read().decode('utf-8')
            status = resp.status
        results.append({'file': fname, 'status': status, 'response': body, 'error': None})
        print(f"OK {fname}: {status}")
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        results.append({'file': fname, 'status': e.code, 'response': body, 'error': str(e)})
        print(f"FAIL {fname}: {e.code} - {body}")
    except Exception as e:
        results.append({'file': fname, 'status': None, 'response': None, 'error': str(e)})
        print(f"ERROR {fname}: {e}")

# Save results
with open(os.path.join(base_dir, 'results.json'), 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2)

print("\nDone. Results saved to results.json")
