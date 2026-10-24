// tests/inversiones/inflacion-vigente-y-retiro.test.js
// S12/S13/S14/S15/S16/S17 (odd/tasks/inversiones-v2-correcciones.md).
// S8: la inflación se prorratea por los días de cada inversión (92).
//
//   node --test tests/inversiones/inflacion-vigente-y-retiro.test.js
//
// Lo que el dueño vio en producción:
//   1. el cartel "Configurá tu fuente de inflación" no se iba NUNCA, aunque la
//      fuente fuera proxy dólar (que es el default): la inflación se congelaba
//      al guardar y quedaba en 0;
//   2. en el gráfico la tabla cortaba la columna Valor ("$ 35" en lugar de
//      "$ 350.000") y el donut empujaba la pantalla;
//   3. el país se podía elegir en el tab de inflación;
//   4. una liquidación parcial se mostraba como pérdida del 40%.
//
// Estos tests fijan las causas, no solo los síntomas: que la inflación se
// calcule en la lectura, que el nominal sume lo ya retirado y que la moneda de
// destino se valide en el servidor.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const SQL90 = 'temp_sql/90_inflacion_vigente_y_retiro_parcial.sql'
const SQL92 = 'temp_sql/92_inflacion_prorrateada_por_dias.sql'

// ─────────────────────────── backend: inflación ──────────────────────────────

test('S12: la inflación se calcula en la lectura, no se congela al guardar', () => {
  const sql = read(SQL90)
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.fn_inflacion_vigente/,
    'debe existir un helper que calcule la inflación vigente'
  )
  // El bug era leer la columna guardada como si fuera un valor actual.
  const rendimiento = sql.slice(sql.indexOf('fn_reporte_rendimiento_vs_inflacion'))
  assert.match(
    rendimiento,
    /fn_inflacion_vigente\(v_user_id\)/,
    'el reporte de rendimiento debe pedirle la inflación al helper vivo'
  )
})

test('S12: sin fila guardada, la fuente por defecto es proxy_dolar', () => {
  const sql = read(SQL90)
  assert.match(
    sql,
    /v_fuente := COALESCE\(v_fuente_cfg, 'proxy_dolar'\)/,
    'el default tiene que ser proxy_dolar, no "sin configurar"'
  )
})

test('S14: el país que manda es el de la configuración regional, no el guardado', () => {
  const sql = read(SQL90)
  assert.match(
    sql,
    /v_pais := COALESCE\(NULLIF\(v_pais_region, ''\), NULLIF\(v_pais_cfg, ''\)\)/,
    'el país regional define la moneda local; un país viejo guardado no puede pisarlo'
  )
})

test('S12/S17: se informa el motivo y la ventana real de la inflación', () => {
  const sql = read(SQL90)
  for (const key of ['motivo', 'ventana_6m_meses', 'ventana_12m_meses', 'disponible']) {
    assert.ok(sql.includes(`'${key}'`), `el payload debe incluir ${key}`)
  }
  assert.match(
    sql,
    /'sin_datos'/,
    'sin cotizaciones hay que decirlo: no hay nada que configurar'
  )
})

test('S12: el helper interno no queda expuesto por PostgREST', () => {
  const sql = read(SQL90)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.fn_inflacion_vigente\(bigint\) FROM PUBLIC, anon, authenticated/,
    'un helper interno no debe poder llamarse desde el cliente'
  )
})

test('S17: la inflación también se informa anualizada, y se muestra en la pestaña', () => {
  const sql = read(SQL90)
  assert.match(
    sql,
    /v_anualizada := ROUND\(/,
    'el backend tiene que anualizar la variación acumulada de la ventana real'
  )
  assert.match(
    sql,
    /POWER\(1 \+ \(v_inflacion_6m \/ 100\), 12 \/ v_ventana_6m\)/,
    'anualizar = (1 + acumulada)^(12/meses) - 1'
  )
  assert.match(sql, /'inflacion_anualizada'/, 'la clave tiene que viajar al front')

  const view = read('src/components/inversiones/ConfigInflacionView.tsx')
  assert.match(
    view,
    /label_inflation_annual/,
    'la pestaña de inflación tiene que mostrar el valor anual'
  )
})

// ─────────────────────── backend: retiro parcial ─────────────────────────────

test('S16: el rendimiento nominal suma lo ya retirado (un retiro no es pérdida)', () => {
  const sql = read(SQL90)
  const cartera = sql.slice(
    sql.indexOf('fn_reporte_cartera_inversiones'),
    sql.indexOf('fn_reporte_historial_inversiones')
  )
  assert.match(
    cartera,
    /COALESCE\(i\.monto_liquidado, 0\)/,
    'la cartera tiene que comparar (valor actual + retirado) contra el capital'
  )
})

test('S16: el detalle expone monto_liquidado para poder explicarlo', () => {
  const sql = read(SQL90)
  const detalle = sql.slice(
    sql.indexOf('fn_reporte_detalle_inversion'),
    sql.indexOf('fn_reporte_cartera_inversiones')
  )
  assert.match(detalle, /'monto_liquidado'/, 'el detalle debe devolver lo retirado')
  assert.match(
    detalle,
    /COALESCE\(v_inversion\.monto_liquidado, 0\)/,
    'y usarlo en el cálculo del nominal'
  )
})

// ───────────────────── backend: moneda al liquidar ───────────────────────────

test('S15: el backend rechaza liquidar a una billetera de otra moneda', () => {
  const sql = read(SQL90)
  const liquidar = sql.slice(sql.indexOf('fn_liquidar_inversion'))
  assert.match(
    liquidar,
    /FROM public\.p_billeteras/,
    'tiene que leer la moneda de la billetera destino'
  )
  assert.match(
    liquidar,
    /error_wallet_currency_mismatch/,
    'y cortar cuando la moneda no coincide con la de la inversión'
  )
  // El guard tiene que estar ANTES del primer INSERT, o el movimiento ya se
  // habría registrado cuando salta el error.
  const posGuard = liquidar.indexOf('error_wallet_currency_mismatch')
  const posInsert = liquidar.indexOf('INSERT INTO p_caja')
  assert.ok(posGuard > 0 && posInsert > 0, 'deben existir el guard y el insert')
  assert.ok(posGuard < posInsert, 'el guard va antes de acreditar la plata')
})

test('S15: el front solo ofrece billeteras de la misma moneda', () => {
  const modal = read('src/components/inversiones/LiquidarInversionModal.tsx')
  assert.match(
    modal,
    /billeteras\.filter\(\(b\) => b\.moneda === moneda\)/,
    'el selector debe filtrar por la moneda de la inversión'
  )
})

// ───────────────────────────── front: inflación ──────────────────────────────

test('S12: el cartel de configurar aparece solo si de verdad falta configurar', () => {
  const widget = read('src/components/inversiones/RendimientoRealWidget.tsx')
  assert.match(
    widget,
    /motivo_inflacion === 'manual_sin_valor'/,
    'el CTA no puede depender solo de "no hay inflación": depende del motivo'
  )
  assert.match(
    widget,
    /msg_inflation_no_data/,
    'cuando faltan datos se dice eso, no se pide configurar'
  )
})

test('S14: el tab de inflación no tiene selector de país', () => {
  const view = read('src/components/inversiones/ConfigInflacionView.tsx')
  assert.ok(
    !/id="config-inflacion-pais"/.test(view),
    'no debe haber un <select> para elegir país'
  )
  assert.ok(
    !/const PAISES/.test(view),
    'el array PAISES vacío era el bug que impedía aplicar el país guardado'
  )
})

// ────────────────────────────── front: gráfico ───────────────────────────────

test('S13: la tabla del gráfico entra en el teléfono (sin min-width fijo)', () => {
  // Se comparan las reglas, no los comentarios: el propio comentario del
  // arreglo nombra el "min-width: 520px" que se quitó.
  const css = read('src/components/inversiones/DistribucionView.css').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  )
  assert.ok(
    !/min-width:\s*520px/.test(css),
    'el min-width de 520px era lo que cortaba la columna Valor en un teléfono'
  )
  assert.match(css, /table-layout:\s*fixed/, 'la tabla se reparte el ancho disponible')
})

test('S13: el donut es más chico que antes (220px)', () => {
  const donut = read('src/components/inversiones/DistribucionDonut.tsx')
  const m = donut.match(/size = (\d+)/)
  assert.ok(m, 'el donut debe tener un tamaño por defecto explícito')
  assert.ok(
    Number(m[1]) < 200,
    `el donut por defecto era 220px y empujaba la pantalla; ahora es ${m[1]}`
  )
})

// ───────────────────────────────── i18n ─────────────────────────────────────

test('las keys nuevas están en los tres diccionarios', () => {
  const keys = [
    'msg_inflation_no_data',
    'label_inflation_computed',
    'label_inflation_window_months',
    'label_partial_withdrawal_note',
    'error_wallet_currency_mismatch',
  ]
  for (const lang of ['es', 'en', 'pt']) {
    const dic = read(`src/locales/${lang}.ts`)
    for (const key of keys) {
      assert.ok(dic.includes(`${key}:`), `${lang} le falta ${key}`)
    }
  }
})

// ───────────────────── porcentajes con el separador regional ────────────────

test('los porcentajes del módulo usan el separador decimal configurado', async () => {
  const { formatPercent, setFormatContext } = await import('../../src/lib/format.ts')

  setFormatContext({ decimalSeparator: ',' })
  assert.equal(formatPercent(12.62, { signed: false }), '12,62%')
  assert.equal(formatPercent(6.665), '+6,67%')
  assert.equal(formatPercent(-40, { signed: false }), '-40,00%')

  // Un usuario que eligió punto en su configuración regional ve punto.
  setFormatContext({ decimalSeparator: '.' })
  assert.equal(formatPercent(12.62, { signed: false }), '12.62%')
  assert.equal(formatPercent(6.665), '+6.67%')

  // Sin valor no se inventa un número.
  setFormatContext({ decimalSeparator: ',' })
  assert.equal(formatPercent(null), '-')
  assert.equal(formatPercent(undefined), '-')
})

test('ningún componente del módulo formatea porcentajes por su cuenta', () => {
  // El bug: cada archivo tenía su propio formatPercent con toFixed(2), que
  // siempre usa punto y se comía el separador elegido por el usuario.
  const archivos = fs
    .readdirSync(path.join(repo, 'src', 'components', 'inversiones'))
    .filter((f) => f.endsWith('.tsx'))
  for (const archivo of archivos) {
    const src = read(`src/components/inversiones/${archivo}`)
    assert.ok(
      !/function formatPercent\(/.test(src),
      `${archivo} no debe definir su propio formatPercent: usá el de @/lib/format`
    )
    assert.ok(
      !/toFixed\(2\)[`}]*%/.test(src),
      `${archivo} no debe armar porcentajes con toFixed(2) (siempre usa punto)`
    )
  }
})

// ────────────────── S8: la inflación se prorratea por los días ─────────────
//
// Decisión del dueño (2026-10-24, verbatim):
//   "esta bien que lo trate como el año completo, ya que la carga manual, es la
//    inflacion anual hasta ese momento de carga."
//   "cada inversion con sus propios dias, claro"
//
// El valor manual YA es una tasa ANUAL: no se anualiza nada y no se toca
// `fn_configurar_inflacion`. Lo único que cambia es que la tasa anual se
// aplica por los días que duró cada inversión.
//
// La migración vive en el 92 (no en el 90: el 90 es el registro de lo ya
// deployado y no se toca).

const sql92 = read(SQL92)
// El encabezado del 92 documenta la fórmula VIEJA a propósito (es el registro
// del antes/después). Los asserts sobre el código miran el SQL sin comentarios.
const codigo92 = sql92.replace(/--[^\n]*/g, '')

test('S8: el 92 reemplaza las dos funciones que calculaban el real', () => {
  assert.match(
    sql92,
    /CREATE OR REPLACE FUNCTION public\.fn_reporte_detalle_inversion\(p_inversion_id bigint\)/,
    'el detalle de una inversión tiene que prorratear por sus días'
  )
  assert.match(
    sql92,
    /CREATE OR REPLACE FUNCTION public\.fn_reporte_rendimiento_vs_inflacion\(\)/,
    'el real de la cartera tiene que prorratear por días'
  )
  // Mismas firmas y mismo tipo de retorno que las actuales: no se agregan
  // parámetros ni se cambia el contrato jsonb.
  assert.match(sql92, /RETURNS jsonb/)
  assert.ok(
    !/fn_reporte_detalle_inversion\((?!p_inversion_id bigint\))/.test(sql92),
    'la firma del detalle no puede cambiar'
  )
})

test('S8: las dos funciones del 92 se crean con las mismas reglas de seguridad', () => {
  const ambos = sql92.match(
    /CREATE OR REPLACE FUNCTION public\.fn_reporte_(?:detalle_inversion\(p_inversion_id bigint\)|rendimiento_vs_inflacion\(\))[\s\S]*?\$function\$;/g
  )
  assert.ok(ambos && ambos.length === 2, 'tiene que haber exactamente dos funciones')
  for (const cuerpo of ambos) {
    assert.match(cuerpo, /SECURITY DEFINER/)
    assert.match(cuerpo, /SET search_path TO 'public'/)
  }
})

test('S8: la inflación del período se prorratea con POWER sobre los días', () => {
  assert.match(
    sql92,
    /v_inflacion_periodo := \(POWER\(1 \+ \(v_inflacion_anual \/ 100\), v_dias_tenencia \/ 365\.0\) - 1\) \* 100;/,
    'inflación del período = (1 + anual/100)^(dias/365) - 1'
  )
  assert.match(
    sql92,
    /v_dias_tenencia := GREATEST\(\(CURRENT_DATE - v_inversion\.fecha_inicio\), 0\)::numeric;/,
    'los días son los de ESA inversión'
  )
})

test('S8: el real ya no se divide por la inflación de 6 meses', () => {
  // La fórmula vieja (6 meses fijos) no puede quedar en el cálculo del real.
  assert.ok(
    !/\(1 \+ \(v_inflacion_6m \/ 100\)\)/.test(codigo92),
    'el real no puede seguir descontando la inflación de 6 meses'
  )
  // Y el real se arma con la inflación DEL PERÍODO.
  assert.match(
    sql92,
    /v_rendimiento_real := \(\(1 \+ \(v_rendimiento_nominal \/ 100\)\) \/ \(1 \+ \(v_inflacion_periodo \/ 100\)\) - 1\) \* 100;/,
    'el real se descuenta la inflación del período'
  )
  assert.match(
    sql92,
    /v_real_inversion := \(\(1 \+ \(v_nominal_inversion \/ 100\)\) \/ \(1 \+ \(v_inflacion_periodo \/ 100\)\) - 1\) \* 100;/,
    'en la cartera, el real es el de cada inversión con su propia inflación'
  )
})

test('S8: la tasa anual sale del bloque de inflación, sin anualizar nada', () => {
  // El bloque vivo ya expone la tasa anual en 'inflacion_anualizada': con la
  // fuente manual es el valor tipeado (que YA es anual) y con el proxy dólar
  // es la anualización de la ventana real.
  assert.match(
    sql92,
    /v_inflacion_anual := COALESCE\(\s*\(v_infl ->> 'inflacion_anualizada'\)::numeric,\s*\(v_infl ->> 'inflacion_12m'\)::numeric\s*\);/,
    'la tasa anual se toma del bloque de inflación, no se recalcula'
  )
  // No se toca la configuración: el archivo no define ni altera
  // fn_configurar_inflacion.
  assert.ok(
    !/CREATE OR REPLACE FUNCTION public\.fn_configurar_inflacion/.test(codigo92),
    'esta migración no toca la configuración de inflación'
  )
})

test('S8: el 90 queda intacto: es el registro de lo ya deployado', () => {
  const sql90 = read(SQL90)
  assert.match(
    sql90,
    /v_rendimiento_real := \(\(1 \+ \(v_rendimiento_nominal \/ 100\)\) \/ \(1 \+ \(v_inflacion_6m \/ 100\)\) - 1\) \* 100;/,
    'el 90 es histórico: no se toca'
  )
})

test('S8: el real de la cartera es un promedio PONDERADO POR VALOR', () => {
  assert.match(sql92, /v_peso numeric;/)
  assert.match(sql92, /v_suma_pesos numeric := 0;/)
  assert.match(sql92, /v_suma_real_ponderada numeric := 0;/)
  assert.match(
    sql92,
    /v_suma_real_ponderada := v_suma_real_ponderada \+ \(v_peso \* v_real_inversion\);/,
    'el real de cada inversión entra multiplicado por su peso'
  )
  assert.match(
    sql92,
    /v_rendimiento_real := v_suma_real_ponderada \/ v_suma_pesos;/,
    'el agregado es el promedio ponderado'
  )
})

test('S8: el peso es el capital convertido a moneda local', () => {
  // El peso es el capital invertido convertido con la misma función que ya
  // usa el reporte. Ponderar por el valor actual sobreponderaría a las
  // inversiones que más subieron y rompería la coherencia con el nominal de
  // cartera (que se mide contra el capital original).
  assert.match(
    sql92,
    /SELECT c\.valor INTO v_peso\s+FROM fn_valor_a_moneda_local\(v_fila\.monto_invertido_original, v_fila\.moneda, v_user_id\) c;/,
    'el peso se convierte con la misma función que ya usa el reporte'
  )
})

test('S8: los días NO se promedian: cada inversión usa los suyos', () => {
  // Un promedio de días sería un AVG sobre un rango de fechas.
  assert.ok(
    !/AVG\s*\([^)]*dias/i.test(codigo92),
    'prohibido promediar días: cada inversión prorratea por los suyos'
  )
  assert.ok(
    !/AVG\s*\(/i.test(codigo92),
    'el agregado no puede ser un promedio simple'
  )
  // Y el cálculo del real está dentro de un bucle sobre las inversiones.
  assert.match(
    sql92,
    /FOR v_fila IN[\s\S]*?FROM p_inversiones i[\s\S]*?i\.estado = 'activa'[\s\S]*?v_real_inversion :=/,
    'el real se calcula inversión por inversión dentro del bucle'
  )
})

test('S8: una inversión sin inflación disponible no participa del promedio', () => {
  // No se inventa un 0: si no hay tasa anual, la inversión se saltea.
  assert.match(
    sql92,
    /IF v_inflacion_anual IS NULL THEN[\s\S]*?CONTINUE;/,
    'sin tasa anual la inversión no participa (no un 0)'
  )
  // Y si no quedó ninguna inversión con peso, el real es NULL, no 0.
  assert.match(
    sql92,
    /IF v_suma_pesos > 0 THEN[\s\S]*?ELSE\s+v_rendimiento_real := NULL;/,
    'sin pesos no hay real: se informa NULL'
  )
})

test('S8: ejemplo de 45 días con 6% anual ⇒ la inflación del período es 0,72%', () => {
  // La fórmula aprobada por el dueño es compuesta:
  //   (1 + 0,06)^(45/365) - 1
  const inflPeriodo = (Math.pow(1 + 6 / 100, 45 / 365.0) - 1) * 100
  assert.ok(
    Math.abs(inflPeriodo - 0.72) < 0.01,
    `la inflación del período de 45 días da ${inflPeriodo.toFixed(4)}%`
  )

  // Y el real se descuenta ESA inflación, no la de 6 meses (que sería 3%).
  const nominal = 10 // 10% de nominal
  const real = ((1 + nominal / 100) / (1 + inflPeriodo / 100) - 1) * 100
  const realCon6m = ((1 + nominal / 100) / (1 + 3 / 100) - 1) * 100
  assert.ok(
    Math.abs(real - 9.21) < 0.05,
    `con la inflación del período el real da ${real.toFixed(2)}%`
  )
  assert.ok(
    real > realCon6m,
    'prorratear por días tiene que dar un real MEJOR que descontar 6 meses fijos'
  )
})
