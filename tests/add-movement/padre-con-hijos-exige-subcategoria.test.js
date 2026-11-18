// tests/add-movement/padre-con-hijos-exige-subcategoria.test.js
//
//   node --test tests/add-movement/padre-con-hijos-exige-subcategoria.test.js
//
// Dueño: "Si un padre tiene subcategorías, los nuevos gastos deben imputarse a una
// subcategoría elegida. No usar automáticamente la primera ni registrar silenciosamente
// en el padre. Los gastos históricos deben seguir computándose."
//
// Antes del cambio, `selectCatEgreso` resolvía un padre con hijos con
// `const hijo = sinDetalle ?? rubro.hijos[0]`: cuando el padre no tenía un hijo
// "sin detalle", el gasto nuevo caía en la PRIMERA subcategoría, elegida por el código
// y no por la persona. Estos tests son estáticos (leen el fuente) porque la regla vive en
// una rama de decisión, no en un cálculo: si alguien vuelve a poner el atajo, falla acá.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const leer = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8')

const modal = leer('src', 'components', 'AddMovementModal', 'AddMovementModal.tsx')

test('no queda ningun fallback al primer hijo del padre', () => {
  assert.ok(!/hijos\[0\]/.test(modal), 'volvio el atajo hijos[0]: el sistema elige la subcategoria por el usuario')
  assert.ok(!/sinDetalle\s*\?\?/.test(modal), 'volvio el encadenado sinDetalle ?? <algo>: el padre puede terminar en un hijo arbitrario')
})

test('el hijo "sin detalle" se sigue resolviendo solo', () => {
  assert.match(
    modal,
    /const sinDetalle = rubro\.hijos\.find\(h => h\.nombre_cuenta === 'no_detail'/,
    'no se busca el hijo no_detail: se perdio el caso "no detallar"'
  )
  assert.match(modal, /h\.nombre_cuenta\.toLowerCase\(\)\.includes\('sin detalle'\)/, 'no se reconoce el nombre "sin detalle"')
  assert.match(modal, /h\.nombre_cuenta\.toLowerCase\(\)\.includes\('\[sin'\)/, 'no se reconoce el nombre "[sin ...]"')
})

test('sin hijo "sin detalle" la categoria queda sin resolver y se piden las subcategorias', () => {
  // El resolutor devuelve null en vez de inventar un hijo.
  assert.match(modal, /if \(!sinDetalle\) return null/, 'el resolutor no devuelve null cuando el padre no tiene hijo sin detalle')
  // La seleccion detecta ese null y no avanza al paso de monto.
  assert.match(
    modal,
    /if \(!resuelta\) \{\s*\n\s*\/\/[^\n]*\n\s*pedirSubcategoria\(rubro\)\s*\n\s*return/,
    'la seleccion no corta el flujo y pide la subcategoria cuando el padre no se puede resolver'
  )
  // Y las subcategorias se muestran abiertas, con el aviso a la vista.
  assert.match(modal, /const pedirSubcategoria = useCallback\(\(rubro\?: Rubro\) => \{/, 'no existe el pedido explicito de subcategoria')
  assert.match(
    modal,
    /setExpandedRubros\(prev => \(\{ \.\.\.prev, \[rubro\.estructura_id\]: true \}\)\)/,
    'no se despliegan las subcategorias del padre elegido'
  )
  assert.match(modal, /if \(isMobile\) setMobileShowAllCat\(true\)/, 'en movil no se abre el selector de subcategorias')
  assert.match(modal, /setShowAllCat\(true\)/, 'en escritorio no se abre la lista completa para elegir la subcategoria')
  // El aviso depende de un estado que se limpia al elegir: se puede salir y elegir otra.
  assert.match(modal, /const \[catPadrePendienteId, setCatPadrePendienteId\] = useState<number \| null>\(null\)/, 'no hay estado para el padre pendiente de subcategoria')
  assert.match(modal, /catPadrePendienteId !== null && \(/, 'el aviso no se muestra condicionado al padre pendiente')
  assert.match(modal, /if \(isMobile && !mobileShowAllCat\) setCatPadrePendienteId\(null\)/, 'el aviso no se limpia al cerrar el selector')
})

test('el camino feliz sigue avanzando al monto', () => {
  // El paso de monto NO se perdio: sigue en la seleccion resuelta.
  assert.match(modal, /setCategoriaEgreso\(resuelta\)/, 'la categoria resuelta no se guarda')
  assert.match(modal, /setPaso\('monto'\)/, 'desaparecio el avance al paso de monto')
})

test('el aviso sale de i18n y esta en los tres diccionarios', () => {
  assert.match(modal, /t\('add_move_choose_subcategory'\)/, 'el componente no usa la clave de traduccion')
  assert.ok(!/dividida en subcategor/i.test(modal), 'el aviso sigue hardcodeado en español dentro del componente')
  for (const archivo of ['es.ts', 'en.ts', 'pt.ts']) {
    assert.match(
      leer('src', 'locales', archivo),
      /add_move_choose_subcategory:\s*"[^"]+"/,
      `falta la clave add_move_choose_subcategory en ${archivo}`
    )
  }
})
