// tests/configPageLayout.test.js
// Owner tanda 4, bug 2: the section pages (PIN protection and the rest) had the
// bottom nav covering the last row, and could not be scrolled up — yet there
// was plenty of empty space. Cause: `.config-page` is a CSS grid with
// `min-height: 100vh`; the default `align-content: stretch` spread the leftover
// height across the auto rows, so the gaps ballooned and the action button fell
// below the fold. The page must lay its rows from the top and keep the nav
// clearance the rest of the app uses.
//
//   node --test tests/configPageLayout.test.js

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const cssPath = new URL('../src/pages/Configuracion/ConfiguracionPage.css', import.meta.url)
const css = fs.readFileSync(cssPath, 'utf-8')

function block(selector) {
  const start = css.indexOf(`${selector} {`)
  assert.ok(start > -1, `${selector} must exist`)
  return css.slice(start, css.indexOf('}', start))
}

test('the section page lays its rows from the top instead of stretching them', () => {
  const page = block('.config-page')
  assert.match(page, /align-content:\s*start/, 'auto rows must not absorb the leftover viewport height')
})

test('the section page keeps the bottom-nav clearance', () => {
  const page = block('.config-page')
  assert.match(
    page,
    /padding-bottom:\s*var\(--nav-clearance\)/,
    'the bottom padding must use the shared nav clearance (nav-height + safe area)',
  )
  assert.doesNotMatch(page, /padding:\s*[^;]*\b96px\b/, 'a flat 96px overrides the shared clearance')
})
