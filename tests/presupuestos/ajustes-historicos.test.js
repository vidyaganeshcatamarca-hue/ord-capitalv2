// Bloque E · corregir un gasto de un ciclo cerrado deja un ajuste en el ciclo activo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (f) => readFileSync(new URL(`../../funcionesSQL/${f}.md`, import.meta.url), 'utf8')
const compacto = (s) => s.replace(/\s+/g, ' ')

test('el ajuste se dispara al tocar un movimiento y no crea otro movimiento', () => {
  const cuerpo = compacto(leer('fn_ajuste_por_correccion_caja'))
  assert.ok(/date_trunc\('month', OLD\.fecha\)/.test(cuerpo), 'mira el ciclo de origen')
  assert.ok(/date_trunc\('month', NEW\.fecha\)/.test(cuerpo), 'mira el ciclo de destino')
  assert.ok(/tipo = 'ciclo'/.test(cuerpo), 'solo actua si ese ciclo esta cerrado')
  assert.ok(
    !/INSERT INTO (?:public\.)?p_caja|UPDATE (?:public\.)?p_caja|p_billeteras/.test(cuerpo),
    'el ajuste no puede crear ni mover dinero: es presupuestario',
  )
})

test('el ajuste queda con trazabilidad al movimiento y al ciclo que corrige', () => {
  const cuerpo = compacto(leer('fn_registrar_ajuste_presupuesto'))
  assert.ok(/'ajuste'/.test(cuerpo), 'se guarda como ajuste, no como cierre')
  assert.ok(/'correccion_movimiento'/.test(cuerpo), 'lleva su motivo')
  assert.ok(/ciclo_corregido/.test(cuerpo), 'lleva el ciclo historico que corrige')
  assert.ok(/caja_id/.test(cuerpo), 'lleva el movimiento que lo origino')
  assert.ok(
    /DO UPDATE SET saldo_cierre = public\.p_presupuestos_cierre\.saldo_cierre \+ EXCLUDED\.saldo_cierre/.test(cuerpo),
    'dos correcciones del mismo movimiento acumulan la diferencia real, no dos filas',
  )
})

test('el ajuste cae en el grupo que manda plata, nunca en la subcategoria', () => {
  const grupo = compacto(leer('fn_grupo_de_estructura'))
  assert.ok(/COALESCE\(e\.padre_id, e\.estructura_id\)/.test(grupo), 'devuelve el padre si es subcategoria')
  const cuerpo = compacto(leer('fn_ajuste_por_correccion_caja'))
  assert.ok(
    /fn_grupo_de_estructura\(OLD\.estructura_egreso_id\)/.test(cuerpo) &&
      /fn_grupo_de_estructura\(NEW\.estructura_egreso_id\)/.test(cuerpo),
    'el ajuste se registra contra el grupo, no contra la fila tocada',
  )
})

test('la bolsa del ciclo suma los ajustes y el cierre historico no los absorbe', () => {
  const cuerpo = compacto(leer('fn_disponible_transferible'))
  assert.ok(/tipo = 'ajuste'/.test(cuerpo), 'lee los ajustes del ciclo')
  assert.ok(/v_ajuste/.test(cuerpo), 'los suma al saldo del grupo')
  const reporte = compacto(leer('fn_reporte_cierre_ciclo'))
  assert.ok(/tipo = 'cierre'/.test(reporte), 'la lectura historica sigue mirando solo los cierres')
})

test('una recategorizacion entre hijos del mismo padre no deja filas en cero', () => {
  const cuerpo = compacto(leer('fn_registrar_ajuste_presupuesto'))
  assert.ok(
    /DELETE FROM public\.p_presupuestos_cierre WHERE tipo = 'ajuste'/.test(cuerpo),
    'el ajuste que se cancela tiene que limpiarse, no quedar como fila en cero',
  )
  assert.ok(/saldo_cierre = 0/.test(cuerpo), 'solo se borra cuando de verdad quedo en cero')
})

test('una recategorizacion mueve el gasto entre padres, no entre movimientos', () => {
  const cuerpo = compacto(leer('fn_ajuste_por_correccion_caja'))
  assert.ok(
    !/INSERT INTO (?:public\.)?p_caja|p_billeteras/.test(cuerpo),
    'recategorizar no puede crear ni mover dinero: cambia la atribucion, no el gasto',
  )
  assert.ok(
    /v_old_grupo := public\.fn_grupo_de_estructura\(OLD\.estructura_egreso_id\)/.test(cuerpo) &&
      /v_new_grupo := public\.fn_grupo_de_estructura\(NEW\.estructura_egreso_id\)/.test(cuerpo),
    'el padre anterior y el nuevo se resuelven por separado',
  )
})
