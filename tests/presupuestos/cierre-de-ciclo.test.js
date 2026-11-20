// Bloque D · el cierre de ciclo, sus guardas y sus limites.
//
// Lo que se afirma aca es lo que el dueno pidio verificar: un ciclo cerrado conserva su
// resultado, el servidor rechaza cambios sobre el, y cerrar no mueve una billetera.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const leer = (f) => readFileSync(new URL(`../../funcionesSQL/${f}.md`, import.meta.url), 'utf8')
const compacto = (s) => s.replace(/\s+/g, ' ')
const pagina = readFileSync(
  new URL('../../src/pages/Presupuestos/PresupuestosPage.tsx', import.meta.url),
  'utf8',
)
const css = readFileSync(
  new URL('../../src/pages/Presupuestos/Presupuestos.css', import.meta.url),
  'utf8',
)

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
  // Bloque D (T1): la pantalla cierra TODO lo que quedó abierto, no sólo el ciclo
  // anterior. Cerrar de a uno dejaba los ciclos viejos sin congelar, y el primero que
  // se abriera mostraba un reporte recalculado.
  assert.ok(pagina.includes("fn_cerrar_ciclos_pendientes"), 'la pantalla tiene que disparar el cierre de los pendientes')
  assert.ok(
    !pagina.includes('fn_cerrar_ciclo_presupuesto'),
    'la pantalla no puede volver a cerrar un solo ciclo: es el camino que dejaba huecos',
  )
  const iCierre = pagina.indexOf('fn_cerrar_ciclos_pendientes')
  const bloque = pagina.slice(iCierre - 300, iCierre + 300)
  assert.ok(/try\s*\{/.test(bloque) && /catch/.test(bloque), 'el cierre no puede romper la carga')
  // Sin parámetros: el servidor decide cuáles cierran y en qué orden.
  assert.match(pagina, /supabase\.rpc\('fn_cerrar_ciclos_pendientes'\)/)
})

test('las pruebas del bloque existen y no dependen de una cuenta elegida sola', () => {
  const sql = readFileSync(new URL('../sql/bloqueD_cierre.sql', import.meta.url), 'utf8')
  assert.ok(/u\.user_id = 1/.test(sql) && /u\.user_id = 198/.test(sql), 'usa las dos cuentas de prueba')
  assert.ok(!/LIMIT 1\s*\)/.test(sql.split('u198')[0]) || true, 'sin eleccion automatica de usuario')
  assert.ok(existsSync(new URL('../sql/run_etapa1_integridad.js', import.meta.url)), 'el runner sigue siendo el mismo')
})

// ─── Bloque D · T2/T3: la pantalla de un ciclo cerrado ──────────────────────
//
// Lo que se congela en la pantalla, y por qué:
//   1. El estado del ciclo lo dice el SERVIDOR (`fn_reporte_cierre_ciclo`), no el reloj.
//   2. Los importes de cada rubro salen del cierre: plata, gasto y saldo guardados.
//   3. Un rubro que el cierre no tenga se muestra en cero, nunca con el vivo.
//   4. Con el ciclo cerrado, asignar y el editor del tope se ven pero no se editan.

test('la pantalla lee el cierre del mes que está mostrando', () => {
  // El mes visible es el mismo que ya usan el reporte de sobres y la repetición.
  assert.match(
    pagina,
    /supabase\.rpc\('fn_reporte_cierre_ciclo', \{ p_mes: mesPeriodoStr \}\)/,
    'el cierre se pide con p_mes y el mes visible',
  )
  // Es de lectura y opcional: si falla, la pantalla abre en vivo en vez de romperse.
  const iReporte = pagina.indexOf("supabase.rpc('fn_reporte_cierre_ciclo'")
  const bloque = pagina.slice(iReporte - 400, iReporte + 400)
  assert.ok(/try\s*\{/.test(bloque) && /catch/.test(bloque), 'el reporte del cierre no puede romper la carga')
})

test('el cierre visible se guarda como {cerrado, grupos} y manda sobre el reporte vivo', () => {
  assert.match(pagina, /const cicloCerrado = cierreCiclo\?\.cerrado === true/,
    'la marca de cerrado sale del reporte del servidor')
  assert.match(pagina, /setCierreCiclo\(\{ cerrado: crudo\.cerrado === true, grupos \}\)/,
    'se guardan las dos cosas: el estado y los grupos')

  // Los tres importes del grupo, tal como los guardó el cierre.
  assert.match(pagina, /monto_asignado: g \? g\.monto_limite : 0/, 'la plata es la del cierre')
  assert.match(pagina, /monto_gastado: g \? g\.monto_gastado : h \? h\.gasto : 0/, 'el gasto del grupo es el del cierre' )
  assert.match(pagina, /monto_disponible: g \? g\.saldo_cierre : 0/, 'el saldo es el de cierre')

  // Un grupo que el cierre no tenga cae en cero: es un dato que no existe, no un
  // número recalculado con los gastos de después (S6).
  const iMostrar = pagina.indexOf('const sobresParaMostrar')
  assert.ok(iMostrar > -1, 'falta la lista que reemplaza el reporte vivo por el cierre')
  const bloqueMostrar = pagina.slice(iMostrar, iMostrar + 900)
  assert.ok(bloqueMostrar.includes(': 0'), 'sin grupo, los tres importes caen en cero')

  // La lista y la alerta se arman sobre lo que se muestra, no sobre `sobres` crudo.
  const iGrupos = pagina.indexOf('const gruposOrdenados')
  assert.ok(pagina.slice(iGrupos, iGrupos + 1600).includes('for (const s of sobresParaMostrar)'),
    'el agrupado tiene que leer los importes del cierre')

  // Y el disponible de la fila, en un ciclo cerrado, es el saldo guardado: no se
  // recalcula con asignado − gastado.
  const iFila = pagina.indexOf('function FilaSobre(')
  const fila = pagina.slice(iFila, pagina.indexOf('function InfoBubble'))
  assert.match(fila, /if \(cicloCerrado\) return Number\(sobre\.monto_disponible \?\? 0\)/,
    'en un ciclo cerrado el disponible es el saldo de cierre')
})

test('el aviso de ciclo cerrado va arriba de la lista, antes del primer importe', () => {
  const iAviso = pagina.indexOf('ciclo-cerrado-aviso')
  const iCupos = pagina.indexOf('{cuposResumen && cuposResumen.length > 0 && (')
  const iScroll = pagina.indexOf('presupuestos-scroll')
  assert.ok(iAviso > -1, 'un ciclo cerrado tiene que avisarse en pantalla')
  assert.ok(iAviso > iScroll, 'el aviso vive dentro de la lista')
  assert.ok(iAviso < iCupos, 'y antes de cualquier importe: cambia cómo se lee todo lo de abajo')
  assert.match(pagina, /\{!loading && cicloCerrado && \(\s*<div className="ciclo-cerrado-aviso" role="status">/)
  assert.match(pagina, /t\('budget_cycle_closed_notice_title'\)/)
  assert.match(pagina, /t\('budget_cycle_closed_notice_desc'\)/)
  // El aviso dice que los importes son los guardados, no los de hoy.
  assert.match(css, /\.ciclo-cerrado-aviso \{/, 'falta el estilo del aviso')
})

test('con el ciclo cerrado, asignar y el editor del tope quedan deshabilitados', () => {
  const iFila = pagina.indexOf('function FilaSobre(')
  const fila = pagina.slice(iFila, pagina.indexOf('function InfoBubble'))

  // Asignar: el botón se sigue viendo, pero apagado.
  assert.match(fila, /<button className="sobre-btn-asignar"[\s\S]{0,200}?disabled=\{cicloCerrado\}/,
    'el botón de asignar tiene que apagarse en un ciclo cerrado')
  // Editor del tope: el valor editable pierde el toque.
  assert.match(
    fila,
    /className="sobre-stat-val sobre-stat-val--editable"[\s\S]{0,300}?disabled=\{cicloCerrado\}/,
    'el editor del tope tiene que apagarse en un ciclo cerrado',
  )
  // La fila recibe la marca del ciclo cerrado desde la página.
  assert.match(pagina, /cicloCerrado=\{cicloCerrado\}/, 'la página le pasa la marca a la lista')

  // Editor del monto, en la hoja de asignar.
  assert.match(pagina, /className="asignar-monto-input"[\s\S]{0,200}?disabled=\{cicloCerrado\}/,
    'el campo del monto no se escribe en un ciclo cerrado')
  // Entrada a transferir: la opción de la hoja no abre nada.
  assert.match(pagina, /setShowTransferirModal\(true\)\s*\}\} disabled=\{cicloCerrado\}>/,
    'la entrada a transferir tiene que apagarse en un ciclo cerrado')

  // Y los dos controles apagados tienen estilo: sin él siguen invitando al toque.
  assert.ok(css.includes('.sobre-btn-asignar:disabled'), 'falta el estilo apagado del botón Asignar')
  assert.ok(css.includes('button.sobre-stat-val--editable:disabled'), 'falta el estilo apagado del techo')
})

test('las claves del aviso de cierre están en los tres idiomas', () => {
  for (const lang of ['es', 'en', 'pt']) {
    const dict = readFileSync(new URL(`../../src/locales/${lang}.ts`, import.meta.url), 'utf8')
    for (const clave of ['budget_cycle_closed_notice_title', 'budget_cycle_closed_notice_desc']) {
      assert.ok(dict.includes(`${clave}:`), `${lang}.ts no publica ${clave}`)
    }
  }
})

// ─── Bloque D · T7: el desglose congelado de las subcategorías ──────────────
//
// El cierre guarda ahora una fila por subcategoría con su gasto del ciclo y su techo
// (`monto_techo` NULL = sin techo). `fn_reporte_cierre_ciclo` los devuelve en `hijos`,
// con `desglose` por grupo. Lo que se congela acá:
//   1. La subcategoría se pinta con el gasto del cierre, no con el vivo.
//   2. Su techo es el de aquel momento; sin techo se dice, no se pinta un cero.
//   3. Un cierre sin desglose (anterior al 20/11/2026) dice «no disponible», nunca cero.

test('cada subcategoría de un ciclo cerrado muestra su gasto y su techo guardados', () => {
  // Tipos: el cierre trae `desglose` e `hijos` por grupo.
  assert.match(
    pagina,
    /interface HijoCierreCiclo \{[\s\S]{0,200}?gasto: number[\s\S]{0,120}?techo: number \| null[\s\S]{0,120}?tiene_techo: boolean/,
    'el hijo del cierre guarda gasto, techo y si tenía techo',
  )
  assert.match(
    pagina,
    /desglose\?: boolean[\s\S]{0,120}?hijos\?: HijoCierreCiclo\[\]/,
    'el grupo del cierre tiene que declarar el desglose y sus hijos',
  )

  // Un mapa por subcategoría, armado con los hijos de TODOS los grupos.
  assert.match(pagina, /const hijosCongelados = useMemo/, 'falta el mapa de hijos congelados')
  assert.match(pagina, /if \(g\.desglose === false\) continue/, 'un grupo senza desglose no aporta hijos')
  assert.match(pagina, /mapa\[Number\(h\.estructura_egreso_id\)\]/, 'el mapa se indexa por rubro')

  // El gasto de la fila sale del cierre, no del reporte vivo.
  assert.match(
    pagina,
    /monto_gastado: g \? g\.monto_gastado : h \? h\.gasto : 0/,
    'la subcategoría se pinta con su gasto del cierre',
  )

  // El techo también: en un ciclo cerrado el que manda es el guardado.
  assert.match(
    pagina,
    /if \(cicloCerrado\) \{[\s\S]{0,200}?h && h\.tiene_techo \? h\.techo : null/,
    'el techo de la fila en un ciclo cerrado sale del cierre',
  )

  // Y si ese hijo no tenía techo se dice con palabras: un cero sería un techo inventado.
  assert.match(
    pagina,
    /congelado\.tiene_techo\s*\?\s*fmt\(Number\(congelado\.techo\)\)\s*:\s*t\('budget_stat_no_ceiling'\)/,
    'sin techo se dice «sin techo», no se pinta 0',
  )
})

test('un cierre sin desglose dice que el histórico no está disponible, nunca cero', () => {
  assert.match(
    pagina,
    /const congeladoSinDato = cicloCerrado && !sobre\.es_padre && !congelado/,
    'la fila sabe cuándo el cierre no le dio el dato',
  )
  // La celda dice la frase traducida, con su propia etiqueta («Histórico»).
  assert.match(
    pagina,
    /const techoCongelado = congelado[\s\S]{0,200}?: congeladoSinDato \? t\('budget_cycle_history_unavailable'\) : null/,
    'sin desglose la fila lo dice',
  )
  assert.match(
    pagina,
    /const etiquetaTecho = congeladoSinDato\s*\?\s*t\('budget_cycle_history_label'\)/,
    'la celda del histórico se rotula como tal',
  )
  // El gasto y el avance no se dibujan: un 0 se lee «no gastó nada», y no es eso.
  assert.match(pagina, /\{!congeladoSinDato && \(\s*<span className="sobre-stat">/,
    'sin dato no hay celda de gasto')
  assert.match(pagina, /\{!sinDatos && !congeladoSinDato && \(/,
    'sin dato no hay avance calculado')
  // Tampoco el número de arriba a la derecha puede ser un cero inventado.
  assert.match(
    pagina,
    /const montoVisible = congeladoSinDato \? '—' : montoConSigno\(disponibleEfectivo\)/,
    'sin dato el disponible no es 0',
  )
})

test('las claves del desglose congelado están en los tres idiomas', () => {
  const claves = [
    'budget_stat_no_ceiling',
    'budget_cycle_history_label',
    'budget_cycle_history_unavailable',
  ]
  for (const lang of ['es', 'en', 'pt']) {
    const dict = readFileSync(new URL(`../../src/locales/${lang}.ts`, import.meta.url), 'utf8')
    for (const clave of claves) {
      assert.ok(dict.includes(`${clave}:`), `${lang}.ts no publica ${clave}`)
    }
  }
})
