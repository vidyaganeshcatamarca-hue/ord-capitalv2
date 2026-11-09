# Ronda 9 — presupuesto base cero y cuarentena OCR

Rama de trabajo: `fix/ronda-14-bugs-presupuesto-cuarentena`, creada desde `760f4a6`
(tronco = `origin/produccion`, ronda 8 incluida). Cada `S#` cita el pedido del dueño sin
resumir. B6 y B7-B9 requieren diagnóstico con evidencia antes de tocar código.

Capturas del dueño en `C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-<id>.png`.

## Specs

**S1 — Cuarentena OCR: aviso duplicado cuando las subcategorías no suman el total.** (img `85339bed`)
"Cuando editamos en cuarentena un gasto cargado con OCR y no coincide la suma de las
subcategorías con el total, aparece el mensaje duplicado como puedes ver en la imagen."

**S2 — Carga manual: iconos 50% más grandes, los 5 recientes y «ver todas» en una línea; contraste
del botón en claro y oscuro.** (img `5843e0de`)
"En la carga de datos manuales, cuando cargamos gastos, fíjate en la selección de la categoría
quiero que los íconos se muestren más grandes, un 50% más grande del tamaño actual. Tienen que
entrar los 5 íconos que se muestran, que son los últimos 5 usados, y la palabra ver todas, el
botón ver todas, tienen que entrar en una sola línea, pero agranda los íconos el 50% pero con la
condición de que entren en una sola línea, si no lo adaptas a una sola línea. El botón ver todas,
creo que le está faltando un bordecito de contraste, fíjate que funcione para modo claro y modo
oscuro."

**S3 — Ajustes: quitar el interruptor de carga por voz.** (img `d3fdda74`)
"En el menú de ajustes, preferencias / carga y registro, ahí tenemos al final una opción de
automatización carga por voz prendido apagado como es una funcionalidad que está por defecto en
todos los sistemas vamos a quitar esa opción desde el menú que nos esté más disponible va a quedar
siempre atendida por defecto."

**S4 — Base cero: la barra del sobre excedido titila.** (img `fe380560`)
"almacén despensa tiene asignado y ha gastado toda su asignación, la línea roja es correcta, el
avance es 100%, pero limpieza hogar no tiene nada asignado y tiene un saldo negativo. [...] quiero
diferenciar el sobre que se ha excedido del sobre que ha cubierto el total, entonces el cambio que
te propongo es que la línea roja del sobre que se ha excedido la hagas titilar, prender y apagar,
para que llame más la atención. [...] porque en un celular quizás no se nota muy bien la diferencia
de color."

**S5 — Base cero: separación entre tarjetas de rubros padre.** (img `786a7090`)
"cuando las diferentes categorías están todas contraídas, las que tienen subcategorías, no logro
identificar bien la diferencia de una categoría con la otra. Quiero que dejes una pequeña línea de
espacio entre una categoría padre y otra categoría padre. Cuando una categoría padre se despliega,
abajo del despliegue internamente está todo muy bien resuelto, pero la categoría padre que sigue
también con un espacio. O sea, la regla sería todas las categorías padres están separaditas con una
pequeña línea de espacio. Que se note que son tarjetas diferentes."

**S6 — user 1: 26.500 asignados en un rubro padre que no aparece como origen de transferencia.**
(img `73ebddb1`)
"ha habido algún problema en una transacción anterior de paso de dinero a otro sobre. Aparece como
que le quedó asignado 26.500, pero esto puede ser un error, porque yo recuerdo haber transferido
casi la totalidad de su importe, pero aparece asignado 26.500. Y cuando lo quiero volver a repartir
estos 26.500 que tiene asignado, es una cuenta padre, el sobre nunca aparece como opción. Así que
estos 26.500 en pantalla deben estar mal mostrados. Fíjate con el user 1 a ver qué está pasando
aquí. Acá hay un bug escondido. La última operación fue transferirle desde esta categoría padre a
otra categoría."

**S7 — Sin red no debe pedir PIN.** (img `3e84d7f1`)
"Me he pasado el teléfono a modo avión y se me ha activado el bloqueo por pin, lo cual es incorrecto
porque no tengo la configuración de pin activada, pero al no encontrar señal hay algún bug que
activa el bloqueo por pin y como no hay un pin configurado nunca puedo entrar. [...] simplemente
debe aparecer la aplicación sin conexión, pero no bloquearse."

**S8 — El aviso de sincronización debe reflejar la falta de conexión.** (img `136cfeb3`)
"el mensaje de datos sincronizados en verde. Sigo en modo avión, fíjate que no trae datos la
aplicación porque no logra conectarse con la base. Pero el cartel de datos sincronizados pareciera
hardcodeado. La aplicación no detecta que no se puede comunicar con la base [...] tendrá que estar
en rojo avisando de que no hay conexión, que se ha perdido la conexión. Entonces el usuario nunca
se entera y sospecha de un mal funcionamiento de la app cuando en realidad simplemente se ha quedado
sin conexión."

**S9 — Tras volver del modo avión, el orden del menú inferior cambia.**
(img `46f82b04`)
"al volver del modo avión, fíjate que los menús de navegación del botón ha cambiado, debería
aparecer base cero en tercera opción, pero se ha puesto el módulo tarjetas y base cero pasó a
presupuestos. Pero al ser base cero se reemplaza tarjetas por base cero, así que debería quedar
menú, cuentas, base cero. Luego cerré, volví a abrir la app y lo corrigió."

**S10 — El aviso de cuarentena se dibuja dos veces.** (img `92e0b48f`)
"el aviso de información en cuarentena quedó duplicado. En lugar de poner que tengo dos cuarentenas,
ha puesto dos sobrecitos. Probablemente una debido al OCR y otra debido a Voice, pero el que ha
hecho lío ha sido el módulo OCR, que es el último que se ha ejecutado [...] Fíjate qué puede estar
pasando, que se pone duplicado."

**S11 — Notificaciones de vencimiento de tarjeta con acción y descarte por deslizamiento.**
(user 198, img `b1ba4a7e`)
"las dos notificaciones de abajo, próximos vencimientos de tarjeta, no tiene una acción concreta. Lo
cual tendría que tenerlo. [...] Una, que al hacer clic me lleve a la posibilidad de pagar la tarjeta.
Y segunda opción, que un barrido lateral hacia cualquiera de los dos lugares me haga desaparecer la
notificación de la ventana de notificaciones. [...] Yo hago clic en la notificación y me lleva a la
acción que me está sugiriendo. Si es que corresponde, en este caso sí. Pero si la deslizo, la quito
a la notificación."

**S12 — Cuarentena OCR: el primer clic en cuotas no debe editar el valor sugerido.**
(img `1d25c09f`)
"cuando elijo pagar con tarjeta, la opción de cuotas, fíjate que me edita el número cuando hago clic
dentro de la ventana. Dijimos que el clic dentro de la ventana, lo que tengo que hacer es borrar la
cantidad de cuotas sugeridas para permitirme ingresar un valor. Pero en este campo se produce una
edición como primera opción."

**S13 — Cuarentena OCR: el botón «ir» del importe manual tiene que confirmar.**
(img `2a67a3fd`)
"cuando quiero ingresar manualmente el importe de una categoría, el botón ir no cumple ninguna
función, no funciona directamente. No hace las veces de OK o de Enter del valor ingresado. Tengo que
cerrar, cliquear fuera de la pantalla para que se me tome el valor ingresado."

**S14 — Cuarentena OCR: el pago en dólares no persiste.** (imgs `63ac03ee`, `08586bee`)
"selecciono que el pago es en dólares, misma pantalla, cuarentena, OCR, edición, elijo la tarjeta,
elijo que el pago es en dólares, guardo, pero fíjate en la segunda imagen, el valor se ha guardado
como moneda local en lugar de dólares y si vuelvo a editar me doy cuenta que nunca se configuró el
pago en dólares, el pago en dólares vuelve a aparecer apagado. Así que fíjate que ocurre, que no me
permite seleccionar el pago en dólares desde la edición de un OCR en cuarentena."

## Tasks

Ordenadas por módulo para no saltar de archivo en archivo. El número `B#` es el del pedido.

| T | Spec | Módulo | Commit |
| --- | --- | --- | --- |
| T1 | S1 | cuarentena: aviso duplicado | — |
| T2 | S12 | cuarentena: cuotas borra el sugerido | — |
| T3 | S13 | cuarentena: botón ir confirma | — |
| T4 | S14 | cuarentena: pago en dólares persiste | — |
| T5 | S10 | aviso de cuarentena duplicado | — |
| T6 | S2 | carga manual: iconos 50% y «ver todas» | — |
| T7 | S3 | ajustes: quitar interruptor de voz | — |
| T8 | S4 | base cero: barra excedida titila | — |
| T9 | S5 | base cero: espacio entre padres | — |
| T10 | S6 | user 1: los 26.500 fantasma | — |
| T11 | S7 | sin red: no pedir PIN | — |
| T12 | S8 | sin red: aviso de conexión perdida | — |
| T13 | S9 | sin red: orden del menú inferior | — |
| T14 | S11 | notificaciones: acción y deslizamiento | — |

## Log

**L1 (2026-11-02)** — pedido del dueño, verbatim:

"Resolvamos algunos bugs del módulo de presupuesto base 0 y del módulo de cuarentena OCR.
1. pi-clipboard-85339bed. Cuando editamos en cuarentena un gasto cargado con OCR y no coincide la
suma de las subcategorías con el total, aparece el mensaje duplicado como puedes ver en la imagen.
2. pi-clipboard-5843e0de. En la carga de datos manuales, cuando cargamos gastos, fíjate en la
selección de la categoría quiero que los íconos se muestren más grandes, un 50% más grande del
tamaño actual. Tienen que entrar los 5 íconos que se muestran, que son los últimos 5 usados, y la
palabra ver todas, el botón ver todas, tienen que entrar en una sola línea, pero agranda los íconos
el 50% pero con la condición de que entren en una sola línea, si no lo adaptas a una sola línea. El
botón ver todas, creo que le está faltando un bordecito de contraste, fíjate que funcione para modo
claro y modo oscuro.
3. pi-clipboard-d3fdda74. En el menú de ajustes, preferencias / carga y resistro / ahí tenemos al
final una opción de automatización carga por voz prendido apagado como es una funcionalidad que
está por defecto en todos los sistemas vamos a quitar esa opción desde el menú que nos esté más
disponible va a quedar siempre atendida por defecto.
4. pi-clipboard-fe380560. Esta imagen es del módulo base cero, fíjate que almacén despensa tiene
asignado y ha gastado toda su asignación, la línea roja es correcta, el avance es 100%, pero
limpieza hogar no tiene nada asignado y tiene un saldo negativo. También podríamos decir que es
correcto la línea roja al 100%, pero quiero diferenciar el sobre que se ha excedido del sobre que
ha cubierto el total, entonces el cambio que te propongo es que la línea roja del sobre que se ha
excedido la hagas titilar, prender y apagar, para que llame más la atención. De esa forma se va a
diferenciar de lo anterior, aunque veo que tiene un color diferente, además le agregaría el
titilado, porque en un celular quizás no se nota muy bien la diferencia de color.
5. pi-clipboard-786a7090. Fíjate que cuando las diferentes categorías están todas contraídas, las
que tienen subcategorías, no logro identificar bien la diferencia de una categoría con la otra.
Quiero que dejes una pequeña línea de espacio entre una categoría padre y otra categoría padre.
Cuando una categoría padre se despliega, abajo del despliegue internamente está todo muy bien
resuelto, pero la categoría padre que sigue también con un espacio. O sea, la regla sería todas las
categorías padres están separaditas con una pequeña línea de espacio. Que se note que son tarjetas
diferentes.
6. pi-clipboard-73ebddb1. Esta imagen es del user 1, que ha habido algún problema en una transacción
anterior de paso de dinero a otro sobre. Aparece como que le quedó asignado 26.500, pero esto puede
ser un error, porque yo recuerdo haber transferido casi la totalidad de su importe, pero aparece
asignado 26.500. Y cuando lo quiero volver a repartir estos 26.500 que tiene asignado, es una cuenta
padre, el sobre nunca aparece como opción. Así que estos 26.500 en pantalla deben estar mal
mostrados. Fíjate con el user 1 a ver qué está pasando aquí. Acá hay un bug escondido. La última
operación fue transferirle desde esta categoría padre a otra categoría.
7. pi-clipboard-3e84d7f1. Acá tenemos algún error funcional. Me he pasado el teléfono a modo avión y
se me ha activado el bloqueo por pin, lo cual es incorrecto porque no tengo la configuración de pin
activada, pero al no encontrar señal hay algún bug que activa el bloqueo por pin y como no hay un
pin configurado nunca puedo entrar. Volví a sacar el modo avión del teléfono y se corrigió, pero no
está bien que aparezca esto, simplemente debe aparecer la aplicación sin conexión, pero no
bloquearse. Fíjate en el código que puede estar haciendo mal. Recuerda que hoy la app está haciendo
una web app porque no está implementado el APK.
8. pi-clipboard-136cfeb3. En la línea del BAC 7 tenemos también un problemita con el mensaje de datos
sincronizados en verde. Sigo en modo avión, fíjate que no trae datos la aplicación porque no logra
conectarse con la base. Pero el cartel de datos sincronizados pareciera hardcodeado. La aplicación
no detecta que no se puede comunicar con la base, lo cual es un problema porque tendrá que estar en
rojo avisando de que no hay conexión, que se ha perdido la conexión. Entonces el usuario nunca se
entera y sospecha de un mal funcionamiento de la app cuando en realidad simplemente se ha quedado
sin conexión.
9. pi-clipboard-46f82b04. Otro problema derivado del modo avión, al volver del modo avión, fíjate que
los menús de navegación del botón ha cambiado, debería aparecer base cero en tercera opción, pero se
ha puesto el módulo tarjetas y base cero pasó a presupuestos. Pero al ser base cero se reemplaza
tarjetas por base cero, así que debería quedar menú, cuentas, base cero. Luego cerré, volví a abrir
la app y lo corrigió. Pero qué pasó que luego del modo avión se generó este error en el menú de
navegación inferior.
10. pi-clipboard-92e0b48f. Ahora, fíjate que el aviso de información en cuarentena quedó duplicado.
En lugar de poner que tengo dos cuarentenas, ha puesto dos sobrecitos. Probablemente una debido al
OCR y otra debido a Voice, pero el que ha hecho lío ha sido el módulo OCR, que es el último que se
ha ejecutado y hemos hecho esta implementación. Fíjate qué puede estar pasando, que se pone
duplicado.
11. pi-clipboard-b1ba4a7e. La campanita me abre estas cuatro notificaciones. Las dos notificaciones
de arriba me llevan a la acción, pero las dos notificaciones de abajo, próximos vencimientos de
tarjeta, no tiene una acción concreta. Lo cual tendría que tenerlo. Este es el usuario 198. Y dos
cositas. Una, que al hacer clic me lleve a la posibilidad de pagar la tarjeta. Y segunda opción, que
un barrido lateral hacia cualquiera de los dos lugares me haga desaparecer la notificación de la
ventana de notificaciones. Es decir, agregar el comportamiento. Yo hago clic en la notificación y me
lleva a la acción que me está sugiriendo. Si es que corresponde, en este caso sí. Pero si la
deslizo, la quito a la notificación.
12. pi-clipboard-1d25c09f. En el menú de edición de cuarentena de un OCR, de un ticket, cuando elijo
pagar con tarjeta, la opción de cuotas, fíjate que me edita el número cuando hago clic dentro de la
ventana. Dijimos que el clic dentro de la ventana, lo que tengo que hacer es borrar la cantidad de
cuotas sugeridas para permitirme ingresar un valor. Pero en este campo se produce una edición como
primera opcion.
13. pi-clipboard-2a67a3fd. En el mismo menú de edición de un OCR, cuando quiero ingresar manualmente
el importe de una categoría, el botón ir no cumple ninguna función, no funciona directamente. No
hace las veces de OK o de Enter del valor ingresado. Tengo que cerrar, cliquear fuera de la pantalla
para que se me tome el valor ingresado.
14. pi-clipboard-63ac03ee + pi-clipboard-08586bee. Dos imágenes, la primera para que veas que
selecciono que el pago es en dólares, misma pantalla, cuarentena, OCR, edición, elijo la tarjeta,
elijo que el pago es en dólares, guardo, pero fíjate en la segunda imagen, el valor se ha guardado
como moneda local en lugar de dólares y si vuelvo a editar me doy cuenta que nunca se configuró el
pago en dólares, el pago en dólares vuelve a aparecer apagado. Así que fíjate que está ocurriendo,
que no me permite seleccionar el pago en dólares desde la edición de un OCR en cuarentena."
