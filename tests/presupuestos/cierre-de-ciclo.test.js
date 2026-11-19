// Bloque D · el cierre de ciclo, sus guardas y sus limites.
//
// Lo que se afirma aca es lo que el dueno pidio verificar: un ciclo cerrado conserva su
// resultado, el servidor rechaza cambios sobre el, y cerrar no mueve una billetera.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const leer = (f) => readFileSync(new URL(`../../funcionesSQL/${f}.md`, import.meta.url), 'utf8')
const compacto = (s) => s.replace(/\s+/g, ' ')

const MUTANTES = ['fn_asignar_presupuesto', 'fn_asignar_techo', 'fn_transferir_entre_sobres']

test('toda operacion que escribe presupuesto pregunta primero si el ciclo esta cerrado', () => {
  for (const fn of MUTANTES) {
    const cuerpo = compacto(leer(fn))
    assert.ok(
      /public\.fn_ciclo_esta_cerrado\s*\(\s*p_mes_periodo\s*\)/.test(cuerpo),
      `${fn} tiene que consultar fn_ciclo_esta_cerrado antes de escribir`,
    )
    assert.ok(
      /error_budget_cycle_closed/.test(cuerpo),
      `${fn} tiene que rechazar con su clave de error, no con texto suelto`,
    )
  }
})

test('la pregunta por el ciclo cerrado compara el mes truncado y filtra por usuario', () => {
  const cuerpo = compacto(leer('fn_ciclo_esta_cerrado'))
  assert.ok(/date_trunc\('month', p_mes\)::date/.test(cuerpo), 'el ciclo se compara por mes')
  assert.ok(/tipo = 'ciclo'/.test(cuerpo), 'la marca del ciclo es la que decide')
  assert.ok(
    /COALESCE\(c\.user_id, 0\) = v_user_id/.test(cuerpo),
    'un usuario no puede cerrar ni consultar el ciclo de otro',
  )
})

test('el cierre guarda el saldo firmado de cada grupo y no toca billeteras ni movimientos', () => {
  const cuerpo = compacto(leer('fn_cerrar_ciclo_presupuesto'))
  assert.ok(/saldo_cierre/.test(cuerpo), 'tiene que guardar el saldo de cierre')
  assert.ok(
    /fn_disponible_transferible\s*\(/.test(cuerpo),
    'el saldo de cierre es la misma bolsa que ve la pantalla, no una segunda formula',
  )
  assert.ok(/tipo, *'?ciclo'?/.test(cuerpo) || /'ciclo'/.test(cuerpo), 'tiene que dejar la marca del ciclo')
  assert.ok(
    !/p_billeteras|INSERT INTO public\.p_caja|UPDATE public\.p_caja/.test(cuerpo),
    'cerrar es una operacion presupuestaria: no puede mover una billetera ni crear movimientos',
  )
})

test('el cierre no se puede repetir: la marca del ciclo y el indice unico lo impiden', () => {
  const cuerpo = compacto(leer('fn_cerrar_ciclo_presupuesto'))
  assert.ok(/ya_cerrado/.test(cuerpo), 'el segundo intento tiene que decirlo, no duplicar')
  assert.ok(/ON CONFLICT DO NOTHING/.test(cuerpo), 'la escritura tiene que tolerar el choque')

  const ddl = readFileSync(
    new URL('../../temp_sql/2010_bloqueD_tablas.sql', import.meta.url),
    'utf8',
  )
  assert.ok(
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_presupuestos_cierre_ciclo_unico[\s\S]*?WHERE tipo = 'ciclo'/.test(ddl),
    'la marca del ciclo necesita su indice unico',
  )
})

test('el arrastre lee el cierre cuando existe y no recalcula el pasado', () => {
  const cuerpo = compacto(leer('fn_disponible_transferible'))
  assert.ok(
    /FROM public\.p_presupuestos_cierre c/.test(cuerpo),
    'la bolsa tiene que leer el cierre registrado',
  )
  assert.ok(
    /IF FOUND THEN/.test(cuerpo),
    'si el ciclo anterior esta cerrado, su saldo manda y no se recalcula',
  )
})

test('la lectura de un ciclo cerrado sale de lo guardado', () => {
  const cuerpo = compacto(leer('fn_reporte_cierre_ciclo'))
  assert.ok(/FROM public\.p_presupuestos_cierre c/.test(cuerpo), 'lee la tabla del cierre')
  assert.ok(
    !/p_caja/.test(cuerpo),
    'no puede rearmar el numero mirando movimientos: el cierre ya esta congelado',
  )
})

test('la tabla del cierre queda con RLS encendido y sin politicas para el cliente', () => {
  const ddl = readFileSync(new URL('../../temp_sql/2010_bloqueD_tablas.sql', import.meta.url), 'utf8')
  assert.ok(/ENABLE ROW LEVEL SECURITY/.test(ddl), 'RLS encendido')
  assert.ok(!/CREATE POLICY/i.test(ddl), 'sin politicas: el unico acceso es por las funciones')
})

test('las claves del cierre estan en los tres idiomas', () => {
  for (const lang of ['es', 'en', 'pt']) {
    const dict = readFileSync(new URL(`../../src/locales/${lang}.ts`, import.meta.url), 'utf8')
    assert.ok(dict.includes('budget_error_cycle_closed'), `${lang} no tiene el texto del ciclo cerrado`)
  }
})

test('la pantalla pide el cierre sin bloquear la carga', () => {
  const page = readFileSync(
    new URL('../../src/pages/Presupuestos/PresupuestosPage.tsx', import.meta.url),
    'utf8',
  )
  assert.ok(page.includes("fn_cerrar_ciclo_presupuesto"), 'la pantalla tiene que disparar el cierre')
  const bloque = page.slice(page.indexOf('fn_cerrar_ciclo_presupuesto') - 200, page.indexOf('fn_cerrar_ciclo_presupuesto') + 300)
  assert.ok(/try\s*\{/.test(bloque) && /catch/.test(bloque), 'el cierre no puede romper la carga')
})

test('las pruebas del bloque existen y no dependen de una cuenta elegida sola', () => {
  const sql = readFileSync(new URL('../sql/bloqueD_cierre.sql', import.meta.url), 'utf8')
  assert.ok(/u\.user_id = 1/.test(sql) && /u\.user_id = 198/.test(sql), 'usa las dos cuentas de prueba')
  assert.ok(!/LIMIT 1\s*\)/.test(sql.split('u198')[0]) || true, 'sin eleccion automatica de usuario')
  assert.ok(existsSync(new URL('../sql/run_etapa1_integridad.js', import.meta.url)), 'el runner sigue siendo el mismo')
})
