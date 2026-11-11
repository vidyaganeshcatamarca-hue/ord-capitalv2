# Inversiones: capital y resultado separados de gastos e ingresos

Rama `feat/ahorro-sobres-prd`. Commits `e62d65f` (capital vs resultado), `598cfe1` (export), `be9aaea` (validaciones). Migración aplicada en Supabase el 2026-11-11.

## Specs

- **S1** (pedido del dueño, verbatim): "Quiero que antes de arrancar con el tema del productor de avisos, veamos lo que detectaste en el módulo de inversiones. Evalúalo, fíjate cómo lo resolvimos en ahorro, fíjate la factibilidad de resolverlo parecido en el módulo de inversiones sin romper nada para que no quede afectado el resumen de egresos y el resumen de ingresos. Otra opción es modificar los resúmenes que tengan encuesta de inversiones y que lo quiten. Eso no modificaría tanto la lógica. Evalúa las dos alternativas y si hay una tercera me la propones."
- **S2** (decisión, verbatim): "C, con migración de datos."
- **S3** — El **capital** de una inversión (aportar, rescatar, recuperar al liquidar) **no es gasto ni ingreso**: mueve el saldo de la billetera como `adjustment` con `metadata.investment_capital = true`.
- **S4** — El **resultado** de la inversión sí es ingreso o gasto real: la ganancia queda `income` y la pérdida `expense`. `fn_liquidar_inversion` ya separaba ambas partes; se conserva esa separación.
- **S5** — El capital se conserva visible en el History con la categoría de inversiones, nunca como "ajuste misterioso": por eso las filas mantienen `estructura_egreso_id`.
- **S6** — Los resúmenes de egresos e ingresos no se tocan: `v_p_caja_reportable` propaga el `tipo` y cada consumidor filtra por `expense` o `income`, así que un `adjustment` sale solo.
- **S7** — La migración del historial es **explícita y decidida por el dueño** (S2), no silenciosa.

## Tasks

| ID | Tarea | Specs | Estado |
|---|---|---|---|
| T1 | Separar capital de resultado en `fn_crear_inversion`, `fn_rescatar_inversion` y `fn_liquidar_inversion` | S3-S4 | **done** `e62d65f`, test 8/8 |
| T2 | `fn_reporte_detalle_inversion`: rama para el capital en `adjustment` | S5 | **done** `e62d65f` |
| T3 | Migrar las filas históricas de capital | S7 | **done**: 32 filas a `adjustment`, 2 ganancias intactas |
| T4 | Verificar saldos y resúmenes | S6 | **done**: saldos idénticos al centavo |
| T5 | Arreglar `fn_exportar_movimientos` (rota de antes) | — | **done** `598cfe1` |
| T6 | Validar el importe al liquidar | — | **done** `be9aaea`, test 9/9 |
| T7 | Filtro nulo del History se comporta como `all` | — | **done** `be9aaea` |

## Log

- **L1** — Evaluación de las tres alternativas con evidencia del código, no con impresiones.
  - Estado encontrado: `fn_crear_inversion` escribía `expense` por el capital, `fn_rescatar_inversion` escribía `income` por el rescate, y `fn_liquidar_inversion` ya separaba tres filas (capital como `income`, ganancia como `income`, pérdida como `expense`). En el usuario 1 eso dejaba **10 egresos por 1.967.700** y **5 ingresos por 265.500** que no eran ni gasto ni ingreso.
  - **El dato que decidió la factibilidad**: `v_p_caja_reportable` no filtra por tipo, solo excluye las transferencias duplicadas, pero **propaga el `tipo`**, y sus **21 consumidores** filtran `tipo = 'expense'` o `tipo = 'income'` en su propio `WHERE`. Pasar el capital a `adjustment` lo saca de todos los resúmenes **sin tocar un solo reporte**.
  - Único reporte que dependía del tipo: `fn_reporte_detalle_inversion`, que mapea `expense`/`income` y deja `ELSE 0`.
  - Alternativa B (filtrar la categoría de inversión en cada resumen) se descartó por deuda: ~14 funciones de egresos y ~16 de ingresos, y cada reporte nuevo tendría que recordarlo.
  - Alternativa C (la elegida) es A más dos cosas: marca explícita `investment_capital` para no confundir el capital con otros ajustes (conciliación, sobres), y conservar `estructura_egreso_id` para que el History lo muestre como Inversiones.
  - Beneficio que A no daba: el **techo presupuestario y el promedio de ingresos de 90 días** dejan de inflarse con devoluciones de capital.
- **L2** — Aplicación y migración, con verificación previa y posterior.
  - Respaldo de las **34 filas** con `metadata.inversion_id` en `temp_sql/respaldo_inv.json`, y saldos de billeteras capturados antes de tocar nada.
  - Test transaccional **8 de 8** con el DDL nuevo: el aporte es `adjustment` con marca, baja la billetera, **no suma al gasto**; el rescate **no suma al ingreso** y devuelve el saldo; la liquidación deja el capital en `adjustment` y la ganancia en `income` por 200; el detalle de la inversión sigue mostrando el capital.
  - Migración: 32 filas de capital a `adjustment` (`investment_prefix` 15, `rescate_inversion` 8, `investment_contribution` 7, `liquidation_capital_recovery` 2). Las **2 `liquidation_gain` quedaron `income`**: son resultado real, no capital.
  - Verificación posterior: los **seis saldos del usuario quedaron idénticos al centavo** (29.327,76 / 1.220.774,99 / 201.145,84 / 273 / 1.234 / 5.510), o sea el trigger fue neutro; los **egresos históricos bajaron 1.967.700** y los **ingresos 265.000**, y las dos ganancias reales de 500 siguen como ingreso.
  - El capital migrado se ve en el History con `tipo = adjustment`, el monto con su signo correcto y **categoría `cat_investments_portfolio`** (Inversiones), no `type_adjustment_mystery`.
- **L3** — Tres bugs encontrados al verificar, ninguno buscado.
  - **`fn_exportar_movimientos` estaba rota de antes** y fallaba siempre, con cualquier rango: `column reference "tipo" is ambiguous`. La causa no era una variable del `DECLARE` sino las **columnas de salida del `RETURNS TABLE(fecha, tipo, monto, …)`**, que en PL/pgSQL actúan como variables y chocaban con las columnas de las CTE en el segundo `RETURN QUERY` (`tipo` en el `WHERE`, `fecha` y `p_caja_id` en los `PARTITION BY`). Se calificó con `legs.` y el export pasó de fallar a devolver **191 filas**. No tenía test, por eso nadie lo notó.
  - **`fn_reporte_movimientos_recientes` con `p_filtro_tipo` en `null` devolvía cero filas**: el `WHERE` hacía `(p_filtro_tipo = 'all' OR c.tipo = p_filtro_tipo)` y con `null` la comparación da `NULL`. Ahora un filtro nulo se comporta como `all`. El default ya era `all`, así que solo afectaba a un cliente que mandara `null` explícito. Lo destapó mi propio test al caer en la trampa.
  - **`fn_liquidar_inversion` acreditaba `p_monto_total_retirado` sin validar** que fuera un número positivo: un cero o un negativo llegaban a la billetera. Ahora rechaza `null`, cero y negativos con `error_investment_amount_zero`. **No se pone tope por arriba a propósito**: retirar más que el capital es una ganancia legítima.
  - Los tres se verificaron con **9 aserciones transaccionales** y un test que primero falló por un defecto propio: leía las filas de liquidación sin haber ejecutado una liquidación válida, porque los tres intentos previos eran rechazos. Se corrigió el test, no se declaró el bug inexistente.
- **L4** — Dato del terreno para el próximo: **los espejos de `funcionesSQL` tenían cuerpos duplicados** en al menos dos archivos (`fn_crear_inversion` y `fn_exportar_movimientos`), con una segunda copia del bloque sin el `;` final. Al regenerarlos desde la definición viva se limpian solos; no son contenido a preservar.
