// tests/settingsClearance.test.js
// Owner tanda 4 (bug 2 + this batch): the bottom of every settings screen was
// being eaten by the fixed bottom nav — the last row/button sat under the menu
// and there was no way to scroll it into view.
//
// Two causes are pinned here:
//   1. `min-height: 100vh` on a page that is itself the scroll container.
//      `100vh` is the LARGE viewport on mobile (URL bar collapsed), so the
//      element ends up taller than its clip box: the padding plus the last row
//      live below the visible area and `overflow-y: auto` cannot reach them —
//      the box clips, not the content.
//   2. A flat bottom padding shorter than the real nav clearance on devices
//      with a gesture bar (`--safe-bottom`).
//
//   node --test tests/settingsClearance.test.js

import fs from 'node:fs'
import { readdirSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const pagesDir = new URL('../src/pages/Configuracion/', import.meta.url)
const stylesheet = fs.readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf-8')
const configCss = fs.readFileSync(new URL('../src/pages/Configuracion/ConfiguracionPage.css', import.meta.url), 'utf-8')
const notifCss = fs.readFileSync(new URL('../src/pages/Configuracion/NotificacionesPage.css', import.meta.url), 'utf-8')

/** Declarations only: the explanatory comments must not trip the assertions. */
const code = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Screens reachable from Ajustes that render their own <main>. */
const settingsScreens = readdirSync(pagesDir)
  .filter((f) => f.endsWith('Page.tsx'))
  .map((f) => ({ file: f, source: fs.readFileSync(new URL(f, pagesDir), 'utf-8') }))
  .filter(({ source }) => source.includes('<main'))

test('the shared nav clearance token exists and is the only source of the value', () => {
  assert.match(
    stylesheet,
    /--nav-clearance:\s*calc\(var\(--nav-height\)\s*\+\s*var\(--safe-bottom\)\s*\+\s*var\(--space-4\)\)/,
    '--nav-clearance must combine nav height, safe area and breathing room',
  )
})

test('every settings screen scrolls inside the shared .page container', () => {
  assert.ok(settingsScreens.length >= 10, 'the settings screens must be discovered')
  for (const { file, source } of settingsScreens) {
    assert.match(source, /<main className="page[ "]/, `${file} must be a .page scroller (clearance + own scroll)`)
  }
})

test('no settings page is taller than its clip box (100vh on the scroller)', () => {
  for (const [file, css] of [['ConfiguracionPage.css', code(configCss)]]) {
    assert.doesNotMatch(css, /min-height:\s*100vh/, `${file} must not size the scroll container with 100vh`)
  }
})

test('the settings page paddings clear the real nav height', () => {
  assert.match(code(configCss), /padding-bottom:\s*var\(--nav-clearance\)/, 'config-page uses the shared clearance')
  assert.match(code(notifCss), /padding-bottom:\s*var\(--nav-clearance\)/, 'notif-page uses the shared clearance')
  assert.doesNotMatch(code(notifCss), /padding-bottom:\s*\d+px/, 'a flat padding ignores the safe area')
})
