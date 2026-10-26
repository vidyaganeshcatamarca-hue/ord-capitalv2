# Bugs ronda 5 — nav inferior, retiros, tipografía, donut, nominal, aportes y ancho

Ronda de siete pedidos del dueño, 2026-10-24 (segunda del día). Toca colores, cálculo
financiero, tipografía, gráfico, un cálculo agregado en SQL/front, una funcionalidad
nueva (agregar capital) y layout.

## Specs

**S1 — Texto del menú inferior: mismo celeste, mucho más oscuro.**
Dueño: *"tocaste los CSS y modificaste el color de los menu del bottom de abajo. Están
muy claritos, está bien el color celeste pero tiene que tener como bastante más de negro
el texto del menú bottom como el dibujo, casi no se nota con el color celeste. Con el
verde de seleccion se ve bien, ese no lo modifiques."*
En tema claro el inactivo tiene que llegar a contraste legible; el activo verde no se toca.

**S2 — La ganancia descuenta los retiros parciales, y el capital original los muestra.**
Dueño: *"la inversión XXX arrancó con un saldo de 1 millón, luego hice una liquidación
parcial de 350 mil, el current value está en 650 mil, pero la ganancia está mal informada,
aparece como una pérdida de 350 mil cuando en realidad fue un retiro. […] el capital
original debería ser el capital inicial menos los retiros y aparecer en un lugar, entre
paréntesis por ejemplo, los retiros que se hicieron . ej: Original capital (1000000) -
(350000) : 650000 / current value 650000 / gain : 0"*

**S3 — La tipografía de los mensajes del detalle es la de la app.**
Dueño: *"el campo 'real yield' figura que no está configurada para esa moneda. El problema
que tenemos acá es el tipo de letra, la tipología que estás usando. No coincide con la
tipografia que estamos usando en toda la app. Esta es la misma tipografia que usar para el
texto de 'current value'"*.

**S4 — Distribución: sin paréntesis para la moneda local, sin 100% central, porcentaje
afuera de cada color.**
Dueño: *"solo debes mostrar este valor a las inversiones que no son en moneda local. Las
que son en moneda local no tienes que mostrar nada en este campo porque ya está mostrado
en el campo anterior. Asimismo, el número 100% dentro del donut es irrelevante, quítalo, y
ponle a cada color de cada inversión el porcentaje que representa en el donut, en la parte
externa de cada color."*

**S5 — El nominal yield general incluye los retiros, como el de cada inversión.**
Dueño: *"la tarjeta de la cabecera está mostrando el nominal yield general de todas las
inversiones pero creo que está calculado mal está tomando en cuenta los retiros parciales
chequea que este campo tenga la fórmula correcta fíjate la diferencia con el real yield"*.

**S6 — Se puede agregar capital a una inversión existente.**
Dueño: *"en ningún lugar tengo la opción de agregar dinero a una inversión. […] puedo
comprar más bitcoins del mismo tipo. Y eso no debería registrarse como una nueva
inversión, sino que la podría poder agregar a una inversión ya hecha. […] agregar un botón
de sumar capital […] en la misma tarjeta de inversión, tenemos update value, tenemos
liquidate y deberíamos tener un tercer botón, quizás más pequeño, que diga algo parecido a
agregar capital."*

**S7 — Las cuatro pestañas ocupan el ancho del teléfono.**
Dueño: *"el menú de los cuatro botones que no están ocupando el ancho total del teléfono
compararlo con el botón de new investment deberías distribuir los botones a lo largo de
todo el ancho y para hacer esto evidentemente puedes aumentar el tamaño de la letra y de
los botones en la redistribución"*.

**S8 — Verificar en localhost:5173 con ego-browser.**
Dueño: *"Recuerda que tienes Ego Browser para poder entrar y ver cómo van quedando las
cosas en el puerto 5173 en forma local, localhost."*

## Tasks

| ID | Specs | Ruta | Commit |
|----|-------|------|--------|
| T1 | S1 | color del ítem inactivo del nav inferior en tema claro (`index.css`) | `d20b3ff` |
| T2 | S2 | ganancia con retiros y capital original con los retiros (`InversionCard`, `inversionesPatrimonio`) | `2499ba3` |
| T3 | S3 | tipografía de los mensajes del detalle (`DetalleInversionView.css`) | `2c26ead` |
| T4 | S4 | paréntesis sólo para moneda no local + porcentajes fuera del donut | `e1f7014` |
| T5 | S5 | nominal general con retiros (migración 96, aplicada) | `a4e47ab` |
| T6 | S6 | botón "agregar capital" + modal + RPC de aporte (migración 98, aplicada) | `839082e` |
| T7 | S7 | pestañas a todo el ancho (`InversionesPage.css`) | `fc6d68f` |
| — | — | test de tokens de tema que había envejecido (lista a mano) | `6c8a280` |
| T8 | S8 | verificación en el navegador de los siete | verificado, sin commit |

## Log

**L1** — Pedido original, verbatim:

> 1. [captura] En alguna de las últimas modificaciones, fíjate con los commits, tocaste los
> CSS y modificaste el color de los menú del bottom de abajo. Están muy claritos, está
> bien el color celeste pero tiene que tener como bastante más de negro el texto del menú
> bottom como el dibujo, casi no se nota con el color celeste. Con el verde de seleccion
> se ve bien, ese no lo modifiques.
> 2. [captura] En esta imagen podemos ver que la inversión XXX arrancó con un saldo de 1
> millón, luego hice una liquidación parcial de 350 mil, el current value está en 650 mil,
> pero la ganancia está mal informada, aparece como una pérdida de 350 mil cuando en
> realidad fue un retiro. Entonces, lo que yo propongo es que tengamos un nuevo ítem
> llamado...Supongo que el capital original tiene que aparecer con los descuentos de los
> retiros porque si no me da la falsa impresión de que estoy perdiendo dinero pero en
> realidad hubo retiros entonces el capital original debería ser el capital inicial menos
> los retiros y aparecer en un lugar, entre paréntesis por ejemplo, los retiros que se
> hicieron . ej: Original capital (1000000) - (350000) : 650000 / current value 650000 /
> gain : 0
> 3. [captura] Dentro de la inversión, con los detalles de la misma, el campo "real yield"
> figura que no está configurada para esa moneda. El problema que tenemos acá es el tipo de
> letra, la tipología que estás usando. No coincide con la tipografia que estamos usando en
> toda la app. Esta es la misma tipografia que usar para el texto de "current value", por
> ejemplo.
> 4. [captura] Dentro del Chart, Distribución, tenemos todas las inversiones y entre
> paréntesis tenemos el valor en la moneda local. Pero solo debes mostrar este valor a las
> inversiones que no son en moneda local. Las que son en moneda local no tienes que mostrar
> nada en este campo porque ya está mostrado en el campo anterior. Asimismo, el número 100%
> dentro del donut es irrelevante, quítalo, y ponle a cada color de cada inversión el
> porcentaje que representa en el donut, en la parte externa de cada color.
> 5. [captura] la tarjeta de la cabecera está mostrando el nominal yield general de todas
> las inversiones pero creo que está calculado mal está tomando en cuenta los retiros
> parciales chequea que este campo tenga la fórmula correcta fíjate la diferencia con el
> real yield
> 6. Cada inversión me permite retirar dinero completo, liquidándola o hacer retiros
> parciales. Pero en ningún lugar tengo la opción de agregar dinero a una inversión. Y es
> una posibilidad correcta poder hacerlo, ya que, por ejemplo, puedo comprar más bitcoins
> del mismo tipo. Y eso no debería registrarse como una nueva inversión, sino que la podría
> poder agregar a una inversión ya hecha. Así que debes agregar un botón de sumar capital en
> algún lugar que te parezca oportuno para las inversiones. A mí el lugar oportuno es en la
> misma tarjeta de inversión, tenemos update value, tenemos liquidate y deberíamos tener un
> tercer botón, quizás más pequeño, que diga algo parecido a agregar capital.
> 7. [captura] fíjate acá el menú de los cuatro botones que no están ocupando el ancho total
> del teléfono compararlo con la con el botón de new investment deberías distribuir los
> botones a lo largo de todo el ancho y para hacer esto evidentemente puedes aumentar el
> tamaño de la letra y de los botones en la redistribución
> 8. Recuerda que tienes Ego Browser para poder entrar y ver cómo van quedando las cosas en
> el puerto 5173 en forma local, localhost.

**L2** — Causas raíz localizadas (evidencia de código):

- S1: `src/styles/index.css:543` — `.nav-item { color: var(--accent-mint) }`, y
  `--accent-mint: #4ECDC4` no está redefinido en `warm-light`: celeste claro sobre
  `--bg-2` (#EAE2DB) da ~1.45:1. El comentario de esa línea dice "Mint-cyan for high
  contrast against dark nav background": era correcto en oscuro y quedó mal en claro.
  Entró en `fd4332f`, no en esta ronda.
- S2: `InversionCard` resta `valor − capital` sin mirar los retiros. `fn_reporte_cartera_inversiones`
  ya devuelve `monto_liquidado`, y el nominal por inversión ya lo suma; el front no lo usa.
- S3: `DetalleInversionView.css:238` — `.detalle-yield` fija `font-family: var(--font-mono)`
  y `.detalle-yield--na` cambia color e itálica pero no la familia: el mensaje sale en
  monoespaciada itálica.
- S4: `DistribucionView` imprime siempre el paréntesis con la conversión a moneda local y
  `DistribucionDonut` centra el "100%".
- S5: el nominal por inversión suma `COALESCE(i.monto_liquidado, 0)` (SQL 90), pero el
  agregado de la cabecera no: por eso Bitcoin da −30% en la cabecera y +10% en el detalle.
- S6: no existe botón ni RPC de aporte a una inversión existente.
- S7: las cuatro pestañas no se reparten el ancho.

**L3** — Dos trampas de test encontradas y corregidas en esta ronda:

- `lightModeSettings.test.js` y `contraste-y-layout.test.js` ubicaban el bloque del tema
  claro con `indexOf` y cortaban en el primer `}`. Al agregar
  `[data-theme='warm-light'] .nav-item:not(.active) { ... }`, ese `indexOf` devolvía LA
  REGLA y el bloque quedaba vacío: los tests marcaban once hojas de estilo como oscuras.
  Ahora los dos anclan en la llave (`... ] {`).
- `contraste-y-layout.test.js` además tenía una LISTA escrita a mano de tokens "que sólo
  existen en `:root`" que incluía `--bg-2`. Dejó de ser cierto en la ronda 4, cuando el
  tema claro pasó a definirla. El conjunto se calcula ahora desde los dos bloques, y la
  detección de "color" exige que el valor EMPIECE con un color: `--shadow-sm` contiene
  `rgba(...)` y es legítimamente igual en los dos temas.

**L4** — Verificación en pantalla, usuario 198, viewport móvil 412x915, tema `warm-light`:

- **S1**: el ítem inactivo computa `rgb(12,79,90)` sobre el fondo del nav
  `rgb(234,226,219)` = **7.5:1**; el activo sigue verde (`rgb(0,140,30)`).
- **S2**: tarjeta "Xxx" → `Original capital £500.00 (£1,000.00 − £500.00 withdrawn)` /
  `Current value £650.00` / `Gain +£150.00`. Antes la misma tarjeta mostraba −£350.
- **S3**: el mensaje computa familia **Inter** y estilo **normal**; los números del detalle
  siguen en **SFMono-Regular**. Antes el mensaje heredaba la monoespaciada y la itálica.
- **S4**: el donut dibuja `47% / 36% / 17%` y ya no hay `100%`; en la tabla sólo Galicia
  (`R$1,600`, moneda distinta de la local GBP) lleva paréntesis `(£239.53)`, y hay
  exactamente una celda `.distribucion-value-local`.
- **S6**: los botones de la tarjeta son `Update Value`, **`Add capital`** y `Liquidate`.
- **S7**: cuatro pestañas de 93px que van de x=12 a x=400 en un viewport de 412, en una
  sola fila.
- **S5**: verificado contra la base (198: −8,33% → +8,33%; usuario 1: −8,67% → +4,67%). La
  pantalla no pinta la línea del nominal para el 198 porque el widget sólo la muestra
  cuando `inflacion_disponible` es verdadero y ese usuario no tiene datos de inflación —
  condición preexistente, ajena a este arreglo.
