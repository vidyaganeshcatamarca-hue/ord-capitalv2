// tests/onboarding/region-por-usuario.test.js
//
//   node --test tests/onboarding/region-por-usuario.test.js
//
// S9 del dueño (2026-10-23, verbatim): "En el mismo teléfono, antes de que ingrese
// este usuario, que es el usuario 20, que ingresa por mail, no ingresa por Google,
// toma la configuración del usuario anterior logueado en el mismo teléfono [...] no
// sé si es un problema del usuario 20, que está mal configurado, o es un problema
// que queda en el dispositivo, está tomando del dispositivo la información y no de
// la base de datos."
//
// Y el dato que cerró el diagnóstico (2026-10-23): "cuando yo hacía la entrada y la
// salida, pero no con el usuario 20, sino que pasaba del usuario 1 al 198, la cosa
// funcionaba bien". Los usuarios 1 y 198 entran por Google (`signInWithOAuth` con
// redirect: la página se recarga y el estado de módulo muere). El usuario 20 entra
// por mail (`signInWithPassword`): SPA, sin recarga, así que la promesa memoizada a
// nivel de módulo seguía sirviendo la región del usuario anterior.
//
// Regla: una petición memoizada pertenece a UN usuario. Si cambia el usuario, la
// memo no se reusa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const { reuseForUser } = await import('../../src/lib/userCache.ts')

const entry = { userId: 'user-198', promise: Promise.resolve('GBP') }

test('el mismo usuario reusa la petición memoizada', () => {
  assert.equal(reuseForUser(entry, 'user-198'), entry.promise)
})

test('otro usuario NO reusa la memo: es el bug de la libra', () => {
  assert.equal(
    reuseForUser(entry, 'user-20'),
    null,
    'si el usuario cambia, la región anterior no puede sobrevivir'
  )
})

test('sin usuario no se reusa nada', () => {
  assert.equal(reuseForUser(entry, ''), null)
  assert.equal(reuseForUser(entry, null), null)
  assert.equal(reuseForUser(null, 'user-198'), null)
})

test('el hook indexa la memo por usuario y la invalida al cerrar sesión', () => {
  const hook = read('src/hooks/useNumberFormat.ts')
  assert.match(hook, /reuseForUser/, 'la memo tiene que pasar por la regla por usuario')
  assert.match(
    hook,
    /fetchUserRegion\(userId\)/,
    'la lectura de región necesita saber de qué usuario es'
  )

  const auth = read('src/contexts/AuthContext.tsx')
  const desdeSignedOut = auth.slice(auth.indexOf("event === 'SIGNED_OUT'"))
  assert.ok(
    /invalidateRegionCache\(/.test(desdeSignedOut),
    'al cerrar sesión hay que tirar la memo: la próxima entrada puede ser otro usuario'
  )
})
