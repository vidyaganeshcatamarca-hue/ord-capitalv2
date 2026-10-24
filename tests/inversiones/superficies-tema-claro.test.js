// tests/inversiones/superficies-tema-claro.test.js
//
//   node --test tests/inversiones/superficies-tema-claro.test.js
//
// S4 del dueño (2026-10-24): "En modo claro estás poniendo mal los colores, no se ven
// los fondos. Hay un fondo negro que no debería estar porque es modo claro."
//
// Lo que pasaba: `--bg-2` estaba definido SÓLO en `:root` (el tema oscuro, #1c2128).
// El bloque `warm-light` no lo redefinía, así que en modo claro todo `var(--bg-2)`
// heredaba el casi-negro y los fallbacks del CSS nunca entraban (un fallback sólo se
// usa si la variable NO existe). El bloque de detalle del presupuesto quedaba negro
// con texto marrón encima: ilegible.
//
// El test no pinea ese token suelto, sino la regla: toda superficie del tema oscuro
// tiene que estar redefinida en claro con un valor claro, y el texto que se apoya en
// ellas tiene que llegar a AA. Cualquier token nuevo que se olvide de claro cae acá.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const css = fs.readFileSync(path.join(repo, 'src/styles/index.css'), 'utf-8')

// Los comentarios se sacan antes de parsear: un comentario que menciona un token con
// dos puntos (`... --surface-2: es la superficie ...`) hace que el regex se trague la
// declaración siguiente y el token desaparece del mapa. Pasó al escribir este test.
const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')

const darkBlock = sinComentarios.slice(
  sinComentarios.indexOf(':root'),
  sinComentarios.indexOf("[data-theme='warm-light']")
)
const lightBlock = sinComentarios.slice(
  sinComentarios.indexOf("[data-theme='warm-light']"),
  sinComentarios.indexOf("[data-theme='dark']")
)

const tokensOf = (block) => {
  const out = {}
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim()
  return out
}
const dark = tokensOf(darkBlock)
const light = tokensOf(lightBlock)

const hex = (value) => {
  const m = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Luminancia relativa (WCAG 2.x). */
const luminance = ([r, g, b]) => {
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

// Las superficies que el tema oscuro define y que en claro NO pueden quedar oscuras.
const SUPERFICIES = ['--bg', '--bg-2', '--surface', '--surface-2', '--surface-3']

test('toda superficie del tema oscuro está redefinida y es clara en warm-light', () => {
  for (const token of SUPERFICIES) {
    assert.ok(dark[token], `${token} tiene que existir en el tema oscuro`)
    assert.ok(light[token], `${token} no está definida en warm-light: hereda el valor oscuro`)
    const rgb = hex(light[token])
    assert.ok(rgb, `${token} en warm-light debe ser un hex de 6 dígitos, vino ${light[token]}`)
    assert.ok(luminance(rgb) >= 0.5, `${token} = ${light[token]} no es una superficie clara`)
  }
})

test('el texto del tema claro es oscuro sobre esas superficies', () => {
  for (const token of ['--text', '--text-2', '--text-3', '--text-4']) {
    const rgb = hex(light[token])
    assert.ok(rgb, `${token} debe ser hex en warm-light, vino ${light[token]}`)
    assert.ok(luminance(rgb) <= 0.35, `${token} = ${light[token]} no es texto oscuro`)
  }
})

test('el detalle del presupuesto llega a AA en modo claro', () => {
  // Es el texto que se leía sobre el bloque negro: `.sobre-stat-label` usa --text-3.
  const ratio = contrast(hex(light['--text-3']), hex(light['--bg-2']))
  assert.ok(ratio >= 4.5, `texto sobre el detalle: ${ratio.toFixed(2)}:1, AA pide 4.5`)
})

test('el bloque de detalle y la ✕ del modal usan la superficie del tema', () => {
  const presupuestos = fs.readFileSync(path.join(repo, 'src/pages/Presupuestos/Presupuestos.css'), 'utf-8')
  for (const selector of ['.asignar-sheet-detalle', '.asignar-sheet-close']) {
    const i = presupuestos.indexOf(selector + ' {')
    assert.ok(i > 0, `falta la regla ${selector}`)
    const regla = presupuestos.slice(i, presupuestos.indexOf('}', i))
    assert.match(regla, /var\(--bg-2/, `${selector} tiene que tomar la superficie del tema`)
  }
})
