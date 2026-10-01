import fs from 'fs'
const src = fs.readFileSync('src/components/CategoryIcon/CategoryIcon.tsx','utf8')
const imp = src.match(/import {([\s\S]*?)} from 'lucide-react'/)[1]
const impNames = new Set(imp.match(/[A-Z][A-Za-z0-9]*/g))
const mapBlock = src.match(/const ICON_MAP[\s\S]*?\n};\n/)
const mapNames = ((mapBlock ? mapBlock[0] : '').match(/[A-Z][A-Za-z0-9]*(?=\s*:)/g)) || []
for (const n of mapNames) impNames.add(n)
console.log('ICON_MAP known names:', impNames.size)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const PAT = process.env.ACCESS_TOKEN
const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + projectRef + '/database/query', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + PAT }, body: JSON.stringify({ query }) })
  return res.json()
}
const total = await q("SELECT count(*) AS n FROM p_estructuras_egresos WHERE icono ~ '^[A-Z][A-Za-z0-9]+$'")
console.log('TOTAL rows with lucide-name icon:', JSON.stringify(total))
const distinct = await q("SELECT DISTINCT icono FROM p_estructuras_egresos WHERE icono ~ '^[A-Z][A-Za-z0-9]+$'")
const unknown = distinct.map(r => r.icono).filter(v => !impNames.has(v))
console.log('DISTINCT values:', distinct.length, '| NOT resolvable (fallback Tag):', JSON.stringify(unknown))
const byUser = await q("SELECT user_id, count(*) AS n FROM p_estructuras_egresos WHERE icono ~ '^[A-Z][A-Za-z0-9]+$' GROUP BY user_id ORDER BY n DESC LIMIT 15")
console.log('BY USER:', JSON.stringify(byUser))
