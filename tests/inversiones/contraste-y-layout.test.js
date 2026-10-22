// tests/inversiones/contraste-y-layout.test.js
// Contraste en modo claro/oscuro y alineación de las cuatro pestañas (B1, B3, B5).
//
//   node --test tests/inversiones/contraste-y-layout.test.js
//
// El módulo seQuejó tres veces por lo mismo: en modo claro el texto no se
// leía. La causa fue siempre la misma en sus tres formas:
//   1. fallbacks de color hardcodeados al tema oscuro (--text #FFFFFF, etc.);
//   2. variables que SOLO existen en :root (--bg-2, --green, --red) y por lo
//      tanto no cambian con el tema;
//   3. clases nuevas en el TSX sin su estilo en el CSS (heredaban color
//      blanco por defecto).
//
// Estos tests fijan las tres, para que un color nuevo no rompa el modo claro.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const cssFiles = [
  ...fs.readdirSync(path.join(repo, 'src', 'components', 'inversiones'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => `src/components/inversiones/${f}`),
  'src/pages/Inversiones/InversionesPage.css',
]
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')
const allCss = cssFiles.map(read).join('\n')

// ─────────────────────────── contraste ───────────────────────────────────────

test('ningún color tiene un fallback hardcodeado', () => {
  // Los fallbacks #FFFFFF / #1A1A1A / #2D2D2D etc. son del tema oscuro: en
  // modo claro el texto queda ilegible.
  const ofensivos = allCss.match(/var\(--[a-z0-9-]+,\s*#[0-9A-Fa-f]{3,8}\)/g) || []
  assert.deepEqual(ofensivos, [], `fallbacks de colorFound: ${ofensivos.join(', ')}`)
})

test('el módulo no usa variables que solo existen en :root (no siguen al tema)', () => {
  // --bg-2, --green, --red, --yellow existen solo en :root: en modo claro
  // valen lo mismo que en oscuro (el header quedaba negro sobre fondo crema).
  const soloRoot = ['--bg-2', '--green', '--red', '--yellow', '--green-dim', '--red-dim']
  for (const v of soloRoot) {
    assert.ok(
      !new RegExp(`var\\(${v}[,)]`).test(allCss),
      `${v} solo existe en :root: no cambia con el tema`
    )
  }
})

test('la página y el header usan var(--bg), que sí existe en los dos temas', () => {
  const page = read('src/pages/Inversiones/InversionesPage.css')
  const widget = read('src/components/inversiones/RendimientoRealWidget.css')
  assert.ok(page.includes('background: var(--bg)'), 'la pagina debe usar var(--bg)')
  assert.ok(
    /background:\s*var\(--bg\)/.test(widget),
    'el header sticky debe usar var(--bg) (no var(--bg-2), que es oscuro fijo)'
  )
})

test('toda clase usada en el TSX de Inflación tiene su estilo', () => {
  // La clase .config-inflacion-help se agrego en el TSX sin CSS: salia en
  // blanco sobre el fondo claro.
  const view = read('src/components/inversiones/ConfigInflacionView.tsx')
  const css = read('src/components/inversiones/ConfigInflacionView.css')
  const clases = new Set()
  for (const m of view.matchAll(/className="([^"]+)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) clases.add(c)
  }
  for (const c of clases) {
    // Las clases globales del design system no viven en el CSS del módulo.
    if (c.startsWith('btn') || c.startsWith('font-') || c === 'form-error' || c === 'form-hint') continue
    assert.ok(css.includes(`.${c}`), `falta el estilo de .${c}`)
  }
})

// ─────────────────────── alineación de las pestañas ─────────────────────────

test('las cuatro pestañas tienen el mismo padding horizontal que la página', () => {
  // Antes: Cartera 16px, Historial 56px, Gráfico 32px, Inflación 36px.
  // Ahora la página aporta los 16px y las vistas no agregan padding horizontal.
  for (const v of ['TrackRecordView', 'DistribucionView']) {
    const css = read(`src/components/inversiones/${v}.css`)
    assert.ok(
      /padding:\s*var\(--space-4\)\s+0/.test(css),
      `${v} no debe agregar padding horizontal`
    )
  }
  const config = read('src/components/inversiones/ConfigInflacionView.css')
  assert.ok(
    /padding:\s*var\(--space-5\)\s+var\(--space-4\)/.test(config),
    'la vista de Inflación es un card: su padding interno debe ser el de una tarjeta'
  )
})

test('la página tiene clearance del bottom nav y no min-height:100vh', () => {
  const page = read('src/pages/Inversiones/InversionesPage.css')
  assert.ok(
    page.includes('padding-bottom: var(--nav-clearance)'),
    'sin clearance el último botón (Guardar) queda detrás del bottom nav'
  )
  // Solo la DECLARACION (los comentarios explican el motivo y mencionan el
  // valor que se quito).
  const bloque = page.slice(page.indexOf('.inversiones-page {'), page.indexOf('.inversiones-page--loading'))
  assert.ok(
    !/^\s*min-height:\s*100vh/m.test(bloque),
    'min-height:100vh hace inalcanzable el padding final (patrón .config-page)'
  )
})

// ───────────────────────────── pestañas ──────────────────────────────────────

test('las pestañas son compactas para entrar en una sola línea', () => {
  const page = read('src/pages/Inversiones/InversionesPage.css')
  assert.ok(
    /padding:\s*8px\s+10px/.test(page),
    'los botones de pestaña deben ser compactos'
  )
  assert.ok(
    /font-size:\s*calc\(12px \* var\(--font-scale\)\)/.test(page),
    'la tipografía debe ser más chica'
  )
})

test('la pestaña de distribución se llama Gráfico', () => {
  const page = read('src/pages/Inversiones/InversionesPage.tsx')
  const es = read('src/locales/es.ts')
  assert.ok(page.includes("'tab_grafico'"), 'la pestaña debe usar la key tab_grafico')
  assert.ok(es.includes('tab_grafico: "Gráfico"'), 'la key tab_grafico debe existir')
})

// ───────────────────────────── placeholder ───────────────────────────────────

test('el ejemplo del nombre del activo no es un placeholder', () => {
  // Un placeholder parece un valor ya escrito: el ejemplo va debajo, chiquito.
  const modal = read('src/components/inversiones/NuevaInversionModal.tsx')
  assert.ok(
    !/placeholder=\{t\('placeholder_active_name'\)\}/.test(modal),
    'el ejemplo no debe estar como placeholder'
  )
  assert.ok(
    modal.includes('form-hint') && modal.includes("t('placeholder_active_name')"),
    'el ejemplo debe ir como ayuda debajo del campo'
  )
  const styles = read('src/styles/index.css')
  assert.ok(styles.includes('.form-hint'), 'debe existir el estilo .form-hint')
})
