// tests/presupuestos/cambio-modo-ciclo.test.js
//
//   node --test tests/presupuestos/cambio-modo-ciclo.test.js
//
// S3 de odd/tasks/base-cero-logica.md: el cambio de modo de presupuesto tiene que
// reiniciar el ciclo ACTIVO (no el mes calendario), archivar el monto anterior en
// vez de borrarlo, y la UI tiene que confirmar antes de volver a Modo Libertad.
//
// El defecto que se corrige: `WHERE mes_periodo = date_trunc('month', CURRENT_DATE)`
// es el mes calendario. Con día ancla > 1 y hoy antes del ancla, el ciclo activo
// empezó el mes anterior, así que la función ponía en 0 el ciclo que el usuario
// todavía no vive y dejaba intactas las asignaciones del vigente. En las dos
// direcciones, además, el reset era `SET monto_limite = 0` a secas: volver a
// anticipado borraba sin aviso y sin rastro.
//
// Deploy verificado con un ensayo que se revierte solo (el bloque DO termina
// siempre en RAISE): pasó por el ciclo activo 2026-09-01, dejó intacto 2026-10-01
// con 200.000 y archivó 100.000 con motivo 'vuelta_a_anticipado', sin dejar filas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadDictionary } from '../i18n/support/i18n-harness.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const leer = (...partes) => fs.readFileSync(path.join(repo, ...partes), 'utf8')
const sinComentarios = (sql) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

const sql = sinComentarios(leer('temp_sql', '134_cambio_modo_ciclo_activo.sql'))
const deploy = leer('temp_sql', '135_deploy_134.mjs')
const paginaCiclo = leer('src/pages/Configuracion/PresupuestoCicloPage.tsx')
const paginaPresupuestos = leer('src/pages/Presupuestos/PresupuestosPage.tsx')

test('el reset apunta al ciclo activo y no al mes calendario', () => {
  assert.match(sql, /v_mes_ciclo_actual := date_trunc\('month', v_inicio_ciclo_actual\)/)
  const updates = sql.match(/UPDATE p_presupuestos\s+SET monto_limite = 0[\s\S]*?;/g) ?? []
  assert.equal(updates.length, 2, 'las dos transiciones (a base cero y a anticipado) resetean')
  for (const update of updates) {
    assert.match(update, /mes_periodo = v_mes_ciclo_actual/, 'el WHERE tiene que usar el ciclo activo')
    assert.doesNotMatch(update, /date_trunc\('month', CURRENT_DATE\)/, 'no puede volver el mes calendario')
  }
})

test('archiva antes de poner en cero, y no borra filas', () => {
  const ramaBaseCero = sql.slice(sql.indexOf("IF p_modo = 'base_cero'"), sql.indexOf('ELSIF'))
  const ramaAnticipado = sql.slice(sql.indexOf('ELSIF'), sql.indexOf('ELSE', sql.indexOf('ELSIF')))

  for (const [nombre, rama] of [['a base cero', ramaBaseCero], ['a anticipado', ramaAnticipado]]) {
    const posArchivo = rama.indexOf('fn_archivar_presupuestos_ciclo')
    const posReset = rama.indexOf('SET monto_limite = 0')
    assert.ok(posArchivo > -1, `la transición ${nombre} tiene que archivar`)
    assert.ok(posArchivo < posReset, `en ${nombre} el archivo va ANTES del reset: si no, se archiva un cero`)
  }

  assert.doesNotMatch(sql, /\bDELETE\b/i, 'el cambio de modo no borra filas')
})

test('la tabla de historial es append-only y no queda expuesta', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.p_presupuestos_historial/)
  assert.match(sql, /ALTER TABLE public\.p_presupuestos_historial ENABLE ROW LEVEL SECURITY/)
  const inicioArchivar = sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_archivar_presupuestos_ciclo')
  const inicioSiguiente = sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_configurar_modo_presupuesto')
  // El recorte tiene que terminar donde empieza la OTRA función: si llega al final
  // del archivo, sus UPDATE se cuelan y la aserción falla por el motivo equivocado.
  const archivar = sql.slice(inicioArchivar, inicioSiguiente)
  assert.match(archivar, /INSERT INTO public\.p_presupuestos_historial/)
  assert.match(archivar, /monto_limite <> 0/, 'no se archivan ceros')
  assert.doesNotMatch(archivar, /\b(UPDATE|DELETE)\b/i, 'el archivo solo inserta')
})

test('el deploy ensaya en una transacción que se revierte y comprueba lo importante', () => {
  // El ensayo termina SIEMPRE en RAISE: si todo está bien lleva el resultado, si no
  // lleva el motivo. En los dos casos Postgres revierte.
  assert.match(deploy, /RAISE EXCEPTION 'OK:%'/)
  assert.match(deploy, /ENSAYO NO CONCLUYENTE/, 'si el ciclo activo coincide con el mes calendario, el ensayo no prueba nada')
  assert.match(deploy, /el mes calendario \(%\) se tocó/, 'tiene que verificar que la otra fila queda intacta')
  assert.match(deploy, /no se archivó el monto anterior/, 'tiene que verificar el archivo')
  assert.match(deploy, /la tabla de historial quedó con \$\{archivoVacio\} filas/, 'tiene que verificar que el ensayo no persiste')
  assert.match(deploy, /const terminar = \(def\)/, 'la definición a restaurar cierra en ;')
})

test('la pantalla de ajustes confirma antes de volver a Modo Libertad', () => {
  assert.match(paginaCiclo, /import \{ ConfirmModal \}/)
  const updateMode = paginaCiclo.slice(paginaCiclo.indexOf('const updateMode = '))
  const cuerpo = updateMode.slice(0, updateMode.indexOf('\n  }'))
  assert.match(cuerpo, /modo === 'anticipado' && config\.modo_presupuesto === 'base_cero'/, 'la condición del aviso')
  assert.match(cuerpo, /setConfirmandoAnticipado\(true\)/, 'tiene que abrir la confirmación')
  assert.match(cuerpo, /return/, 'y no cambiar el modo en el mismo toque')
  assert.match(paginaCiclo, /budget_confirm_back_to_anticipado_confirm/)
})

test('el modal de reglas no cambia de modo sin confirmar', () => {
  const guardar = paginaPresupuestos.slice(paginaPresupuestos.indexOf('const handleGuardarReglas = '))
  const rama = guardar.slice(guardar.indexOf('} else {'), guardar.indexOf('showToast(t(\'toast_golden_rules_success\')'))
  assert.match(rama, /setConfirmandoAnticipado\(true\)/, 'abre la confirmación')
  assert.doesNotMatch(rama, /fn_configurar_modo_presupuesto/, 'no llama al RPC en el mismo toque')

  const confirmar = paginaPresupuestos.slice(paginaPresupuestos.indexOf('const confirmarVueltaAAnticipado = '))
  assert.match(
    confirmar.slice(0, confirmar.indexOf('finally')),
    /fn_configurar_modo_presupuesto/,
    'el RPC vive en el handler de confirmación',
  )
  assert.match(paginaPresupuestos, /<ConfirmModal[\s\S]*?budget_confirm_back_to_anticipado_title/)
})

test('las claves de la confirmación están publicadas en los tres idiomas', async () => {
  const claves = [
    'budget_confirm_back_to_anticipado_title',
    'budget_confirm_back_to_anticipado_message',
    'budget_confirm_back_to_anticipado_confirm',
  ]
  for (const lang of ['es', 'en', 'pt']) {
    const dict = await loadDictionary(lang)
    const planas = new Set(
      Object.values(dict)
        .filter((seccion) => seccion && typeof seccion === 'object')
        .flatMap((seccion) => Object.keys(seccion)),
    )
    for (const clave of claves) assert.ok(planas.has(clave), `${lang}.ts no publica ${clave}`)
  }
})
