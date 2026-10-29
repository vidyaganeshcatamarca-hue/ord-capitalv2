// tests/inversiones/teclado-numerico-enter.test.js
//
//   node --test tests/inversiones/teclado-numerico-enter.test.js
//
// S1 (ronda 7, dueño): "el botón IR me esta cerrando el modal, guardandolo [...]
// tiene que funcionar como un OK, dejar el valor puesto y pasar el foco a
// ningún lado". En Android el teclado numerico muestra "IR"/"Go" y esa tecla
// dispara la sumision implicita del form: el modal se guarda y se cierra.
//
// La regla que se congela acá: TODO input de carga de valores dentro de un
// modal de inversiones lleva `enterKeyHint="done"` y el handler que cancela el
// Enter y saca el foco. No alcanza con uno de los dos: el hint cambia la
// etiqueta del teclado nativo y el handler corta la sumision cuando la tecla ya
// se apretó.
//
// El barrido es por archivo y por input, así un campo nuevo en cualquiera de los
// cinco lugares no se puede olvidar de la protección.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

// Los cinco lugares del módulo donde se abre el teclado para cargar valores.
const ARCHIVOS = [
  'src/components/inversiones/NuevaInversionModal.tsx',
  'src/components/inversiones/ActualizarValorModal.tsx',
  'src/components/inversiones/AportarCapitalModal.tsx',
  'src/components/inversiones/LiquidarInversionModal.tsx',
  'src/components/inversiones/ConfigInflacionView.tsx',
]

const leer = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

/**
 * Devuelve los inputs de carga de valores del archivo. Radios, checkboxes y
 * fechas no abren el teclado numérico y no entran en la regla.
 *
 * El tag se corta en `/>`, no en el primer `>`: un handler con arrow function
 * (`onChange={(e) => ...}`) contiene un `>` que no cierra el tag.
 */
function inputsDeValor(src) {
  const out = []
  let desde = 0
  for (;;) {
    const inicio = src.indexOf('<input', desde)
    if (inicio === -1) break
    const cierre = src.indexOf('/>', inicio)
    const fin = cierre === -1 ? src.indexOf('>', inicio) + 1 : cierre + 2
    const tag = src.slice(inicio, fin)
    desde = fin
    if (/type="(radio|checkbox|date|range|submit)"/.test(tag)) continue
    out.push(tag)
  }
  return out
}

for (const archivo of ARCHIVOS) {
  test(`${path.basename(archivo)}: ningún input de valor se guarda con el Enter del teclado`, () => {
    const src = leer(archivo)
    const inputs = inputsDeValor(src)
    assert.ok(inputs.length > 0, `${archivo} debería tener al menos un input de valor`)

    const culpables = inputs.filter((tag) => {
      const tieneProps = /NUMERIC_INPUT_ENTER_PROPS/.test(tag)
      const tieneHint = /enterKeyHint="done"/.test(tag)
      const tieneHandler = /onKeyDown=\{keepValueOnEnter\}/.test(tag)
      return !(tieneProps || (tieneHint && tieneHandler))
    })

    assert.deepEqual(
      culpables,
      [],
      `Estos inputs dejan que el Enter/IR del teclado guarde el modal:\n${culpables.join('\n')}`,
    )
  })
}

test('el handler compartido cancela el Enter y saca el foco sin enviar el form', async () => {
  const { keepValueOnEnter, NUMERIC_INPUT_ENTER_PROPS } = await import('../../src/lib/numericKeyboard.ts')

  assert.equal(NUMERIC_INPUT_ENTER_PROPS.enterKeyHint, 'done')
  assert.equal(NUMERIC_INPUT_ENTER_PROPS.onKeyDown, keepValueOnEnter)

  let prevenido = false
  let desenfocado = false
  keepValueOnEnter({
    key: 'Enter',
    preventDefault: () => { prevenido = true },
    currentTarget: { blur: () => { desenfocado = true } },
  })
  assert.equal(prevenido, true, 'Enter tiene que cancelar la sumisión implícita')
  assert.equal(desenfocado, true, 'Enter tiene que sacar el foco: el usuario elige dónde seguir')

  // Otra tecla no toca nada: el teclado tiene que seguir escribiendo normal.
  prevenido = false
  desenfocado = false
  keepValueOnEnter({
    key: '5',
    preventDefault: () => { prevenido = true },
    currentTarget: { blur: () => { desenfocado = true } },
  })
  assert.equal(prevenido, false)
  assert.equal(desenfocado, false)
})
