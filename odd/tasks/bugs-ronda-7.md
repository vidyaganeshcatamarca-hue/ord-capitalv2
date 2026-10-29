# Ronda 7 — teclado numérico, i18n, base cero y ajustes

Rama: `pi/inversiones-v1-puesta-punto` (rama de trabajo activa del dueño, no es la default).
Documento de especificación de la tanda 7. Cada `S#` cita el pedido del dueño sin resumir.

## Specs

**S1 — Inversiones: el botón "IR" del teclado numérico no debe guardar.**
"C:\...\pi-clipboard-97571736...png" (item 1 del pedido) —
"En el módulo de inversiones chequea todas las aperturas del teclado en modo numérico cuando
agregamos valores, el botón IR me esta cerrando el modal, guardandolo, en lugar tiene que
funcionar como un OK, ya que todavía tengo op ciones muchas veces de otras funcionalidades para
elegir, entonces toco IR y me graba, no tiene que hacer eso, tiene que funcionar como un OK,
dejar el valor puesto y pasar el foco a ningún lado, simplemente a que el usuario elija donde
quiere seguir poniendo el foco, chequea todo el módulo de inversiones en todos los lugares donde
aparece esta posibilidad de abrir la ventana del teclado numérico para cargar valores."

**S2 — es.ts: propagar los cambios a los otros idiomas.**
"hice cambios en es.ts - ajusta las traducciones a los otros idiomas y agregalos en tu proximo
comit." Las tres claves modificadas por el dueño son `card_termometer_help_indice`,
`card_termometer_help_cuota` y `card_termometer_help_capacidad`.

**S3 — Presupuestos (base cero): claves no publicadas.**
"Creo que hay errores de claves no publicadas, entre otras cosas." Se ven las claves crudas
`budget_exceeded_envelopes_title`, `budget_exceeded_envelopes_desc`, `btn_cubrir_deficit`,
`btn_configure_later`, `budget_btn_activating`, `budget_btn_confirm_and_assign`,
`budget_error_insufficient_funds`.

**S4 — Sugerencia inicial: texto ilegible en modo claro.**
"En la siguiente imagen tenemos texto de una sugerencia en color amarillo, ilesible para el modo
claro, tiene que ser en negro."

**S5 — Base cero: sin arrastre del ciclo anterior (análisis + opinión).**
"Hay algunos problemas de arrastre del mes anterior. Cuando paso de modo libertad a modo base
cero, no puede haber ningún arrastre. Pero acá me trae arrastres de meses anteriores. Es cierto
que también me trae los gastos realizados en ese ciclo. [...] Entonces deberíamos arrancar en
cero desde el momento en que la persona decidió pasarse a base cero. Y no tomar en cuenta los
gastos de ese ciclo hasta el momento en que se hace el traspaso. Esa me parece debe ser la lógica
correcta. Dame tu opinión al respecto."
En esta ronda se entrega el análisis y la opinión; la corrección es otra ronda.

**S6 — Palabra de confirmación internacional para activar base cero.**
"para pasar a modo base c ero debo escribir la palabra acepto Busquemos una palabra más
internacional en inglés que coincida también con lo que espera el modal para autor izarlo.
podria ser 'BASECERO' u otra. propone"

**S7 — Ajustes: iconos en todos los submenúes.**
"Que sea en el menu de ajustes, todos los submenúes donde no tenemos iconos Algunas opciones
tienen iconos bien elegidos y otras no tienen ningún icono Veamos de ponerle icono a casi todo
lo que se pueda A todo Si tienes dudas con los iconos me dices"

**S8 — Detalle de inversión: tachito al lado del nombre y tres acciones a todo el ancho.**
"En el módulo de inversiones hemos agregado la opción de eliminar una inversión, pero no me
gusta como queda ahí con cuatro opciones todas apret adas en el menú flotante, así que con el
tachito de basura solamente al lado del nombre de la inversión, XXX variable, bien a la derecha
en la misma línea. Sin ningún nombre, solo el tachito de basura, y después rep arte los otros
tres menús flotantes en todo el ancho de la pantalla, así que le prolijo."

**S9 — Error de base cero bloqueada sin traducir.**
"Al intentar volver de base cero a modo libertad, obtuvo este mensaje de error sin traduc ción."
La UI mostraba la clave cruda `error_base_cero_locked`.

**S10 — Volver a modo simple pide confirmación.**
"En el menú de ajustes, en la parte de operativa, al volver del modo avanzado al modo simple,
pasa sin ninguna confirm ación previa. Deberíamos poner un modal de confirmación, está seguro que
desea volver al modo simple para que evitemos los errores de vuelta al modo simple por error de
mala digitación."

**S11 — Base cero como pantalla de inicio.**
"En la sección de ajustes, Datos y operaciones Presupuesto y ciclo Tenemos una opción de hacer
base 0 la pantalla de inicio ON, OFF Cuando está en ON Debería ser base 0 El reemplazo del módulo
HOME Pasar como primera opción del menú Y la pantalla de inicio Dejar la segunda Cuentas pasa a
ser tercera Y menú sigue siendo el cuarto Eso se desactiva Cuando esa opción vuelve a OFF
Volvemos al estado normal del HOME La pantalla de inicio es la principal Pero de esta manera
podemos Base 0 como la primera pantalla que ve el usuario ingresar a la app cuando está prendido
esa opción del menú. Actualmente tenemos la opción, pero no está funcionando el comportamiento
requerido."

## Tasks

| ID | Specs | Ruta | Commit |
| --- | --- | --- | --- |
| T1 | S1 | keypad helper + 5 modales de inversiones | `fix(inversiones): el enter del teclado numerico no guarda` |
| T2 | S2 | en.ts + pt.ts (termómetro tarjetas) | `fix(i18n): propaga el texto del termometro a en/pt` |
| T3 | S3, S4, S6 | locales (presupuestos) + `.disclaimer-tip` + token `BASECERO` | `fix(presupuestos): claves publicadas, sugerencia legible y token de confirmacion` |
| T4 | S9 | locales `error_base_cero_locked` | `fix(presupuestos): traduce error_base_cero_locked` |
| T5 | S7 | `settingsMenu.ts` + iconos del hub | `feat(ajustes): icono en todos los submenues` |
| T6 | S10 | `ConfiguracionHub.tsx` (volver a simple) | `feat(ajustes): confirmacion al volver a modo simple` |
| T7 | S11 | hook base cero + `BottomNav` + `App.tsx` | `feat(ajustes): base cero como pantalla de inicio` |
| T8 | S8 | `DetalleInversionView.tsx` + CSS | `feat(inversiones): eliminar junto al nombre y acciones a todo el ancho` |
| T9 | S5 | análisis en este documento (`## Analisis base cero`) | sin código |

## Analisis base cero

Se completa al cerrar T9.

## Log

**L1 (pedido original del dueño, verbatim)**

> 1. En el módulo de inversiones chequea todas las aperturas del teclado en modo numérico cuando agregamos valores, el botón IR me esta cerrando el modal, guardandolo, en lugar tiene que funcionar como un OK, ya que todavía tengo op ciones muchas veces de otras funcionalidades para elegir, entonces toco IR y me graba, no tiene que hacer eso, tiene que funcionar como un OK, dejar el valor puesto y pasar el foco a ningún lado, simplemente a que el usuario elija donde quiere seguir poniendo el foco, chequea todo el módulo de inversiones en todos los lugares donde aparece esta posibilidad de abrir la ventana del teclado numérico para cargar valores.
> 2. hice cambios en es.ts - ajusta las traducciones a los otros idiomas y agregalos en tu proximo comit.
> 3. Haz un chequeo completo del módulo de presupuestos, pero en modo base cero. Puedes usar el User = 1; Creo que hay errores de claves no publicadas, entre otras cosas, analiza un poco posibles bugs, sobre todo de UI, y luego nos metemos en detalle una corrección de este módulo. [4 capturas] Hay algunos problemas de arrastre del mes anterior. Cuando paso de modo libertad a modo base cero, no puede haber ningún arrastre. Pero acá me trae arrastres de meses anteriores. Es cierto que también me trae los gastos realizados en ese ciclo. Eso hay que ver cómo lo resolvemos porque a mediados de mes la persona decide pasarse a modo base cero. ¿Y qué hacemos con todos los gastos de esas cuentas cuando ya no tenemos el dinero para asignarlo? Entonces deberíamos arrancar en cero desde el momento en que la persona decidió pasarse a base cero. Y no tomar en cuenta los gastos de ese ciclo hasta el momento en que se hace el traspaso. Esa me parece debe ser la lógica correcta. Dame tu opinión al respecto. En la siguiente imagen tenemos texto de una sugerencia en color amarillo, ilesible para el modo claro, tiene que ser en negro. En la siguiente imagen verás que para pasar a modo base c ero debo escribir la palabra acepto Busquemos una palabra más internacional en inglés que coincida también con lo que espera el modal para autor izarlo. podria ser 'BASECERO' u otra. propone
> 4. Que sea en el menú de ajustes, todos los submenúes donde no tenemos iconos Algunas opciones tienen iconos bien elegidos y otras no tienen ningún icono Veamos de ponerle icono a casi todo lo que se pueda A todo Si tienes dudas con los iconos me dices
> 5. En el módulo de inversiones hemos agregado la opción de eliminar una inversión, pero no me gusta como queda ahí con cuatro opciones todas apret adas en el menú flotante, así que con el tachito de basura solamente al lado del nombre de la inversión, XXX variable, bien a la derecha en la misma línea. Sin ningún nombre, solo el tachito de basura, y después rep arte los otros tres menús flotantes en todo el ancho de la pantalla, así que le prolijo.
> 6. Al intentar volver de base cero a modo libertad, obtuvo este mensaje de error sin traduc ción.
> 7. En el menú de ajustes, en la parte de operativa, al volver del modo avanzado al modo simple, pasa sin ninguna confirm ación previa. Deberíamos poner un modal de confirmación, está seguro que desea volver al modo simple para que evitemos los errores de vuelta al modo simple por error de mala digitación.
> 8. En la sección de ajustes, Datos y operaciones Presupuesto y ciclo Tenemos una opción de hacer base 0 la pantalla de inicio ON, OFF Cuando está en ON Debería ser base 0 El reemplazo del módulo HOME Pasar como primera opción del menú Y la pantalla de inicio Dejar la segunda Cuentas pasa a ser tercera Y menú sigue siendo el cuarto Eso se desactiva Cuando esa opción vuelve a OFF Volvemos al estado normal del HOME La pantalla de inicio es la principal Pero de esta manera podemos Base 0 como la primera pantalla que ve el usuario ingresar a la app cuando está prendido esa opción del menú. Actualmente tenemos la opción, pero no está funcionando el comportamiento requerido.
