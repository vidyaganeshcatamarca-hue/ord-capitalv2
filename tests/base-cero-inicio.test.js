// tests/base-cero-inicio.test.js
//
//   node --test tests/base-cero-inicio.test.js
//
// S11 (ronda 7, dueño): el interruptor "Base 0 como pantalla de inicio" existía
// en Ajustes > Datos y operaciones > Presupuesto y ciclo, pero no hacía nada:
// escribía localStorage y emitía un evento que nadie escuchaba. Lo que pedía el
// dueño:
//
//   ON  → Base 0 reemplaza a HOME como primera opción del menú, HOME queda
//         segunda, Cuentas tercera y Menú cuarto; y es la primera pantalla que
//         ve el usuario al entrar a la app.
//   OFF → todo vuelve al estado normal del HOME.
//
// Este test congela el contrato puro (orden y aterrizaje) y verifica que los
// consumidores reales estén cableados: sin eso, la preferencia vuelve a ser un
// valor guardado que no cambia nada.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BASE_CERO_HOME_KEY,
  BASE_CERO_HOME_PATH,
  orderNavPaths,
  readBaseCeroHome,
  resolveLandingPath,
} from '../src/lib/baseCeroHome.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..')

const leer = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

/** localStorage falso, para no depender del navegador. */
function storageFalso(inicial = {}) {
  const datos = { ...inicial }
  return {
    datos,
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => {
      datos[k] = String(v)
    },
  }
}

test('la preferencia se lee de la clave que ya usaba la pantalla de ajustes', () => {
  assert.equal(BASE_CERO_HOME_KEY, 'base_cero_como_inicio')
  assert.equal(readBaseCeroHome(storageFalso({ [BASE_CERO_HOME_KEY]: 'true' })), true)
  assert.equal(readBaseCeroHome(storageFalso({ [BASE_CERO_HOME_KEY]: 'false' })), false)
  assert.equal(readBaseCeroHome(storageFalso()), false)
  // Un valor inesperado no prende la opción.
  assert.equal(readBaseCeroHome(storageFalso({ [BASE_CERO_HOME_KEY]: '1' })), false)
})

const BARRA_NORMAL = ['/', '/billeteras', '/presupuesto']

test('con la opción prendida, Base 0 pasa primero y HOME segundo', () => {
  assert.deepEqual(orderNavPaths(BARRA_NORMAL, true), ['/presupuesto', '/', '/billeteras'])
})

test('con la opción apagada, el orden de la barra no se toca', () => {
  assert.deepEqual(orderNavPaths(BARRA_NORMAL, false), BARRA_NORMAL)
})

test('el reordenamiento no pierde ni duplica opciones', () => {
  const ordenado = orderNavPaths(BARRA_NORMAL, true)
  assert.equal(ordenado.length, BARRA_NORMAL.length)
  assert.deepEqual([...ordenado].sort(), [...BARRA_NORMAL].sort())
})

test('si la barra no muestra Base 0, no se inventa una opción', () => {
  // Modo anticipado: la barra es HOME, Cuentas y Tarjetas.
  const barraAnticipada = ['/', '/billeteras', '/tarjetas']
  assert.deepEqual(orderNavPaths(barraAnticipada, true), barraAnticipada)
})

test('al abrir la app se aterriza en Base 0 solo si la opción está prendida', () => {
  assert.equal(resolveLandingPath('/', true), BASE_CERO_HOME_PATH)
  assert.equal(resolveLandingPath('/', false), '/')
  // Un link directo a otra pantalla no se pisa.
  assert.equal(resolveLandingPath('/inversiones', true), '/inversiones')
  assert.equal(resolveLandingPath('/billeteras', false), '/billeteras')
})

test('la pantalla de ajustes escribe la preferencia por el módulo compartido', () => {
  const page = leer('src/pages/Configuracion/PresupuestoCicloPage.tsx')

  assert.match(page, /writeBaseCeroHome\(/, 'el interruptor tiene que escribir por el módulo')
  assert.doesNotMatch(
    page,
    /localStorage\.setItem\(['"]base_cero_como_inicio['"]/,
    'la pantalla no puede escribir la clave a mano: dos fuentes para el mismo dato',
  )
  assert.doesNotMatch(
    page,
    /dispatchEvent\(new Event\(['"]base-cero-home-changed['"]\)\)/,
    'el aviso lo emite el módulo, no la pantalla',
  )
})

test('la barra de navegación reordena con la preferencia', () => {
  const nav = leer('src/components/BottomNav/BottomNav.tsx')

  assert.match(nav, /useBaseCeroHome\(\)/, 'la barra tiene que leer la preferencia')
  assert.match(nav, /orderNavPaths\(/, 'el orden sale del helper puro')
  assert.match(nav, /BASE_CERO_HOME_PATH/, 'la etiqueta "Base 0" se resuelve por la ruta constante')
})

test('la app aterriza en Base 0 al abrirse cuando la opción está prendida', () => {
  const app = leer('src/App.tsx')

  assert.match(app, /resolveLandingPath\(/, 'la app tiene que resolver el aterrizaje')
  assert.match(app, /baseCeroComoInicio/, 'la decisión depende de la preferencia')
  assert.match(app, /navigate\(destino, \{ replace: true \}\)/, 'el redirect reemplaza la entrada')
})
