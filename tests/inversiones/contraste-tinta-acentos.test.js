// tests/inversiones/contraste-tinta-acentos.test.js
//
//   node --test tests/inversiones/contraste-tinta-acentos.test.js
//
// T13 (S10) del verificador independiente: los textos de acento del módulo van sobre
// un fondo del mismo color al 12% y el color de texto era ese mismo acento, así que
// en modo claro el contraste quedaba entre 3.16 y 3.76 cuando AA pide 4.5.
// Medido: badge "Plazo Fijo" 3.32, "Variable" 3.16, "Actualizar Valor" 3.32,
// "Liquidar" 3.76, CTA de inflación 3.64. En oscuro pasan (4.88 / 7.81).
//
// La corrección son tokens de tinta por tema. Este test calcula el contraste real
// (WCAG 2.1) del texto contra el fondo compuesto, así que si alguien retoca un token
// y baja de 4.5, falla acá y no en el teléfono del dueño.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const css = read('src/styles/index.css')

/** Valor de un token en el tema claro (la segunda aparición gana). */
function token(nombre) {
  const todas = [...css.matchAll(new RegExp(`--${nombre}:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim())
  assert.ok(todas.length > 0, `falta el token --${nombre}`)
  return todas[todas.length - 1]
}

const hex = (v) => {
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim())
  assert.ok(m, `token no hex: ${v}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const rgba = (v) => {
  const m = /rgba?\(([^)]+)\)/.exec(v.trim())
  assert.ok(m, `token no rgba: ${v}`)
  const [r, g, b, a = 1] = m[1].split(',').map((x) => Number(x.trim()))
  return [r, g, b, a]
}

/** Composición alfa: el -dim (12%) sobre la superficie de la tarjeta. */
const compuesto = (frente, fondo) => {
  const [r, g, b, a] = frente
  return [r * a + fondo[0] * (1 - a), g * a + fondo[1] * (1 - a), b * a + fondo[2] * (1 - a)]
}

const luminancia = ([r, g, b]) => {
  const lin = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

const contraste = (a, b) => {
  const la = luminancia(a)
  const lb = luminancia(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const AA = 4.5

for (const acento of ['mint', 'amber', 'coral']) {
  test(`T13: la tinta ${acento} llega a AA en modo claro`, () => {
    const ink = hex(token(`${acento}-ink`))
    const dim = rgba(token(`${acento}-dim`))
    const surface = hex(token('surface'))
    const fondo = compuesto(dim, surface)
    const ratio = contraste(ink, fondo)
    assert.ok(
      ratio >= AA,
      `--${acento}-ink sobre --${acento}-dim da ${ratio.toFixed(2)}:1, AA pide ${AA}`
    )
  })
}

test('T13: el acento puro como texto ya no se usa en el módulo', () => {
  const dirs = ['src/components/inversiones', 'src/pages/Inversiones']
  const culpables = []
  for (const dir of dirs) {
    for (const f of fs.readdirSync(path.join(repo, dir)).filter((x) => x.endsWith('.css'))) {
      const src = read(`${dir}/${f}`)
      for (const acento of ['mint', 'amber', 'coral']) {
        if (new RegExp(`color:\\s*var\\(--${acento}\\)\\s*[;}]`).test(src)) {
          culpables.push(`${f} (${acento})`)
        }
      }
    }
  }
  assert.deepEqual(culpables, [], 'el texto de acento tiene que ir con la tinta, no con el acento crudo')
})

test('T13: la tinta existe en los dos temas y conserva el acento en oscuro', () => {
  for (const acento of ['mint', 'amber', 'coral']) {
    const apariciones = [...css.matchAll(new RegExp(`--${acento}-ink:\\s*([^;]+);`, 'g'))]
    assert.equal(apariciones.length, 2, `--${acento}-ink tiene que estar en oscuro y en claro`)
    assert.match(apariciones[0][1].trim(), new RegExp(`var\\(--${acento}\\)`), 'en oscuro la tinta es el acento')
  }
})

// ───────────── T15: la pestaña activa en hover ─────────────
// Medido en el navegador el 2026-10-24 con `mouse.move` real (page.hover no aplica
// :hover bajo emulación): el texto se volvía claro sobre el relleno verde.
// `.inversiones-tab:hover` tiene especificidad (0,2,0) y le ganaba a
// `.inversiones-tab--active` (0,1,0).

test('T15: la pestaña activa conserva su color en hover', () => {
  const css = read('src/pages/Inversiones/InversionesPage.css')

  const activa = /\.inversiones-tab--active\s*\{([^}]*)\}/.exec(css)
  assert.ok(activa, 'falta la regla de la pestaña activa')
  const colorActiva = /(?:^|[\s;])color:\s*([^;]+);/.exec(activa[1])
  assert.ok(colorActiva, 'la pestaña activa necesita color propio')
  assert.equal(colorActiva[1].trim(), '#000000', 'negro sobre el relleno verde')

  const hoverActiva = /\.inversiones-tab--active:hover\s*\{([^}]*)\}/.exec(css)
  assert.ok(hoverActiva, 'sin esta regla el hover (0,2,0) le gana a la activa (0,1,0)')
  assert.match(
    hoverActiva[1],
    /color:\s*#000000/,
    'en hover la activa tiene que seguir en negro, no volver a var(--text)'
  )

  // Y el negro sobre el verde del acento tiene que pasar AA.
  const mint = hex(token('mint'))
  assert.ok(contraste([0, 0, 0], mint) >= AA, 'negro sobre --mint tiene que pasar AA')
})
