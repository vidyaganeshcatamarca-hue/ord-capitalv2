// Etapa 4: repeticion mensual en libertad.
//
// Dos reglas, y las dos se pueden romper sin que nada chille:
//   1. En libertad, abrir un ciclo vacio copia lo asignado a mano en el anterior. En
//      base cero no copia nada: el saldo llega por el arrastre.
//   2. La copia la decide el SERVIDOR para el ciclo vigente. Si la pantalla la dispara
//      mirando un ciclo pasado, se escribirian filas retroactivas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pagina = fs.readFileSync('src/pages/Presupuestos/PresupuestosPage.tsx', 'utf8')
const funcion = fs.readFileSync('funcionesSQL/fn_repetir_presupuestos_ciclo.md', 'utf8')

test('la pantalla pide la repeticion antes de leer el reporte', () => {
  assert.match(pagina, /fn_repetir_presupuestos_ciclo/, 'la pantalla tiene que llamar a la funcion')

  const pedido = pagina.indexOf("rpc('fn_repetir_presupuestos_ciclo'")
  const reporte = pagina.indexOf("rpc('fn_reporte_sobres_detalle'")
  assert.ok(pedido > 0, 'falta la llamada')
  assert.ok(reporte > 0, 'falta el reporte')
  assert.ok(pedido < reporte, 'la repeticion tiene que resolverse ANTES de leer el reporte, si no la pantalla muestra el ciclo vacio')
})

test('un fallo de la repeticion no puede romper la pantalla', () => {
  const desde = pagina.indexOf("rpc('fn_repetir_presupuestos_ciclo'")
  const bloque = pagina.slice(desde, desde + 400)
  assert.match(bloque, /catch/, 'tiene que estar envuelta para no bloquear la carga')
})

test('en base cero no repite nada: el saldo llega por el arrastre', () => {
  assert.match(funcion, /<> 'anticipado' THEN RETURN 0/, 'sin este corte, base cero copiaria plata ademas de arrastrarla y contaria doble')
})

test('solo actua sobre el ciclo vigente, nunca sobre uno pasado', () => {
  assert.match(funcion, /date_trunc\('month', p_mes\) <> date_trunc\('month', v_inicio\)/, 'la pantalla no decide sobre que ciclo se escribe')
  assert.match(funcion, /fn_obtener_fechas_ciclo_presupuesto\(CURRENT_DATE\)/, 'el ciclo vigente sale de la fecha de hoy')
})

test('no duplica si el ciclo ya tiene asignaciones', () => {
  assert.match(funcion, /AND COALESCE\(p\.monto_limite, 0\) <> 0\) THEN\s*RETURN 0/, 'sin esta guarda, llamarla dos veces duplica la plata')
})

test('el rastro dice que fue una repeticion, no un cambio manual', () => {
  assert.match(funcion, /'repeticion_mensual'/, 'la funcion tiene que dejar el motivo')
  assert.match(pagina, /repeticion_mensual:\s*'budget_history_reason_repetition'/, 'la pantalla tiene que traducir ese motivo')
})
