# Bugs ronda 4 — presupuestos, decimales por moneda y monedas extra

Ronda de tres bugs del dueño, 2026-10-24. Tres áreas independientes: presupuestos
(panel informativo + tema claro), formateo de decimales por moneda, y configuración
de segunda/tercera moneda.

## Specs

**S1 — Tocar la tarjeta abre un panel SOLO informativo.**
Dueño: *"Cuando toco en una tarjeta me estás abriendo el modal de asignar fondos"* y
*"No quería que me muestres las opciones para ingresar asignaciones, dinero y todo lo
que aparece cuando tocas en el botón."*
El panel no lleva botones de asignar, llenar hueco, transferir ni base cero.

**S2 — El panel muestra la misma información que las tarjetas sin asignación.**
Dueño: *"solo me mostraras la información que no aparecía porque esa tarjeta tiene
asignaciones ya. Que es la misma información que tienen las tarjetas que no tienen
asignaciones."*
Esa información es: asignado, gastado, avance, y las tres históricas (asignado y
gastado del mes anterior, promedio de los últimos 6 meses).

**S3 — El botón "+ Asignar" sigue abriendo el sheet de asignación.**
Dueño: *"todo lo que aparece cuando tocas en el botón"* — o sea, el botón conserva su
comportamiento actual, con las opciones.

**S4 — En modo claro no hay fondos oscuros.**
Dueño: *"en modo claro estás poniendo mal los colores, no se ven los fondos. Hay un
fondo negro que no debería estar porque es modo claro."*

**S5 — La verificación es en relación de celular.**
Dueño: *"Mira siempre en relación celular para modificar bien eso que es lo más
importante."*

**S6 — Cada moneda muestra su cantidad de decimales configurada.**
Dueño: *"El usuario 198 [...] tiene configurado en la segunda moneda un decimal y en la
tercera moneda cero decimales. [...] en billeteras, por ejemplo, de home y de cuentas,
se muestra la configuración que tiene la moneda local, que son dos decimales. [...] no
se está respetando que cada moneda muestra la cantidad de decimales que tiene
configurado."*
Ejemplo concreto: 198 → ARS con 1 decimal, BRL con 0 decimales, local GBP con 2.

**S7 — Se puede dejar la segunda o la tercera moneda vacía.**
Dueño: *"no encontré la posibilidad de pasar a ninguna tercera moneda si quiero
deshabilitar una moneda quiero poner en que no hay tercera moneda no tengo la opción
siempre tengo que elegir una moneda una vez que ya está seleccionada no puedo anularla
estaría bueno que la pudiese anular"*.

**S8 — El error nombra la moneda que se está quitando, nunca otra.**
Dueño: *"me sale ese mensaje de error como si quisiera cambiar una moneda en dólares
cuando la tercera moneda está configurada en pesos o al menos eso dice la pantalla"*.

**S9 — La pantalla de monedas no hereda nada del usuario anterior.**
Dueño: *"no sé si la segunda y la tercera moneda me las muestra bien o las heredó del
usuario anterior cargado en el mismo teléfono lo cual sospecho"*.
Derivado de S8 y S9, no una regla nueva: la pantalla nunca puede mostrar como
seleccionada una moneda que la base no tiene, ni una que la propia RPC rechazaría (la
local como extra).

## Tasks

| ID | Specs | Ruta | Commit |
|----|-------|------|--------|
| T1 | S1-S3 | panel informativo separado del sheet de asignar (`PresupuestosPage.tsx`) | `7127009` |
| T2 | S4 | superficie del tema claro: `--bg-2` faltaba en warm-light (`index.css`) | `f766bc7` |
| T3 | S6 | decimales desde el mapa por moneda (`resolveDecimals` en `format.ts`) | `5dc6440` |
| T4 | S7-S9 | monedas extra: memo por usuario y limpieza en `SIGNED_OUT` | `511e2e6` |
| T6 | S6 (total) | decimales por moneda en las líneas del hero (`formatCurrencyNumber`) | `7466dd3` |
| T5 | S5 | verificación en celular de todo lo anterior | verificado, sin commit |

T6 no estaba en el plan: apareció al verificar T3 con el usuario 198. Las billeteras ya
estaban bien pero el total del Home seguía mostrando dos decimales fijos. Se agregó como
tarea propia porque es otro archivo, otra causa y otro commit.

## Log

**L1** — Pedido original del dueño, verbatim:

> 1. Tienes un error en el módulo de presupuestos. Cuando toco en una tarjeta me estás
> abriendo el modal de asignar fondos. Yo lo que quería era que al tocar la tarjeta
> solo me mostraras la información que no aparecía porque esa tarjeta tiene
> asignaciones ya. Que es la misma información que tienen las tarjetas que no tienen
> asignaciones. Esa es toda la información que quería que me muestres. No quería que me
> muestres las opciones para ingresar asignaciones, dinero y todo lo que aparece cuando
> tocas en el botón. Además en modo claro estás poniendo mal los colores, no se ven los
> fondos. Hay un fondo negro que no debería estar porque es modo claro. Conriste eso,
> tienes para mirar. Mira siempre en relación celular para modificar bien eso que es lo
> más importante.
> 2. El usuario 198, por ejemplo, tiene configurado en la segunda moneda un decimal y
> en la tercera moneda cero decimales. La segunda moneda son pesos argentinos y la
> tercera moneda son reales brasileros. Pero en billeteras, por ejemplo, de home y de
> cuentas, se muestra la configuración que tiene la moneda local, que son dos
> decimales. Fíjate qué está pasando, que no se está respetando que cada moneda muestra
> la cantidad de decimales que tiene configurado.
> 3. [captura pi-clipboard-a3a721a0] En el segundo 20 intento borrar, cambiar la tercera
> moneda y me sale ese mensaje de error como si quisiera cambiar una moneda en dólares
> cuando la tercera moneda está configurada en pesos o al menos eso dice la pantalla y
> tampoco encontré la posibilidad de pasar a ninguna tercera moneda si quiero
> deshabilitar una moneda quiero poner en que no hay tercera moneda no tengo la opción
> siempre tengo que elegir una moneda una vez que ya está seleccionada no puedo anularla
> estaría bueno que la pudiese anular fíjate que está pasando con el usuario 20 si se ha
> corregido la inestabilidad o no por lo menos ahora me muestra el signo pesos pero no sé
> si la segunda y la tercera moneda me las muestra bien o las heredó del usuario anterior
> cargado en el mismo teléfono lo cual sospecho

**L2** — Evidencia de base (consultada por el asistente, read-only):

- Usuario **20**: `moneda_default = ARS`, `monedas_extra = ["USD"]` → **no tiene tercera
  moneda**. Billeteras: 10 activas en ARS, **1 activa en USD**.
- Usuario **198**: `moneda_default = GBP`, `monedas_extra = ["BRL","ARS"]`,
  `monedas_formateo = {"ARS":{"decimales":1},"BRL":{"decimales":0},"EUR":{"decimales":1}}`.

Conclusión de L2: el mensaje de la captura ("You cannot remove USD: you have 1 active
account(s)") **es correcto** contra la base: el 20 tiene una billetera activa en USD y la
base todavía tiene USD como extra. Lo que miente es la pantalla, que mostraba
`Third currency: Argentine Peso · ARS` y `Secondary: Brazilian Real · BRL` — que es
exactamente la configuración del **198**, no la del 20. Es una fuga de estado entre
usuarios, como sospechaba el dueño.

**L3** — Causas raíz localizadas (evidencia de código):

- Presupuestos: `PresupuestosPage.tsx:1377` — la fila entera llama `onAsignar`, y el
  sheet de asignar (`showAsignarSheet`) contiene el detalle histórico **y** las
  opciones. `Presupuestos.css:435` — `.modal-sheet { background: #2D2D2D; }` hardcodeado
  (y hay una segunda regla en la línea 1338).
- Decimales: `useNumberFormat.ts:259` —
  `currency === 'USD' ? prefs.decimales_segunda_moneda : prefs.decimales_moneda_local`:
  regla binaria heredada de cuando la única extra posible era USD. Con extras
  arbitrarias, toda moneda que no sea USD toma los decimales de la local.
- Monedas extra: `BloqueMonedas.tsx` escribe con `fn_configurar_monedas_extra`, que
  rechaza la local (`error_monedas_extra_local`) y bloquea quitar una extra con
  billeteras activas (`error_monedas_extra_has_wallets`). No hay opción "sin moneda" y
  el estado mostrado sobrevive al cambio de usuario.

**L4** — Evidencia en el navegador, usuario **20**, viewport móvil 412x915, tema
`warm-light` (el que el dueño tiene puesto).

T1/S1-S2 — al tocar una tarjeta se abrió "Envelope detail" con
`Assigned: ARS 70.000 · Spent: ARS 0`, `Assigned last month: ARS 0`,
`Spent last month: ARS 404.000`, `Last 6 months average: ARS 588.550`, `Progress: 0%`, y
**un solo botón** con `aria-label` Close. Ningún control para asignar.

T2/S4 — medido, no estimado: el `.modal-sheet` ya era crema (`rgb(245,239,235)`); lo
negro era `.asignar-sheet-detalle` (`rgb(28,33,40)`, el `--bg-2` del tema oscuro) con
texto `rgb(74,53,37)` encima, y la ✕ como círculo negro. Después del arreglo:
`rgb(234,226,219)` con `rgb(74,53,37)` = 8.8:1 (AA pide 4.5).

T4/S7-S9 — la pantalla mostró la verdad de la base: principal `ARS · Argentine Peso`,
segunda `US Dollar · USD` con ✕, tercera `— No currency —`, un solo botón de limpiar y
ningún error. Contra `monedas_extra = ["USD"]` del usuario 20.

**L5** — Evidencia con el usuario **198** (el caso que reportó el dueño).

Monedas: principal `GBP · British Pound`, segunda `Brazilian Real · BRL`, tercera
`Argentine Peso · ARS`.

Decimales (local GBP con 2; ARS configurado con 1; BRL con 0):
- Home, líneas del hero: `R$ 18,703` y `ARS 150,372.3`.
- Home, billeteras: `ARS 150,372.3` y `R$ 18,703`.
- `/billeteras`: `ARS 150,372.3`, `R$ 18,703`, `£ 1,179.91`, `£ 630.00`.
- Total local: `£ 1,809.91` (estable a los 9s y 14s; un `£ 0.00` intermedio era la
  animación del conteo, no una regresión).

Antes del arreglo de T6 el hero mostraba `R$ 18,702.52` y `ARS 150,372.26`: los decimales
de la moneda local en las dos.

**L6** — Decisión del dueño sobre cómo cerrar S6: *"Lo verifico cuando entres con el 198"*
(no se tocó su configuración del usuario 20).
