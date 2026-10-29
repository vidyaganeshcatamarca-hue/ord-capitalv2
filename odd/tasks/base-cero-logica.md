# Base cero: corrección de la lógica (tandas 1-3)

Rama: `pi/inversiones-v1-puesta-punto`. Continúa `odd/tasks/bugs-ronda-7.md` (ahí está el
diagnóstico con evidencia). Acá está la corrección.

Riesgo alto declarado: (1) efectos sobre datos de dinero y (5) despliegue en la base viva de
producción. Cada tanda se despliega y se verifica antes/después con probes de solo lectura sobre
el user 1, y ninguna corre destructivamente: lo que se reemplaza se archiva.

## Specs

**S1 — Los déficits no suman al disponible para asignar.**
"si, continua en orden hasta terminar 1-3" sobre la propuesta aceptada: "1.
`fn_obtener_saldo_a_asignar` (+ el guard de `fn_asignar_presupuesto`): que los sobres en rojo no
sumen al disponible. Es el que crea plata de la nada, se arregla en una función y no toca datos
históricos."
Hoy: `liquidez - SUM(monto_disponible) - cuotas`, y un sobre negativo resta negativo, o sea suma.
Debe restar solo saldos positivos.

**S2 — En base cero no hay arrastre y el ciclo de activación se corta en la activación.**
"2. El corte por `fecha_activacion_base_cero` en `fn_reporte_sobres_detalle`: `arrastre = 0` y
`gastado` solo desde la activación. Requiere backfill del ciclo de activación de los usuarios ya
activados."
Dueño en L1: "Cuando paso de modo libertad a modo base cero, no puede haber ningún arrastre" y
"deberíamos arrancar en cero desde el momento en que la persona decidió pasarse a base cero".

**S3 — El cambio de modo reinicia el ciclo correcto, archiva lo anterior y avisa.**
"3. El reset de `fn_configurar_modo_presupuesto`: apuntar al ciclo activo, archivar el
`monto_limite` anterior y confirmar al volver a anticipado."
Hoy resetea `date_trunc('month', CURRENT_DATE)`, que es el ciclo equivocado cuando `hoy < día
ancla`, y borra sin dejar rastro en las dos direcciones.

## Tasks

| ID | Specs | Ruta | Commit |
| --- | --- | --- | --- |
| B1 | S1 | `temp_sql/130_*.sql` + deploy + probe antes/después | `fix(presupuestos): los deficit no suman al disponible` |
| B2 | S2 | `temp_sql/131_*.sql` + deploy + backfill si hace falta | `fix(presupuestos): base cero sin arrastre y con corte` |
| B3 | S3 | `temp_sql/132_*.sql` + deploy + confirmación en la UI | `fix(presupuestos): el cambio de modo reinicia el ciclo activo` |

## Estado del arte (medido antes de tocar nada)

User 1, base cero desde `2026-10-27`, ciclo 1/10–31/10, día ancla 1:

| Dato | Valor |
| --- | --- |
| Liquidez en billeteras (moneda local) | 2.627.275 |
| SUM(monto_disponible) de sobres | −2.287.700 (del ciclo) |
| Arrastres negativos vivos | −2.842.307 |
| "Disponible para asignar" que devuelve el RPC | ~7.757.282 |
| Gastos del ciclo anteriores al traspaso | 2.738.000 en 24 movimientos |

## Log

**L1 (autorización del dueño, verbatim)**

> si, continua en orden hasta terminar 1-3

**L0 (pedido anterior que originó el diagnóstico):** ver
`odd/tasks/bugs-ronda-7.md`, S5 y L1.

## Resultados por tanda

### B1 — desplegado y verificado (2026-10-29)

Función: `temp_sql/130_saldo_deficit_no_suma.sql` → `SUM(GREATEST(monto_disponible, 0))`.
Deploy: `temp_sql/131_deploy_130.mjs` (mide el RPC real impersonando
`request.jwt.claims`, valida con las funciones reales, revierte si falla y se puede
re-correr).

| | Antes | Después |
| --- | --- | --- |
| RPC `fn_obtener_saldo_a_asignar` (user 1) | 7.358.752 | **2.378.745** |
| Términos | liquidez 2.627.275 · sobres todos −4.731.477 (positivos 248.530, rojos −4.980.007) · tarjetas 0 | iguales |

- 2.378.745 = 2.627.275 − 248.530 − 0 ✔
- Baja de **4.980.007**: exactamente los sobres en rojo que antes se sumaban como plata.
- El disponible quedó por debajo de la liquidez real (antes la superaba en 4,7 veces).
- Huella de tablas idéntica antes/después: 41 presupuestos (11.202.000), 79 config,
  1.912 movimientos, 1.539 estructuras. La tanda no migra datos.
- El script se re-corrió sobre el deploy hecho: reconoce "fórmula nueva", valida sin
  re-aplicar y pasa limpio (idempotente).
- Efecto lateral declarado: la pantalla en **anticipado** usa la misma función, así que
  su número también baja. Es el mismo criterio contable y el número era igual de falso.
- Incidencia del propio deploy: el primer intento abortó por un error mío en el
  postcheck (comparaba la baja con signo invertido) y la reversión no cerraba el
  `CREATE` con `;`. La función quedó bien desplegada igual; se arreglaron las dos cosas
  y el test estático las congela.
