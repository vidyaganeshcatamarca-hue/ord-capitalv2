// tests/lightModeSettings.test.js
// Owner tanda 7: in light mode the PIN keypad was invisible — the digits and the
// empty dots were white on a light card.
//
// Cause: AppLockGate.css referenced three design tokens that DO NOT exist in this
// app (`--text-primary`, `--text-secondary`, `--border-color`). CSS ignores an
// undefined custom property and falls back to the literal: `#fff` and
// rgba(255,255,255,...). Dark theme hid the mistake; light theme exposed it.
//
// The real tokens are --text / --text-2 / --text-3 / --border / --surface /
// --surface-2 (see [data-theme='warm-light'] in src/styles/index.css).
//
//   node --test tests/lightModeSettings.test.js

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8')
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const appLock = stripComments(read('src/components/AppLockGate/AppLockGate.css'))
const theme = read('src/styles/index.css')

/** Tokens the light theme defines (plus the theme-independent :root ones). */
function definedTokens() {
  const root = theme.slice(theme.indexOf(':root'), theme.indexOf('}', theme.indexOf(':root')))
  const light = theme.slice(theme.indexOf("[data-theme='warm-light']"))
  const lightBlock = light.slice(0, light.indexOf('}'))
  const tokens = [...root.matchAll(/--([a-z0-9-]+):/g), ...lightBlock.matchAll(/--([a-z0-9-]+):/g)]
  return new Set(tokens.map((m) => m[1]))
}

test('the lock screen only uses tokens the light theme defines', () => {
  const defined = definedTokens()
  assert.ok(defined.size > 10, 'the light theme must be discoverable')
  const used = [...appLock.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1])
  const phantom = [...new Set(used)].filter((t) => !defined.has(t))
  assert.deepEqual(phantom, [], `undefined tokens fall back to white: ${phantom.join(', ')}`)
})

test('the keypad keys are readable in light mode (no white-on-white)', () => {
  const keyRule = appLock.slice(appLock.indexOf('.app-lock-key {'), appLock.indexOf('}', appLock.indexOf('.app-lock-key {')))
  assert.match(keyRule, /color:\s*var\(--text\)/, 'digits use the theme text colour')
  assert.match(keyRule, /border:[^;]*var\(--border\)/, 'the key outline uses the theme border')
  assert.match(keyRule, /background:\s*var\(--surface-2\)/, 'the key gets a surface so it reads as a button')
  assert.ok(!/#fff\b/i.test(keyRule), 'no hardcoded white inside the key')
})

test('the empty PIN dots are visible on a light card', () => {
  const dotRule = appLock.slice(appLock.indexOf('.app-lock-dot {'), appLock.indexOf('}', appLock.indexOf('.app-lock-dot {')))
  assert.match(dotRule, /border:[^;]*var\(--border\)/, 'dots use the theme border')
  const filled = appLock.slice(appLock.indexOf('.app-lock-dot--filled'), appLock.indexOf('}', appLock.indexOf('.app-lock-dot--filled')))
  assert.match(filled, /background:\s*var\(--text\)/, 'the filled dot uses the theme text colour')
})

test('the lock card and its copy follow the theme', () => {
  const card = appLock.slice(appLock.indexOf('.app-lock-card {'), appLock.indexOf('}', appLock.indexOf('.app-lock-card {')))
  assert.match(card, /background:\s*var\(--surface\)/, 'the card is a theme surface')
  assert.match(card, /border:[^;]*var\(--border\)/, 'and a theme border')
  const hint = appLock.slice(appLock.indexOf('.app-lock-hint {'), appLock.indexOf('}', appLock.indexOf('.app-lock-hint {')))
  assert.match(hint, /color:\s*var\(--text-2\)/, 'hints are readable on light')
})

test('the deletion danger zone follows the theme instead of a dark palette', () => {
  const css = stripComments(read('src/components/privacidad/DeleteAccountCard.css'))
  for (const hardcoded of ['#1a0a0a', '#f8fafc', '#fecaca', '#fde68a', '#ff6b6b']) {
    assert.ok(!css.toLowerCase().includes(hardcoded), `hardcoded ${hardcoded} breaks the light theme`)
  }
  assert.match(css, /background:\s*var\(--coral-dim\)/, 'the panel uses the themed danger tint')
  assert.match(css, /\.privacidad-delete p \{[^}]*color:\s*var\(--text-2\)/, 'body copy is theme text')
  assert.match(css, /\.privacidad-delete-input \{[^}]*background:\s*var\(--surface-2\)/, 'the input is a theme surface')
  assert.match(css, /\.privacidad-delete-scheduled \{[^}]*color:\s*var\(--amber\)/, 'the scheduled note uses the theme amber')
})

test('no settings stylesheet references a token this app never defines', () => {
  const { readdirSync } = fs
  const roots = [
    'src/components/configuracion/',
    'src/pages/Configuracion/',
    'src/components/privacidad/',
    'src/components/AppLockGate/',
  ]
  const defined = definedTokens()
  // --sidebar-width is declared inside the desktop media query, not in :root.
  defined.add('sidebar-width')

  const offenders = []
  for (const root of roots) {
    for (const file of readdirSync(new URL(`../${root}`, import.meta.url))) {
      if (!file.endsWith('.css')) continue
      const css = stripComments(read(`src/${root.replace('src/', '')}${file}`.replace('src/src/', 'src/')))
      const used = [...new Set([...css.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]))]
      const phantom = used.filter((t) => !defined.has(t))
      if (phantom.length) offenders.push(`${root}${file}: ${phantom.join(', ')}`)
    }
  }

  assert.deepEqual(offenders, [], `undefined tokens fall back to literals (white in light mode):\n${offenders.join('\n')}`)
})
