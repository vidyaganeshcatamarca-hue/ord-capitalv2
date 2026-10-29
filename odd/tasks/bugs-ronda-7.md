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

Investigacion sobre la base viva (user 1, `modo_presupuesto = 'base_cero'`,
`fecha_activacion_base_cero = 2026-10-27`, ciclo del 1/10 al 31/10) y sobre las
funciones reales: `fn_obtener_saldo_a_asignar`, `fn_reporte_sobres_detalle`,
`fn_configurar_modo_presupuesto`, `fn_asignar_presupuesto` y
`fn_sugerir_distribucion_activacion`.

### Lo que dice la base hoy (evidencia)

- 24 movimientos de egreso **antes** del traspaso, por **2.738.000**, y 0 despues.
- El traspaso cero las asignaciones del ciclo (`p_presupuestos` del 2026-10-01:
  6 sobres, asignado total 0), pero **no** el gasto: esos 2.738.000 siguen
  contando como `monto_gastado` del ciclo.
- Arrastres de meses anteriores todavia vivos en el ciclo actual, todos negativos:
  Cine −1.160.022, Farmacia −670.110, Computacion −340.000, Cursos IA −325.065,
  Bazar/Varios −140.080, mascotas −95.000, Panaderia −53.500, Frescos −23.155,
  snacks −20.050, higiene −15.000. Total: **−2.842.307**.
- Encabezado del modo base cero con esos datos: liquidez 2.627.275, saldo de los
  sobres del ciclo (asignado − gastado, sin arrastre) −2.287.700 y tarjetas 0.
  Sumando los arrastres negativos, el `SUM(monto_disponible)` que resta el RPC es
  −5.130.007, asi que el "disponible para asignar" sale **7.757.282** sobre una
  liquidez real de 2.627.275. La captura del dueño mostraba 7.346.752 por la
  misma razon (fecha distinta, misma formula).

### Causas (codigo, no interpretacion)

1. **El arrastre no tiene corte.** `fn_reporte_sobres_detalle` arma `arrastres`
   con `monto_limite - gastado` del mes anterior y lo suma a `monto_disponible`
   **siempre**. La variable `v_modo_presupuesto` solo se usa para `estado_sobre`
   y `metodo_sobregasto`, no para el saldo. La funcion no lee
   `fecha_activacion_base_cero`: no sabe cuando el usuario firmo el contrato.
2. **El gasto previo al traspaso se cuenta igual.** `gastos_mes` suma `p_caja`
   desde el inicio del ciclo sin mirar la fecha de activacion, asi que al activar
   todos los sobres nacen en rojo por gastos que ya ocurrieron.
3. **Los deficits suman al disponible.** `fn_obtener_saldo_a_asignar` hace
   `liquidez - SUM(monto_disponible) - cuotas`. Un sobre negativo resta negativo,
   o sea **suma**: con −2,8M de arrastre el disponible se infla en 2,8M y el
   guard de `fn_asignar_presupuesto` (que usa el mismo numero) deja presupuestar
   plata que no existe. El comentario del propio SQL lo admite: "si el sobre esta
   en rojo, al sumarlo aqui infla el disponible temporalmente".
4. **El reset apunta al ciclo equivocado si el ancla es > 1.**
   `fn_configurar_modo_presupuesto` ceros `mes_periodo =
   date_trunc('month', CURRENT_DATE)`, pero cuando `hoy < dia_ancla` el ciclo
   activo es el del mes anterior: se limpia el ciclo futuro y quedan intactas las
   asignaciones del vigente. Hay usuarios con ancla 8, 10, 28 y 31.
5. **El reset es destructivo en las dos direcciones.** El mismo
   `UPDATE ... monto_limite = 0` corre al volver a anticipado: se pierden las
   asignaciones del ciclo sin aviso y sin historico.

### Bugs de UI del modulo (base cero)

- `gruposOrdenados` esconde de su grupo todo sobre con `monto_disponible < 0`: se
  van a la alerta de "sobres excedidos" y desaparecen de la lista normal. Con el
  arrastre actual, eso vacia la pantalla.
- `handleGuardarReglas` guarda las reglas **antes** de resolver el cambio de modo;
  si el usuario cancela el modal de base cero, las reglas ya quedaron guardadas.
- `handleConfirmarActivacion` ignora los errores de asignacion (`console.warn`): la
  activacion puede quedar a medias en silencio.
- La etiqueta "PROYECCION DEL MES" del modo anticipado muestra el mismo numero que
  el disponible (liquidez libre), no una proyeccion de ingresos.
- En el modal de reglas el boton de guardar queda tapado por la barra inferior
  (captura del dueño): falta clearance del bottom nav.

### Opinion sobre el traspaso a mitad de ciclo (lo que pregunto el dueño)

La logica que propone el dueño es la correcta, con un matiz importante.

**Principio:** el modo base cero es un contrato que empieza cuando el usuario lo
firma, no cuando empieza el mes. Todo lo anterior a ese instante es historia, no
presupuesto.

1. **Corte por `fecha_activacion_base_cero`.** Esa columna ya existe. En el ciclo
   de activacion, `monto_gastado` tiene que contar solo movimientos con
   `fecha >= fecha_activacion_base_cero`, y `arrastre_mes_anterior` tiene que ser
   0 en ese ciclo y en todos los siguientes mientras dure base cero. El arrastre
   tiene sentido en "anticipado" (el sobre es una bolsa que se rellena); en base
   cero cada ciclo se asigna desde cero, por definicion.
2. **El matiz: esos gastos no hay que "perdonarlos", hay que dejar de pedirles un
   destino.** La plata ya salio de las billeteras, y el disponible se calcula
   sobre el saldo actual de las billeteras, asi que ya esta descontada. El corte
   no toca `p_caja`: solo evita que la app le exija al usuario asignarle un sobre
   a un gasto que ocurrio antes de que existiera el contrato. Si ademas se
   restaran del disponible, se contarian dos veces.
3. **Los deficits nunca suman.** El disponible para asignar tiene que restar solo
   sobres con saldo positivo (`GREATEST(monto_disponible, 0)`), o calcular
   directamente "pendiente de asignar". Un sobre en rojo es una alerta, no dinero.
   Sin esto el modo no puede cumplir lo que promete: impedir presupuestar plata
   inexistente.
4. **El traspaso no borra a ciegas.** El reset tiene que apuntar al ciclo activo
   (`fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE)`), archivar el
   `monto_limite` anterior en vez de ponerlo en 0 y decirle al usuario que se va a
   reiniciar. Volver a anticipado tampoco deberia borrar sin confirmacion.
5. **Migracion.** Los usuarios que ya activaron con esta logica necesitan un
   backfill del ciclo de activacion aplicando el corte (user 1 es el caso testigo:
   27/10 con 2,7M de gasto previo y −2,8M de arrastre).

Orden sugerido de correccion: primero 3 (es el que deja presupuestar plata
inexistente), despues 1 y 2 juntos (son el mismo corte), despues 4 y 5, y al final
los bugs de UI.

## Commits

| Commit | Task | Que entro |
| --- | --- | --- |
| `b40f727` | T1 | contrato del Enter del teclado + 5 modales de inversiones |
| `75f75d0` | T1 | whitelist del test en .gitignore |
| `151ec9b` | T2 | termometro de tarjetas en en/pt + ledger |
| `5f67404` | T3, T4 | claves publicadas, sugerencia legible, token BASECERO |
| `7af6d02` | T5 | iconos de todos los submenues |
| `dafd500` | T6 | confirmacion al volver a modo simple |
| `7b4e944` | T7 | base cero como pantalla de inicio |
| `8d2f15a` | T8 | tachito en el header y tres acciones a todo el ancho |
| `ad2d09d` | T2/T3 | ledger de la ronda 7 |
| _(L2)_ | S2, S6 | typo "cuanto" → "cuánto" y token `CERO` |

## Log

**L2 (decisión del dueño, verbatim)**

> 2. es cuanto, no cuando
> 3. CERO me gusta mas. tu propuesta es correcta, adelante

**L1 (pedido original del dueño, verbatim)**

> 1. En el módulo de inversiones chequea todas las aperturas del teclado en modo numérico cuando agregamos valores, el botón IR me esta cerrando el modal, guardandolo, en lugar tiene que funcionar como un OK, ya que todavía tengo op ciones muchas veces de otras funcionalidades para elegir, entonces toco IR y me graba, no tiene que hacer eso, tiene que funcionar como un OK, dejar el valor puesto y pasar el foco a ningún lado, simplemente a que el usuario elija donde quiere seguir poniendo el foco, chequea todo el módulo de inversiones en todos los lugares donde aparece esta posibilidad de abrir la ventana del teclado numérico para cargar valores.
> 2. hice cambios en es.ts - ajusta las traducciones a los otros idiomas y agregalos en tu proximo comit.
> 3. Haz un chequeo completo del módulo de presupuestos, pero en modo base cero. Puedes usar el User = 1; Creo que hay errores de claves no publicadas, entre otras cosas, analiza un poco posibles bugs, sobre todo de UI, y luego nos metemos en detalle una corrección de este módulo. [4 capturas] Hay algunos problemas de arrastre del mes anterior. Cuando paso de modo libertad a modo base cero, no puede haber ningún arrastre. Pero acá me trae arrastres de meses anteriores. Es cierto que también me trae los gastos realizados en ese ciclo. Eso hay que ver cómo lo resolvemos porque a mediados de mes la persona decide pasarse a modo base cero. ¿Y qué hacemos con todos los gastos de esas cuentas cuando ya no tenemos el dinero para asignarlo? Entonces deberíamos arrancar en cero desde el momento en que la persona decidió pasarse a base cero. Y no tomar en cuenta los gastos de ese ciclo hasta el momento en que se hace el traspaso. Esa me parece debe ser la lógica correcta. Dame tu opinión al respecto. En la siguiente imagen tenemos texto de una sugerencia en color amarillo, ilesible para el modo claro, tiene que ser en negro. En la siguiente imagen verás que para pasar a modo base c ero debo escribir la palabra acepto Busquemos una palabra más internacional en inglés que coincida también con lo que espera el modal para autor izarlo. podria ser 'BASECERO' u otra. propone
> 4. Que sea en el menú de ajustes, todos los submenúes donde no tenemos iconos Algunas opciones tienen iconos bien elegidos y otras no tienen ningún icono Veamos de ponerle icono a casi todo lo que se pueda A todo Si tienes dudas con los iconos me dices
> 5. En el módulo de inversiones hemos agregado la opción de eliminar una inversión, pero no me gusta como queda ahí con cuatro opciones todas apret adas en el menú flotante, así que con el tachito de basura solamente al lado del nombre de la inversión, XXX variable, bien a la derecha en la misma línea. Sin ningún nombre, solo el tachito de basura, y después rep arte los otros tres menús flotantes en todo el ancho de la pantalla, así que le prolijo.
> 6. Al intentar volver de base cero a modo libertad, obtuvo este mensaje de error sin traduc ción.
> 7. En el menú de ajustes, en la parte de operativa, al volver del modo avanzado al modo simple, pasa sin ninguna confirm ación previa. Deberíamos poner un modal de confirmación, está seguro que desea volver al modo simple para que evitemos los errores de vuelta al modo simple por error de mala digitación.
> 8. En la sección de ajustes, Datos y operaciones Presupuesto y ciclo Tenemos una opción de hacer base 0 la pantalla de inicio ON, OFF Cuando está en ON Debería ser base 0 El reemplazo del módulo HOME Pasar como primera opción del menú Y la pantalla de inicio Dejar la segunda Cuentas pasa a ser tercera Y menú sigue siendo el cuarto Eso se desactiva Cuando esa opción vuelve a OFF Volvemos al estado normal del HOME La pantalla de inicio es la principal Pero de esta manera podemos Base 0 como la primera pantalla que ve el usuario ingresar a la app cuando está prendido esa opción del menú. Actualmente tenemos la opción, pero no está funcionando el comportamiento requerido.
