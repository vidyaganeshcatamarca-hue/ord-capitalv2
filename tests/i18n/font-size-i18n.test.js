import { strict as assert } from 'node:assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const esPath = path.join(__dirname, '..', '..', 'src', 'locales', 'es.ts')
const content = fs.readFileSync(esPath, 'utf-8')

const required = {
  apariencia_font_size:        'Tamaño de fuente',
  apariencia_font_size_chico:   'Chico',
  apariencia_font_size_mediano: 'Mediano',
  apariencia_font_size_grande:  'Grande',
  apariencia_font_size_gigante: 'Gigante',
  font_size_saved:              'Tamaño guardado',
}

let failed = 0
for (const [key, expected] of Object.entries(required)) {
  const re = new RegExp(`^\\s*${key}:\\s*['"]${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'm')
  if (!re.test(content)) {
    console.error(`❌ Falta o es incorrecta la clave '${key}' con valor '${expected}'`)
    failed++
  } else {
    console.log(`✅ '${key}' presente`)
  }
}

if (failed > 0) { console.error(`\n❌ ${failed} claves faltantes`); process.exit(1) }
console.log('\n✅ Las 6 claves i18n del modulo Font Size estan presentes')
