# Presupuestos: ciclos pasados de solo lectura

Rama: `pi/inversiones-v1-puesta-punto`. Sigue a `bugs-ronda-7.md` (ronda 7) y
`base-cero-logica.md` (tandas 1-3).

## Specs

**S1 — Un ciclo cerrado no se escribe, en ningún modo.**
"El ciclo anterior y el doble anterior en modo base cero está dando la opción de cubrir un
déficit. En realidad, en base cero no es correcto, primero porque recién comienza el ciclo,
entonces además es solo lectura. El ciclo anterior y el doble anterior, tanto en base cero
como en modo libertad, es solo lectura. No puedo hacer asignaciones de ciclos anteriores.
[...] Revisa y comprueba que en modo base cero y en modo libertad no se puedan asignar datos
y que sean modos de solo lectura en la sección de presupuestos."

Captura: vista "Ciclo Anterior" con botones "Cubrir déficit" por sobre y un "Disponible para
asignar 2.188.745" que mezcla la liquidez de hoy con los sobres de un ciclo cerrado.

**S2 — El número de la alerta tiene que poder explicarse.**
"aparece en sobres excedidos farmacia menos 670.110. Pero si yo busco el resumen del mes
anterior, la categoría farmacia, me da 1.336.746, lo que no estaría coincidiendo el valor.
[...] Chequea eso."

## Tasks

| ID | Specs | Qué | Estado |
| --- | --- | --- | --- |
| R1 | S1 | ciclos pasados de solo lectura + test | hecho |
| R2 | S2 | explicar el −670.110 y ubicar el 1.336.746 | medido, falta el dato del dueño |

## R1 — qué se apagó y por qué

`soloLectura = mesOffset !== activeOffset`: el ciclo elegido contra el ciclo vivo (que depende
del día ancla). No mira el modo de presupuesto, así que vale igual en base cero y en libertad.

- **Guardas en los seis caminos que escriben**: abrir asignación, asignar, llenar hueco, monto
  manual, transferir y cubrir déficit por la vía directa. Aunque un botón se escape, el ciclo
  cerrado no escribe.
- **Botón "Asignar"** de cada sobre: no se dibuja (y el margen que le hacía lugar pasa a 0).
- **"Cubrir déficit"** de la alerta: no se dibuja, y el texto deja de invitar a cubrirlo.
- **Encabezado**: en vez de "Disponible para asignar" + un número, muestra "Ciclo cerrado" y
  "—". Ese número no significaba nada: restaba la liquidez de HOY contra los sobres de un ciclo
  que ya terminó.
- **CTA "Habilitar disciplina"**: tampoco, porque es una acción del ciclo vivo.

Verificación: `tests/presupuestos/solo-lectura-ciclos-pasados.test.js` (6 tests) y comprobación
por mutación: quitando los dos gates de la UI fallan 2 tests.

## R2 — el número de Farmacia (medido, sin cerrar)

- `Farmacia` es la estructura 47, **hoja** bajo `cat_health` (id 20), sin subcategorías.
- Gasto de septiembre del user 1: **1.170.110** en 19 movimientos, 0 compartidos.
- El reporte del ciclo anterior devuelve: asignado **500.000**, gastado **1.170.110**,
  disponible **−670.110**. O sea: **−670.110 = 500.000 − 1.170.110**. El alerta muestra el
  **balance (déficit)**, no el gasto del ciclo: por eso no coincide con un "resumen de gasto".
- El 1.336.746 **no aparece** en los datos del user 1: ninguna categoría/mes suma eso, y
  ninguna ventana de 30 días para Farmacia tampoco (20/08–30/09 da 1.300.110).
- Falta el dato del dueño: en qué pantalla vio 1.336.746 (¿el resumen de otra categoría, otro
  mes, o el usuario clon?).

## Log

**L1 (dueño, verbatim)** — ver S1 y S2, transcriptos arriba.
