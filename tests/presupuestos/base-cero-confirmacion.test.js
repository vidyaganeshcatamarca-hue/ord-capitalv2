// tests/presupuestos/base-cero-confirmacion.test.js
//
//   node --test tests/presupuestos/base-cero-confirmacion.test.js
//
// S6 (ronda 7, dueño): "para pasar a modo base cero debo escribir la palabra
// acepto. Busquemos una palabra más internacional... podría ser 'BASECERO' u
// otra". El token pasa a 'BASECERO' y, para que no vuelva a haber dos fuentes,
// una en el código y otra escrita a mano dentro de cada traducción, el texto
// del modal lo recibe como {token} y la validación sale del mismo módulo.
//
// Lo que se congela:
//   1. El token autoriza sin distinguir mayúsculas ni espacios de los extremos,
//      y 'ACEPTO' ya no autoriza nada.
//   2. Los tres diccionarios piden {token} en vez de escribir una palabra fija.
//   3. La pantalla no tiene ningún 'ACEPTO' hardcodeado: valida, pinta el input
//      y arma el placeholder con el token compartido.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// El traductor real necesita el harness: i18n.ts importa '@/lib/telemetry',
// que en Node plano no resuelve.
import { loadI18n } from '../i18n/support/i18n-harness.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const leer = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const { BASE_CERO_CONFIRM_TOKEN, isBaseCeroConfirmToken } = await import(
  '../../src/lib/baseCeroConfirm.ts'
)

test('el token es una sola palabra, sin tildes ni espacios', () => {
  assert.equal(BASE_CERO_CONFIRM_TOKEN, 'BASECERO')
  assert.match(BASE_CERO_CONFIRM_TOKEN, /^[A-Z]+$/)
  // La palabra que se usa en pantalla (Base Cero) tiene que estar adentro:
  // el usuario escribe el nombre del modo que ve.
  assert.match(BASE_CERO_CONFIRM_TOKEN, /^BASE[C]?/)
})

test('el token autoriza con cualquier capitalización y espacios de más', () => {
  for (const escrito of ['BASECERO', 'basecero', 'BaseCero', '  baseCero  ', 'BaSeCeRo']) {
    assert.equal(isBaseCeroConfirmToken(escrito), true, `"${escrito}" debería autorizar`)
  }
})

test('cualquier otro texto no autoriza, incluida la palabra vieja', () => {
  for (const escrito of ['', ' ', 'ACEPTO', 'acepto', 'BASECER', 'BASE CERO', 'CERO', 'SI']) {
    assert.equal(isBaseCeroConfirmToken(escrito), false, `"${escrito}" no debería autorizar`)
  }
})

for (const lang of ['es', 'en', 'pt']) {
  test(`${lang}.ts: el modal pide {token} en vez de una palabra fija`, () => {
    const src = leer(`src/locales/${lang}.ts`)

    const prompt = src.match(/^\s*activate_base_cero_confirm_prompt:\s*"(.*)",$/m)
    assert.ok(prompt, `${lang}.ts debería declarar activate_base_cero_confirm_prompt`)
    assert.match(prompt[1], /\{token\}/, 'el prompt tiene que recibir el token como placeholder')
    assert.doesNotMatch(
      prompt[1],
      /ACEPTO/,
      'la palabra vieja no puede sobrevivir dentro de la traducción: vuelve a haber dos fuentes',
    )

    const toast = src.match(/^\s*toast_write_accept_confirm:\s*"(.*)",$/m)
    assert.ok(toast, `${lang}.ts debería declarar toast_write_accept_confirm`)
    assert.match(toast[1], /\{token\}/)
    assert.doesNotMatch(toast[1], /ACEPTO/)
  })
}

test('PresupuestosPage no hardcodea el token: valida y pinta con el módulo', () => {
  const src = leer('src/pages/Presupuestos/PresupuestosPage.tsx')

  assert.doesNotMatch(src, /['"]ACEPTO['"]/, 'no puede quedar ACEPTO escrito a mano en la página')
  assert.match(src, /isBaseCeroConfirmToken\(acepto\)/, 'la validación sale del helper')
  assert.match(
    src,
    /placeholder=\{BASE_CERO_CONFIRM_TOKEN\}/,
    'el placeholder del input muestra el token vigente',
  )
  assert.match(
    src,
    /t\('activate_base_cero_confirm_prompt',\s*\{\s*token:\s*BASE_CERO_CONFIRM_TOKEN\s*\}\)/,
    'el texto del modal recibe el token vigente',
  )
})

test('el prompt dice la verdad: el texto resuelto muestra BASECERO', async () => {
  const { t, setLanguage } = await loadI18n()

  for (const lang of ['es', 'en', 'pt']) {
    setLanguage(lang)
    const texto = t('activate_base_cero_confirm_prompt', { token: BASE_CERO_CONFIRM_TOKEN })
    assert.match(texto, /BASECERO/, `${lang}: el prompt resuelto tiene que nombrar el token`)
    assert.doesNotMatch(texto, /\{token\}/, `${lang}: no puede quedar el placeholder crudo`)
  }
})
