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

/**
 * El bloque `[data-theme='warm-light'] { ... }`.
 *
 * Se ubica con la LLAVE. Antes se usaba `indexOf` y se cortaba en el primer `}`: en
 * cuanto existe una regla temática antes del bloque (`[data-theme='warm-light']
 * .nav-item:not(.active) { ... }`, ronda 5), ese indexOf devolvía la REGLA, el bloque
 * quedaba vacío y este test marcaba todo el tema como oscuro. Un solo localizador para
 * los dos consumidores.
 */
function lightThemeBlock() {
  const start = theme.search(/\[data-theme='warm-light'\]\s*\{/)
  assert.ok(start >= 0, 'the light theme block must exist')
  const rest = theme.slice(start)
  return rest.slice(0, rest.indexOf('}'))
}

/** Tokens the light theme defines (plus the theme-independent :root ones). */
function definedTokens() {
  const root = theme.slice(theme.indexOf(':root'), theme.indexOf('}', theme.indexOf(':root')))
  // El bloque se ubica con la LLAVE, no con la primera mención del selector: cualquier
  // regla temática posterior (`[data-theme='warm-light'] .algo { ... }`) aparece antes y
  // `indexOf` cortaba ahí, dejando cero tokens y marcando todo el tema como oscuro.
  const lightBlock = lightThemeBlock()
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

test('the deletion PIN prompt offers comfortable touch targets (owner tanda 8)', () => {
  const css = stripComments(read('src/components/AppLockGate/AppLockGate.css'))
  /** Read one CSS rule by its exact selector (`.app-lock-key` is a prefix of `.app-lock-keys`). */
  const rule = (selector) => {
    const start = css.indexOf(`${selector} {`)
    assert.ok(start >= 0, `missing rule ${selector}`)
    return css.slice(start, css.indexOf('}', start))
  }
  const keyRule = rule('.app-lock-keypad--comfortable .app-lock-key')
  const minHeight = Number(/(?:min-height|height):\s*([\d.]+)rem/.exec(keyRule)?.[1])
  assert.ok(minHeight >= 3, `keys must be at least 3rem tall, got ${minHeight}rem`)
  const keysRule = rule('.app-lock-keypad--comfortable .app-lock-keys')
  const maxWidth = Number(/(?:max-)?width:\s*([\d.]+)rem/.exec(keysRule)?.[1])
  assert.ok(maxWidth >= 16, `the grid must be wider than the compact 13rem, got ${maxWidth}rem`)

  const card = read('src/components/configuracion/ConfiguracionBorradoCard.tsx')
  assert.match(card, /size="comfortable"/, 'the deletion card uses the comfortable preset')
})

// ── Regression: owner bug tanda 8 ────────────────────────────────────────────
// `.config-delete-option` painted its surface with `--bg-2`, a token the light
// theme never overrides: it belongs to the dark bottom nav (#1c2128). In light
// mode the two deletion options were dark blocks with dark text. The guard has
// to be "is this COLOR token redefined by the light theme?", not merely "does
// the token exist somewhere" — existing in :root is exactly the trap.

/** Color-looking tokens whose only definition is the dark :root palette. */
function darkOnlyColorTokens() {
  const root = theme.slice(theme.indexOf(':root'), theme.indexOf('}', theme.indexOf(':root')))
  const lightBlock = lightThemeBlock()
  const isColor = (v) => /#[0-9a-f]{3,8}|rgba?\(|hsla?\(|linear-gradient/i.test(v)
  const declared = (block) =>
    new Map([...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))

  const rootTokens = declared(root)
  const lightTokens = declared(lightBlock)
  const darkOnly = new Set()
  for (const [name, value] of rootTokens) {
    if (isColor(value) && !lightTokens.has(name)) darkOnly.add(name)
  }
  return darkOnly
}

test('the settings surface never paints itself with a dark-only colour token', () => {
  const darkOnly = darkOnlyColorTokens()
  assert.ok(darkOnly.has('bg-2'), 'sanity: --bg-2 is the dark nav surface the light theme skips')

  // Plain reds read on both backgrounds; surfaces and text colours do not.
  const allowed = new Set(['red', 'red-dim'])
  const roots = [
    'src/components/configuracion/',
    'src/pages/Configuracion/',
    'src/components/privacidad/',
    'src/components/AppLockGate/',
  ]
  const offenders = []
  for (const root of roots) {
    for (const file of fs.readdirSync(new URL(`../${root}`, import.meta.url))) {
      if (!file.endsWith('.css')) continue
      const css = stripComments(read(`${root}${file}`))
      const used = new Set([...css.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]))
      const bad = [...used].filter((t) => darkOnly.has(t) && !allowed.has(t))
      if (bad.length) offenders.push(`${root}${file}: ${bad.join(', ')}`)
    }
  }
  assert.deepEqual(offenders, [], `these tokens stay dark in the light theme: ${offenders.join(' | ')}`)
})

test('the deletion options are plain surfaced cards in both themes (owner tanda 8)', () => {
  const css = stripComments(read('src/components/configuracion/ConfiguracionHub.css'))
  const start = css.indexOf('.config-delete-option {')
  assert.ok(start >= 0, 'missing .config-delete-option')
  const optionRule = css.slice(start, css.indexOf('}', start))
  assert.match(optionRule, /background:\s*var\(--surface-2\)/, 'options use a themed surface')
  assert.ok(!/var\(--bg-2\)/.test(optionRule), '--bg-2 is the dark nav surface, never a card')
})
