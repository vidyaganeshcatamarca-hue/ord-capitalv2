// tests/settingsIcons.test.js
//
//   node --test tests/settingsIcons.test.js
//
// S7 (ronda 7, dueño): "en el menú de ajustes, todos los submenúes donde no
// tenemos iconos. Algunas opciones tienen iconos bien elegidos y otras no
// tienen ningún icono. Veamos de ponerle icono a casi todo lo que se pueda".
//
// En la captura las filas sin icono salían con un '•' genérico, porque el hub
// caía a un fallback cuando el id no estaba en su mapa. Este test recorre el
// árbol completo de las DOS versiones del menú (simple y avanzada) y exige que
// toda entrada declarada tenga icono: así una entrada nueva no puede volver a
// aparecer con un punto en silencio.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { settingsMenu } from '../src/config/settingsMenu.ts'
import { SETTING_ICONS, settingIcon, settingGroupIcon } from '../src/config/settingsIcons.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..')

/** Todos los ids del árbol, en cualquier nivel. */
function idsDelArbol(grupo, out = []) {
  out.push({ id: grupo.id, clase: 'grupo', titleKey: grupo.titleKey })
  for (const item of grupo.items ?? []) {
    out.push({ id: item.id, clase: 'fila', titleKey: item.titleKey })
  }
  for (const sub of grupo.groups ?? []) idsDelArbol(sub, out)
  return out
}

for (const [modo, arbol] of Object.entries(settingsMenu)) {
  test(`menú ${modo}: toda entrada declarada tiene icono`, () => {
    const ids = [...arbol.groups.flatMap((grupo) => idsDelArbol(grupo))]
    for (const entry of arbol.rootEntries) {
      ids.push({ id: entry.id, clase: 'raíz', titleKey: entry.titleKey })
    }

    const sinIcono = ids.filter((entry) => settingIcon(entry.id) === '•')
    assert.deepEqual(
      sinIcono.map((entry) => `${entry.clase} ${entry.id} (${entry.titleKey})`),
      [],
      'Estas entradas del menú saldrían con el punto genérico',
    )
  })
}

test('las dos versiones del menú están cubiertas (simple y avanzada)', () => {
  assert.ok(settingsMenu.simple, 'falta el árbol simple')
  assert.ok(settingsMenu.full, 'falta el árbol avanzado')
})

test('los grupos de primer nivel tienen icono propio', () => {
  for (const [modo, arbol] of Object.entries(settingsMenu)) {
    for (const grupo of arbol.groups) {
      assert.notEqual(
        settingGroupIcon(grupo.id),
        '•',
        `el grupo ${grupo.id} del menú ${modo} saldría sin icono`,
      )
    }
  }
})

test('ningún icono queda repetido dentro del mismo menú', () => {
  // Dos filas con el mismo dibujo se leen como la misma opción. Los grupos
  // llevan su propio icono y no compiten con las filas.
  for (const [modo, arbol] of Object.entries(settingsMenu)) {
    const vistos = new Map()
    const filas = [
      ...arbol.groups.flatMap((grupo) => idsDelArbol(grupo).filter((e) => e.clase === 'fila')),
      ...arbol.rootEntries.map((entry) => ({ id: entry.id, clase: 'raíz' })),
    ]
    for (const fila of filas) {
      const icono = settingIcon(fila.id)
      if (vistos.has(icono)) {
        assert.fail(
          `el icono ${icono} se repite en ${modo}: ${vistos.get(icono)} y ${fila.id}`,
        )
      }
      vistos.set(icono, fila.id)
    }
  }
})

test('el hub no vuelve a caer en los fallbacks viejos', () => {
  const hub = fs.readFileSync(
    path.join(repo, 'src/components/configuracion/ConfiguracionHub.tsx'),
    'utf-8',
  )

  // Los emojis sueltos y los puntos estaban escritos a mano en el hub: si
  // vuelven, la fuente deja de ser única y la cobertura deja de estar testeada.
  assert.doesNotMatch(hub, /'•'/, "el hub no debe tener su propio fallback '•'")
  assert.doesNotMatch(hub, /'✨'/, "el hub no debe tener su propio fallback '✨'")
  assert.match(hub, /settingIcon\(/, 'el hub resuelve el icono por el mapa compartido')
  assert.match(hub, /settingGroupIcon\(/, 'los grupos también salen del mapa compartido')
})

test('el mapa declara los iconos que el menú usa hoy', () => {
  // Ancla explícita: las dos filas que en la captura del dueño salían con punto.
  assert.equal(SETTING_ICONS.pin_protection, '🔐')
  assert.equal(SETTING_ICONS.data_deletion, '🗑️')
})
