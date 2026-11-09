// tests/cuarentena/un-solo-aviso.test.js
//
//   node --test tests/cuarentena/un-solo-aviso.test.js
//
// Dueño (2026-11-02): "el aviso de información en cuarentena quedó duplicado. En lugar
// de poner que tengo dos cuarentenas, ha puesto dos sobrecitos". Y al elegir el arreglo:
// "unifica un solo aviso para ocr y voice".
//
// La Home montaba VoiceHomeFab y OcrHomeFab: dos componentes casi idénticos, con la
// misma RPC y el mismo poll, cada uno con su propio número. Ahora hay uno solo que
// cuenta todo lo pendiente y abre la bandeja, que ya tiene las pestañas por origen.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const leer = (...partes) => {
  const ruta = path.join(raiz, ...partes)
  return fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : null
}

const home = leer('src', 'pages', 'Home', 'HomePage.tsx')
const fab = leer('src', 'components', 'cuarentena', 'QuarantineHomeFab.tsx')

test('la Home monta un solo aviso de cuarentena', () => {
  assert.equal(
    (home.match(/<QuarantineHomeFab \/>/g) ?? []).length,
    1,
    'la Home no monta el aviso unico',
  )
  assert.ok(!home.includes('VoiceHomeFab'), 'sigue montado el FAB de voz')
  assert.ok(!home.includes('OcrHomeFab'), 'sigue montado el FAB de OCR')
})

test('los dos avisos viejos ya no existen', () => {
  assert.equal(leer('src', 'components', 'voice', 'VoiceHomeFab.tsx'), null, 'quedo el FAB de voz')
  assert.equal(leer('src', 'components', 'ocr', 'OcrHomeFab.tsx'), null, 'quedo el FAB de OCR')
  assert.equal(leer('src', 'components', 'voice', 'VoiceHomeFab.css'), null, 'quedo el CSS del FAB de voz')
  assert.equal(leer('src', 'components', 'ocr', 'OcrHomeFab.css'), null, 'quedo el CSS del FAB de OCR')
})

test('el aviso unico cuenta todo lo pendiente y abre la bandeja', () => {
  assert.ok(fab, 'no existe QuarantineHomeFab')
  assert.match(fab, /fn_reporte_cuarentena_pendientes/)
  assert.ok(!/countVoiceItems|countOcrItems|=== 'ocr'|=== 'voz'/.test(fab), 'el aviso unico sigue filtrando por origen')
  assert.match(fab, /navigate\('\/cuarentena'\)/)
  assert.match(fab, /setCount\(Array\.isArray\(rows\) \? rows\.length : 0\)/)
})

test('la etiqueta del aviso unico esta en los tres idiomas', () => {
  assert.match(fab, /t\('quarantine\.fab_a11y'/, 'el aviso no usa la etiqueta unificada')
  for (const archivo of ['es.ts', 'en.ts', 'pt.ts']) {
    const texto = leer('src', 'locales', archivo)
    assert.match(
      texto,
      /export const quarantine = \{[\s\S]{0,240}?fab_a11y:/,
      `falta la seccion quarantine con fab_a11y en ${archivo}`,
    )
  }
})
