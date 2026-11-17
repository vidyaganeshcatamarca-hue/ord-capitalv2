# Ahorro / Sobres — ronda de bugs 2026-11-17

16 reportes del dueño sobre el módulo Ahorro. Rama `feat/ahorro-sobres-prd`. Specs citan el pedido literal; no agregan requisitos.

Causa raíz compartida ya confirmada: `fn_sobre_pata_billetera` escribe `p_caja` con `tipo='adjustment'` y sin `estructura_egreso_id`, así que los movimientos de sobres caen en todo lo que cuenta ajustes: el "misterio" de `fn_reporte_desviacion_misterio`, el superávit de `fn_ejecutar_conciliacion` y la actividad reciente del Home.

## Specs

**S1 — Alta sin teclado.** "Al abrir un nuevo sobre, crear un nuevo sobre, se me abre la pantalla con el teclado ya cargado porque el nombre del sobre, el input está activado. Y me abre el teclado para escribir. Queda muy feo porque no se logra ver la pantalla completa con todas las descripciones. Debería arrancar sin ningún campo input activado cuando el usuario hace clic en el nombre. Ahí recién mostré el teclado." Ningún input recibe foco al abrir el alta; el teclado aparece solo con un toque voluntario.

**S2 — Teclas del teclado: "Realizar", no "siguiente"/"IR".** "elimina el botón siguiente y pone un botón de realizado, ok, para que simplemente le demos ok y no pasemos a ningún otro campo" + "Reemplazar la tecla IR del teclado por realizar para todas las funcionalidades dentro del módulo de ahorro." Aplica a todos los inputs del módulo: la tecla de acción del teclado dice "Realizar" y **no** salta al campo siguiente.

**S3 — Modalidad como dos botones.** "Estas dos opciones para definir si el dinero queda en la billetera o pasa a otra billetera Está mal presentada, deberían ser dos botones bonitos En donde la selección está bien, se vea con un borde verde como está Pero el otro botón debería estar también con borde Quizás con un borde negro y el borde verde hacerlo más grueso Que parezca más un botón." Las dos opciones se ven como botones con borde propio: la activa con borde verde más grueso, la inactiva con borde visible.

**S4 — Rendimiento como switch.** "es un botón que es alargado, está muy feo, debería ser un prender y apagar como resolvemos en otras secciones con un switch on off que quede bien clarito cuando está prendido y cuando está apagado." Se usa el mismo patrón de switch que ya existe en el proyecto.

**S5 — Qué hace el switch de rendimiento.** "cuando está en on, que es funcionalidad cumple porque yo no veo ninguna funcionalidad agregada cuando le pongo que la reserva genera rendimientos, para que sirve ponerlo en on, no le he encontrado ninguna funcionalidad, me parece que no está implementada o que ha quedado escondida." Hay que responder qué habilita y dejarlo visible, o el switch no se ofrece.

**S6 — El switch no se apaga.** "Este botón de on-off de la reserva si genera rendimientos se puede prender pero no se puede apagar."

**S7 — Reordenar a mano.** "La funcionalidad para mover manualmente los sobres, reordenar la lista de sobres de ahorro manualmente, no funciona, no mueve los sobres Hago clic en el sobre, cambia al estado manual, pero no se mueven y no se ordenan."

**S8 — Quitar la fecha límite.** "Le puse fecha límite a un sobre y luego intenté sacársela y no me dejó hacerlo. Es mucho lío poder agregar la funcionalidad de quitar la fecha límite... Simplemente que me permita dejar la fecha vacía y cuando esto ocurre le quito la funcionalidad de fecha límite."

**S9 — Importe sugerido en el aporte.** "Quise agregar un aporte a un sobre y me pareció un importe sugerido. ¿De dónde viene ese importe? ¿De dónde lo está calculando? ¿Es un buG o está a propósito?" Hay que explicar el cálculo y decidir si queda.

**S10 — Aportes y retiros en actividad reciente.** "Todos los aportes de capital en el módulo ahorro se han cargado en actividad reciente del HOM como fuga de capital misterio hervido, lo cual es incorrecto. Es simplemente un nuevo label de ahorro. Además tenemos una key cruda Saving Envelope Aporte. con los retiros de dinero de los sobres, pasa lo mismo, lo incorpora mal a la actividad recién." Etiqueta propia de ahorro, sin key cruda y sin aparecer como fuga.

**S11 — El contador de misterio no cuenta sobres.** "Este mismo BUG número 9 está incrementando el contador de fugas de capital misterio general que se usa para conciliaciones. Esto es incorrecto. El misterio de olvido es solamente para conciliaciones."

**S12 — Un rescate no genera superávit.** "Un rescate de un sobre se genera como un superávit de ajuste, lo cual es incorrecto. Ya te lo planteé en otro lado antes con el aporte. No puede afectar la cuenta de superávit ni de la conciliación. Es una cuenta nueva, la que usamos para sobres. O sea, podemos usar labels como aporte a un sobre de ahorro o retiro de un sobre de ahorro."

**S13 — No borrar movimientos de sobres desde actividad reciente.** "Borré desde actividad reciente un ingreso de capital a un sobre, lo cual está mal. El registro de esta actividad, para este tipo de actividad de sobres, no me debería permitir borrar. Porque el borrado de los sobres se hace desde el mismo módulo de sobres, no desde aquí."

**S14 — Conciliación correcta no avisa diferencia.** "si aporto 30.000 al módulo de al sobre de ahorro y yo concilio, evidentemente en la cuenta debe tener 30.000 de más. O sea que el número da bien, pero me tira un mensaje como que hay una diferencia y me hace una conciliación, un ajuste de capital por cero pesos... Cuando la conciliación está bien, aunque haya diferencias porque la plata está en un sobre, no debe dar un mensaje de ajustes."

**S15 — Fecha local, no UTC.** "Guardando en actividad reciente la fecha del registro de los aportes y de las extracciones de los sobres con fecha UTC Lo tengo que hacer con fecha local Porque por ejemplo ayer a última hora de la noche me guardo con fecha 17 de noviembre que es realmente hoy Pero la operación fue esta ayer."

**S16 — Sacar el mensaje técnico al editar.** "Al editar un sobre me parece un mensaje al final que debería omitirse Se corrige el movimiento original, no se agrega uno nuevo, esa información está de más No es una información que le damos al usuario."

**S17 — El volver es un botón.** "una vez dentro de un sobre, el botón de volver hacia atrás se pierde en medio de todo el texto, no tiene marco, no tiene fondo, haz que sea un botón, usa el patrón que ya tenemos en otras pantallas."

## Tasks

| ID | Specs | Alcance | Ruta | Commit |
| --- | --- | --- | --- | --- |
| T1 | S10, S11, S12 | Clasificar la pata de sobre con estructura propia y excluirla del misterio y del superávit | `funcionesSQL/fn_sobre_pata_billetera.md`, `fn_reporte_desviacion_misterio.md`, `fn_ejecutar_conciliacion.md` | — |
| T2 | S1, S2 | Foco inicial y teclas del teclado en los modales del módulo | `src/components/sobres/*` | — |
| T3 | S3 | Modalidad como dos botones con borde | `SobreAporteModal.*`, `sobresModal.css` | — |
| T4 | S4, S5, S6 | Switch de rendimiento y funcionalidad visible | `SobreMovimientoModal.*`, `sobresModal.css` | — |
| T5 | S7 | Reordenar a mano | `useOrdenArrastre.ts`, `SobresPage.tsx` | — |
| T6 | S8 | Quitar la fecha límite | `fn_sobre_editar.md`, `SobreFormModal.tsx` | — |
| T7 | S9 | Origen del importe sugerido | `SobreAporteModal.tsx` | — |
| T8 | S13 | Sin borrado desde actividad reciente | `fn_exportar_movimientos.md` o el reporte de actividad, `HomePage.tsx` | — |
| T9 | S14 | Conciliación sin aviso cuando la diferencia la explica el sobre | `fn_ejecutar_conciliacion.md` | — |
| T10 | S15 | Fecha local en los movimientos de sobres | `fn_sobre_pata_billetera.md`, frontend | — |
| T11 | S16 | Sacar el mensaje técnico | locales, `SobreDetail.tsx` | — |
| T12 | S17 | Botón de volver con el patrón del proyecto | `SobreDetail.*`, `index.css` | — |

## Log

**L1 (2026-11-17)** — Pedido del dueño, verbatim: "vamos con varios arreglos de modulo ahorro" seguido de 16 reportes numerados (1–14, 15 dos veces), cada uno con su captura en `C:\Users\VIDYAG~1\AppData\Local\Temp\gpPEegME\`.

**L2 (2026-11-17)** — Importe sugerido, verbatim: "Si se agrega un botón que diga sugerido mensual o sugerido semanal y que el usuario pueda apretar uno de esos botones recién ahí, se agrega al input esa sugerencia, si no el input aparece vacío." Implementado: campo vacío al abrir y dos botones con la cuota formateada.

**L3 (2026-11-17)** — Fecha, verbatim: "opcion 1 para fechas". El cliente manda su fecha local. `fn_sobre_pata_billetera` y `fn_sobre_rescatar` reciben `p_fecha date DEFAULT CURRENT_DATE`; aporte y rescate mandan `fechaLocalISO()`.

**L4 (2026-11-17)** — Conciliación, verbatim: "corregi la conciliacion para que solo concilie numeros enteros, trunca los centavos independiente de los decimales elegidos en regional". `fn_ejecutar_conciliacion` trunca saldo real y teórico antes de comparar.

**Estado al cierre de L4** — 17 de 17 specs cerrados. Verificado: test transaccional de misterio PASS (465.775 − 100.000 = 365.775), pantalla de actividad reciente con "Contribution to a savings envelope — Cash · Vacas", borrado rechazado con `error_sobre_movement_not_deletable`, arrastre táctil persistido con `[118,119,117]`, y fecha 16/11 en movimiento y pata con el servidor en 17. Conciliación: 351.000 contra 351.000 con 0,37 de diferencia, sin ajuste.
