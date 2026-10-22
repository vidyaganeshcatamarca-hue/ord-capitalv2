// tests/inversiones/modales-acciones-fijas.test.js
// Las acciones de los modales del módulo siempre visibles (S9).
//
//   node --test tests/inversiones/modales-acciones-fijas.test.js
//
// El módulo se quejó de que el botón "Guardar" no se veía. La causa es la misma
// en los tres modales: la card del modal hace scroll (`max-height: 90vh;
// overflow-y: auto`) y las acciones están al FINAL de ese scroll. Medido con
// EgoLite en modo celular real (Pixel 7, 412x915): el botón "Guardar" de
// "Nueva Inversión" queda en bottom: 940 con un viewport de 915, o sea 25px
// debajo del fold, y el scroll interno del modal es de apenas 45px.
//
// El arreglo: la card no scrollea (overflow: hidden), el FORM es el scroller
// (flex: 1 1 auto; min-height: 0; overflow-y: auto) y las acciones quedan
// FUERA del form, fijas al pie (flex: 0 0 auto). Para que el botón siga
// submits siendo submit del form, se usa el atributo `form="<id>"`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const MODALES = [
  {
    nombre: 'Nueva Inversión',
    tsx: 'src/components/inversiones/NuevaInversionModal.tsx',
    css: 'src/components/inversiones/NuevaInversionModal.css',
    prefijo: 'nueva-inversion',
  },
  {
    nombre: 'Actualizar Valor',
    tsx: 'src/components/inversiones/ActualizarValorModal.tsx',
    css: 'src/components/inversiones/ActualizarValorModal.css',
    prefijo: 'actualizar-valor',
  },
  {
    nombre: 'Liquidar',
    tsx: 'src/components/inversiones/LiquidarInversionModal.tsx',
    css: 'src/components/inversiones/LiquidarInversionModal.css',
    prefijo: 'liquidar-inversion',
  },
]

/** Devuelve el bloque del form y el de acciones, recortados por sus tags. */
function bloques(tsx, prefijo) {
  const src = read(tsx)
  const formMatch = src.match(/<form\b[\s\S]*?<\/form>/)
  assert.ok(formMatch, `${prefijo}: el modal debe tener un <form>`)
  const form = formMatch[0]
  const formStart = src.indexOf(form)
  const formEnd = formStart + form.length
  const antesDelForm = src.slice(0, formStart)
  const despuesDelForm = src.slice(formEnd)
  const acciones = `${antesDelForm}\n${despuesDelForm}`
  return { src, form, acciones }
}

for (const { nombre, tsx, css, prefijo } of MODALES) {
  test(`${nombre}: las acciones quedan fuera del form (fijas al pie)`, () => {
    const { form } = bloques(tsx, prefijo)
    assert.ok(
      !form.includes(`${prefijo}-modal-actions`),
      `${prefijo}: las acciones están dentro del <form>, o sea dentro del scroll: ` +
        'el botón Guardar queda fuera de pantalla hasta que el usuario scrollea'
    )
  })

  test(`${nombre}: el botón Guardar sigue submits siendo submit del form`, () => {
    const { src, acciones } = bloques(tsx, prefijo)
    const idForm = src.match(new RegExp(`<form[^>]*id="([^"]+)"`))
    assert.ok(idForm, `${prefijo}: el <form> necesita un id para que el botón lo pueda submits`)
    assert.ok(
      new RegExp(`type="submit"[^>]*form="${idForm[1]}"`).test(acciones) ||
        new RegExp(`form="${idForm[1]}"[^>]*type="submit"`).test(acciones),
      `${prefijo}: el botón Guardar debe llevar form="${idForm[1]}" para seguir submits ` +
        'el form aunque las acciones ya no estén dentro'
    )
  })

  test(`${nombre}: la card no scrollea; el form sí`, () => {
    const sheet = read(css)
    const card = sheet.match(new RegExp(`\\.${prefijo}-modal-card\\s*\\{([\\s\\S]*?)\\}`))
    const form = sheet.match(new RegExp(`\\.${prefijo}-modal-form\\s*\\{([\\s\\S]*?)\\}`))
    const acciones = sheet.match(new RegExp(`\\.${prefijo}-modal-actions\\s*\\{([\\s\\S]*?)\\}`))
    assert.ok(card && form && acciones, `${prefijo}: faltan reglas de card/form/actions en el CSS`)

    assert.match(card[1], /overflow:\s*hidden/, `${prefijo}: la card no debe scrollear`)
    assert.match(form[1], /overflow-y:\s*auto/, `${prefijo}: el form debe ser el scroller`)
    assert.match(form[1], /min-height:\s*0/, `${prefijo}: el form necesita min-height: 0 para poder encogerse`)
    assert.match(form[1], /flex:\s*1 1 auto/, `${prefijo}: el form debe ocupar el espacio sobrante`)
    assert.match(
      acciones[1],
      /flex:\s*0 0 auto/,
      `${prefijo}: las acciones no deben encogerse ni scrollear: van fijas al pie`
    )
  })

  test(`${nombre}: las acciones tienen fondo opaco y respetan el safe-area`, () => {
    const sheet = read(css)
    const acciones = sheet.match(new RegExp(`\\.${prefijo}-modal-actions\\s*\\{([\\s\\S]*?)\\}`))
    assert.match(
      acciones[1],
      /background:\s*var\(--surface\)/,
      `${prefijo}: las acciones necesitan fondo opaco para tapar el contenido que pasa por detrás`
    )
    assert.match(
      acciones[1],
      /env\(safe-area-inset-bottom\)/,
      `${prefijo}: las acciones deben respetar el safe-area del teléfono`
    )
  })
}
