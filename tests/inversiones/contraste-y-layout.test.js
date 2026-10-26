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

/**
 * Tokens de COLOR que el tema claro no redefine (en claro valen lo mismo que en oscuro).
 *
 * El bloque claro se ubica con su LLAVE: una regla temática anterior
 * (`[data-theme='warm-light'] .algo { ... }`) haría que un indexOf devuelva la regla en
 * vez del bloque de tokens. Es la tercera vez que este patrón muerde, así que acá queda
 * calculado y no listado.
 */
function darkOnlyColorTokens() {
  const theme = read('src/styles/index.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const iRoot = theme.indexOf(':root')
  const iLight = theme.search(/\[data-theme='warm-light'\]\s*\{/)
  assert.ok(iRoot >= 0 && iLight > iRoot, 'los bloques de tema tienen que existir')
  const rootBlock = theme.slice(iRoot, theme.indexOf('}', iRoot))
  const lightBlock = theme.slice(iLight, theme.indexOf('}', iLight))
  const declared = (block) =>
    new Map([...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
  const root = declared(rootBlock)
  const light = declared(lightBlock)
  // Un COLOR, no cualquier valor que lo mencione: `--shadow-sm` vale
  // "0 1px 2px rgba(0,0,0,.05)" y es legítimamente igual en los dos temas, así que
  // el valor tiene que EMPEZAR con el color (o ser un degradado).
  const isColor = (v) => /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|linear-gradient)/i.test(v)
  return [...root.entries()]
    .filter(([token, value]) => isColor(value) && !light.has(token))
    .map(([token]) => `--${token}`)
}

// ─────────────────────────── contraste ───────────────────────────────────────

test('ningún color tiene un fallback hardcodeado', () => {
  // Los fallbacks #FFFFFF / #1A1A1A / #2D2D2D etc. son del tema oscuro: en
  // modo claro el texto queda ilegible.
  const ofensivos = allCss.match(/var\(--[a-z0-9-]+,\s*#[0-9A-Fa-f]{3,8}\)/g) || []
  assert.deepEqual(ofensivos, [], `fallbacks de colorFound: ${ofensivos.join(', ')}`)
})

test('el módulo no usa variables que solo existen en :root (no siguen al tema)', () => {
  // Esta lista estaba escrita a mano y envejeció: incluía `--bg-2`, que dejó de ser
  // exclusiva de :root cuando el tema claro la definió (ronda 4: el header quedaba negro
  // sobre fondo crema). Una lista fija no puede seguir al tema, así que el conjunto se
  // calcula desde los dos bloques.
  const soloRoot = darkOnlyColorTokens()
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

// ─────────────────────────── cabecera sticky (B6) ─────────────────────────────

test('la cabecera sticky NO recorta su contenido', () => {
  // 'overflow-x: hidden' + 'overflow-y: visible' NO recorta solo en
  // horizontal: por regla de CSS el visible se computa a auto cuando el
  // otro eje no es visible. El header se volvia contenedor de scroll propio,
  // recortaba el total por abajo y el boton se le superponia.
  const widget = read('src/components/inversiones/RendimientoRealWidget.css')
  // Solo la regla del header: los comentarios mencionan 'overflow' y las
  // lineas de moneda si lo necesitan (con ellipsis).
  const i = widget.indexOf('.rendimiento-real-widget {')
  const bloque = widget.slice(i, widget.indexOf('}', i))
  const declaraciones = bloque
    .split(String.fromCharCode(10))
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .filter((l) => /overflow/.test(l))
  assert.deepEqual(
    declaraciones, [],
    `el header sticky no debe declarar overflow (lo computa a auto y recorta): ${declaraciones.join(' | ')}`
  )
})

test('la cabecera sticky se pinta por encima del boton y las pestanas', () => {
  const widget = read('src/components/inversiones/RendimientoRealWidget.css')
  const page = read('src/pages/Inversiones/InversionesPage.css')
  assert.ok(
    /position:\s*sticky/.test(widget) && /z-index:\s*10/.test(widget),
    'la cabecera debe ser sticky con z-index 10'
  )
  // El toolbar y las pestanas: position relative + z-index bajo.
  for (const sel of ['.inversiones-toolbar', '.inversiones-tabs']) {
    const i = page.indexOf(sel + ' {')
    const bloque = page.slice(i, page.indexOf('}', i))
    assert.ok(
      /position:\s*relative/.test(bloque) && /z-index:\s*1/.test(bloque),
      `${sel} debe tener position relative y z-index 1 para no tapar la cabecera`
    )
  }
})
