# Ronda 10 — presupuesto en base 0 y modo libertad

Foco del dueño: módulo presupuesto, modos base 0 y libertad. Los ítems 10 y 11 son
del módulo inversiones y quedan al final. Investigación sobre `user_id = 1` salvo
donde el ítem diga otro usuario.

## Specs

S1. Almacén/Defensa (subrubro) mostraba −50.000 por gasto sin asignación; se le
asignaron 85.506 y en vez de quedar positivo quedó −75.994.

> Fíjate, tiene que investigar el usuario 1. Teníamos en almacén de defensa, que es
> un subrubro, menos 50.000. O sea, le hemos gastado 50.000 que no estaban
> asignados. Le asigné 85.506, y en lugar de ponerse positivo, siguió un negativo,
> menos 75.994. Algún cálculo erróneo ahí. Investiga.
> Captura: pi-clipboard-8cd2561d-2bd7-4066-a1a8-787001c43ea6.png

S2. Alimentos Hogar muestra 29.244 disponible en el modal de transferencia, pero
sólo tiene 500; al intentar transferir sólo permite 500. Valor mostrado mal.

> Queriendo transferir a un sobre desde otro sobre, Alimentos Hogar me muestra
> 29.244, cuando en realidad tiene 500, nada más. Cuando quiero transferir ese
> monto, no los tiene, solamente me permite 500, pero me está mostrando mal el
> valor, de dónde lo está sacando. Averigua eso, mismo usuario, 1, base 0.
> Captura: pi-clipboard-2fe477dd-3029-467e-884e-46fcf9889771.png

S3. La asignación hecha desde el promedio de los últimos 6 meses dispara el defecto
de S1; el monto manual no.

> Este punto 3 está relacionado con el punto 1 Porque la asignación del monto lo
> hice Desde el promedio de los últimos 6 meses Y esto generó el problema Cuando
> ingresé el monto manual no hubo problema Pero desde el promedio de los últimos 6
> meses Ahí generó la dificultad del BUG1
> Captura: pi-clipboard-c381fe9f-cb65-469d-8c4f-fd9c9e636c66.png

S4. Al ingresar un monto manual se pierde de vista el disponible que había; o se
acomoda la ventana o el modal indica cuánto había disponible para asignar.

> Si voy a ingresar un monto manual en alguna categoría, pier do de pantalla lo
> disponible que quedó atrás oculto. O acomodamos mejor la ventana, lo cual es
> difícil porque se abre el teclado que ocupa mucho. O ponemos alguna indicación
> en ese modal que nos diga cuánt o había disponible para asignar.
> Captura: pi-clipboard-5e5cead8-be9a-4f93-be83-8cb8a55c2f14.png

S5. Categorías en déficit desaparecen de su lugar original; el dueño quiere que se
muestren en los dos lugares (arriba en déficit y dentro de su grupo) tanto para
padres como para subcategorías.

> Un sobre padre, categoría padre, entra en déficit, lo mu estra arriba y
> desaparece del lugar original, en este caso deseos. Ese comportamiento es
> correcto, pero para un rubro padre eso también termina escondiendo las
> subcategorías. Entonces para los rubros padre no debería desaparecer, debería
> mostrarse en ambos lugares para que se puedan mostrar las subcategorías dentro.
> ...me parece mejor idea para todos, categorías padres y sub categorías que se
> muestren tanto arriba como en el déficit, como también dentro de su lugar
> original, ya sea neces idades, deseos o diezmo
> Captura: pi-clipboard-f22b30d5-d801-4cd0-9f34-c866708b4d34.png

S6. Separación entre tarjetas colapsadas: por lo menos el doble de la actual.

> Están todas las categorías colapsadas y veo solo los rubros padres. La
> distancia, la separación entre una categoría, entre una tarjeta y otra tarjeta
> es muy pequeña. Tiene que ser por lo menos el doble. Cuando desplegamos una
> categoría padre, ahí las subcategor ías se muestran perfectamente bien.
> Captura: pi-clipboard-7a6d9135-8ff8-4fb0-9066-73e9efe9188b.png

S7. Tecnología Electro (padre, asignado 21.000) recibe un gasto de 21.000 en la
subcategoría Celular (sin límite propio): el dueño pregunta quién debe entrar en
rojo — el padre, la subcategoría, o ambas. Requiere respuesta conceptual antes de
tocar código.

> Se genera esta situación Tecnología electro, categoría padre Tiene asignado
> 21.000 Hago un gasto con la subcategoría celular De 21.000 Pero quien se debería
> poner en rojo es el padre No celular Porque celular no tiene un límite de
> asignación ¿Es correcto esto que digo? ¿O ambas deberían estar en rojo? ¿O
> solamente el padre verifica que sería lo correcto?
> Captura: pi-clipboard-6651807e-6338-472b-a6c6-292dcaa59025.png

S8. La etiqueta «libre» se confunde con «total del grupo»; pide nombres alternativos
para elegir él y modificar `es.ts`, y líneas separadoras más evidentes entre
asignado, gastado, libre y avance.

> Me ha costado mucho entender que lo libre dentro de un grupo es el presupuesto que
> puedo gastar entre las subcateg orías que no tienen asignaciones. Y se me ha
> confundido con el concepto de total del grupo, que sería total disponible del
> grupo. ¿Qué etiqueta le podemos poner a libre para que pueda refer enciar con
> claridad qué es el presupuesto libre de las categorías no asignadas? Además,
> quiero que refuerces las líneas separatorias entre asignado, gastado, libre y
> avance. Hazla más evidente, más fuerte, para que se note bien la diferencia de
> cada cuadro. Acá te pido que me sugieras nombres. Así yo elijo y podemos
> modificar en es.ts.
> Captura: pi-clipboard-161d4c0b-8a03-4368-b68a-530dce396858.png

S9. Inversiones: en la edición de una inversión no deben aparecer los tres botones
flotantes (actualizar valor, agregar capital, liquidar), ya disponibles en la
pantalla anterior.

> Esto ya es del módulo inversiones, al editar una inversión me aparece estos
> botones flotantes, actualizar valor, agre gar capital y liquidar, que ya están en
> la pantalla anterior, así que no son necesarios en la edición de una inversión.
> Yo quiero estas acciones, las tengo desde la pantalla anterior, así que quítalas
> desde la edición, esos son los tres botones flotantes.
> Captura: pi-clipboard-b89e9f72-b155-4b58-91b2-317885333f08.png

S10. Inversiones: pregunta conceptual sobre si el botón «actualizar valor» es
coherente en un plazo fijo con tasa anual, o si la app debería calcular un valor
tentativo por tiempo transcurrido. Requiere definición antes de tocar código.

> Una pregunta conceptual. Cuando la inversión es un plazo f ijo que tiene tasa
> anual, ¿es coherente el botón de actual izar valor? Puede estar, pero ¿no debería
> esa inversión ir diciéndome cuánto está haciendo el rendimiento de acuerdo al
> tiempo transcurrido? Entonces, tener como una opción de rendimiento o un valor
> actualizado tentativo y el actualizar valor es como si qu isiéramos corregir ese
> valor tentativo que nos ofrece la misma aplicación al hacer el cálculo. Consulta
> para que terminemos de definir el comportamiento.

S11. Modo libertad, `user_id = 198`: asignar a un padre y después ponerle cero rompe
el total del grupo. Hijos con 105.500 asignados y el padre sin nada, pero el total
del grupo muestra −4.000.

> Este VAL está en presupuesto modo libertad en el usuario 198. Cuando le asigno un
> valor a una categoría padre, pero después le asigno cero, quitándole la
> asignación, me genera mal el total. Por ejemplo, acá en el ejemplo, sus hijos
> tienen 105.500 as ignados y él no tiene nada asignado, pero en total del grupo me
> parecen menos 4.000. Acá hay cálculos que están mal hechos, en modo libertad.
> Captura: pi-clipboard-5e1de43e-d0bd-42ef-8cad-49d4a7821e8f.png

S12. Modo libertad: el cartel informativo explica lo disponible con el concepto
50-30-20, ajeno al cálculo. El dueño pide la explicación exacta del cálculo y
cuestiona la definición.

> En modo libertad tenemos el cálculo de lo disponible que quiero que me expliques
> exactamente cómo está calculado porque acá la explicación incluso es confusa. La
> explicación introduce el concepto de 50-30-20 que son divisiones en porcentajes de
> mis necesidades, dese os y ahorros pero ¿qué tiene que ver esa definición con el
> cálculo de lo supuesto disponible en modo libertad? ¿Qué debería ser quizás, y
> esto te lo consulto, un promedio de los últimos ingresos de los últimos meses
> menos los gastos habituales? O está mal el cartel informativo o no estamos
> haciendo bien el cálculo involucrando a 50-30-20 que nada tiene que ver.
> Captura: pi-clipboard-593936b5-ecb0-4b7a-9e80-e0a16dbf8ab0.png

S16. Cada cambio de asignación de presupuesto tiene que dejar rastro: qué valor quedó,
cuándo y con qué motivo (manual o promedio de 6 meses). Emergió de S1, porque sin
rastro no se puede responder «cuánto había antes».

> Yo veía el menos 50 en el padre, no en el hijo
> vamos con 3.

S17. Un hijo sin asignación propia no se mide contra cero: se mide contra el libre del
padre, y con eso se dibuja la barra. Sin techo en el hijo ni en el padre, no se dibuja
barra.

> Además, ¿qué te parece la idea de que comparemos el gasto del hijo que no tiene
> asignación contra la asignación del padre? Si la tiene. Entonces ahí sí podemos
> dibujar la barra.
> barra, vamos por 1.

## Tasks

Las tareas de investigación se cierran con la causa medida contra Supabase y una
respuesta al dueño; las de código con su test y su commit.

| ID  | S#        | Ruta                                  | Commit |
| --- | --------- | ------------------------------------- | ------ |
| T1  | S1, S3    | Investigar cálculo de subrubro en base 0 (user 1) | — |
| T2  | S2        | Investigar origen del 29.244 vs 500 en transferencias (user 1) | — |
| T3  | S4        | Mostrar el disponible dentro del modal de monto manual | — |
| T4  | S5        | Rubros en déficit visibles arriba y en su grupo | — |
| T5  | S6        | Duplicar la separación entre tarjetas colapsadas | — |
| T6  | S7        | Responder quién entra en rojo cuando el hijo no tiene límite | — |
| T7  | S8        | Proponer nombres para «libre» y reforzar separadores | — |
| T8  | S11       | Corregir el total del grupo en libertad con padre en cero (user 198) | — |
| T9  | S12       | Explicar el cálculo de disponible en libertad y corregir el cartel | — |
| T10 | S9        | Quitar los tres botones flotantes de la edición de inversión | — |
| T11 | S10       | Definir el comportamiento de actualizar valor en plazo fijo | — |
| T12 | S16       | Auditoría de cada cambio de asignación (emergió de S1) | `3f2ecc1` |
| T13 | S17       | Barra del hijo sin asignación contra el libre del padre | `bc0e323` |

## Log

L1 (pedido original del dueño, literal):

> vamos con base 0 y modo libertad, modulo presupuesto. Nos concentramos ahi.
> [1] Fíjate, tiene que investigar el usuario 1. Teníamos en almacén de defensa, que
> es un subrubro, menos 50.000. O sea, le hemos gastado 50.000 que no estaban
> asignados. Le asigné 85.506, y en lugar de ponerse positivo, siguió un negativo,
> menos 75.994. Algún cálculo erróneo ahí. Investiga.
> [2] Queriendo transferir a un sobre desde otro sobre, Alimentos Hogar me muestra
> 29.244, cuando en realidad tiene 500, nada más. Cuando quiero transferir ese
> monto, no los tiene, solamente me permite 500, pero me está mostrando mal el
> valor, de dónde lo está sacando. Averigua eso, mismo usuario, 1, base 0.
> [3] Este punto 3 está relacionado con el punto 1 Porque la asignación del monto lo
> hice Desde el promedio de los últimos 6 meses Y esto generó el problema Cuando
> ingresé el monto manual no hubo problema Pero desde el promedio de los últimos 6
> meses Ahí generó la dificultad del BUG1
> [4] Si voy a ingresar un monto manual en alguna categoría, pier do de pantalla lo
> disponible que quedó atrás oculto. O acomodamos mejor la ventana, lo cual es
> difícil porque se abre el teclado que ocupa mucho. O ponemos alguna indicación en
> ese modal que nos diga cuánt o había disponible para asignar.
> [5] Un sobre padre, categoría padre, entra en déficit, lo mu estra arriba y
> desaparece del lugar original, en este caso deseos. Ese comportamiento es
> correcto, pero para un rubro padre eso también termina escondiendo las
> subcategorías. Entonces para los rubros padre no debería desaparecer, debería
> mostrarse en ambos lugares para que se puedan mostrar las subcategorías dentro.
> ...me parece mejor idea para todos, categorías padres y sub categorías que se
> muestren tanto arriba como en el déficit, como también dentro de su lugar
> original, ya sea neces idades, deseos o diezmo
> [6] (sin texto, sólo captura)
> [7] Están todas las categorías colapsadas y veo solo los rubros padres. La
> distancia, la separación entre una categoría, entre una tarjeta y otra tarjeta es
> muy pequeña. Tiene que ser por lo menos el doble. Cuando desplegamos una categoría
> padre, ahí las subcategor ías se muestran perfectamente bien.
> [8] Se genera esta situación Tecnología electro, categoría padre Tiene asignado
> 21.000 Hago un gasto con la subcategoría celular De 21.000 Pero quien se debería
> poner en rojo es el padre No celular Porque celular no tiene un límite de
> asignación ¿Es correcto esto que digo? ¿O ambas deberían estar en rojo? ¿O
> solamente el padre verifica que sería lo correcto?
> [9] Me ha costado mucho entender que lo libre dentro de un grupo es el presupuesto
> que puedo gastar entre las subcateg orías que no tienen asignaciones... ¿Qué
> etiqueta le podemos poner a libre...? Además, quiero que refuerces las líneas
> separatorias entre asignado, gastado, libre y avance... Acá te pido que me
> sugieras nombres. Así yo elijo y podemos modificar en es.ts.
> [10] Esto ya es del módulo inversiones, al editar una inversión me aparece estos
> botones flotantes, actualizar valor, agre gar capital y liquidar... quítalas desde
> la edición, esos son los tres botones flotantes.
> [11] Una pregunta conceptual. Cuando la inversión es un plazo f ijo que tiene tasa
> anual, ¿es coherente el botón de actual izar valor?...
> [12] Este VAL está en presupuesto modo libertad en el usuario 198. Cuando le
> asigno un valor a una categoría padre, pero después le asigno cero, quitándole la
> asignación, me genera mal el total... en total del grupo me parecen menos 4.000.
> [13] En modo libertad tenemos el cálculo de lo disponible que quiero que me
> expliques exactamente cómo está calculado...

L2 (evidencia de S1, medida contra Supabase, user 1): el gasto del ciclo en
Almacén/Despensa son cuatro movimientos reales (55.000 recurrente del 4/11, 6.500
OCR del 5/11, 50.000 recurrente del 6/11, 50.000 recurrente del 9/11) = 161.500.
La asignación previa era 111.500, de ahí el −50.000 que el dueño recordaba. Los
85.506 salen del promedio `(50.000 + 257.000 + 25 + 35.000) ÷ 4`. **No hay error de
cálculo**: el número bajó porque se reemplazó el techo por uno menor. El defecto real
era que no quedaba rastro del valor anterior.

L3 (decisión del dueño): el promedio de 6 meses se calcula contando días y pasándolos
a meses con decimales para los meses parciales. El mes de 25 pesos **tiene que pesar**:
«No hay ningún problema que tengamos un mes con 25 porque es real y eso debe afectar el
promedio sí o sí».

L4 (decisión del dueño, S17): un hijo sin asignación se mide contra la asignación del
padre, y con eso sí se dibuja la barra. Denominador elegido: «barra, vamos por 1» = el
libre del padre, el mismo para todos los hijos sin asignación, sin repartirlo.

L5 (aclaración del dueño, corrige el análisis): el −50.000 que vio estaba en el
**padre** Alimentos-Hogar, no en el hijo. La fórmula del padre es `0 + monto_limite
− suma(gasto de los hijos)`; con techo 500 y 203.990 de hijos da −203.490, así que el
snapshot exacto no es reconstruible sin historial — que es lo que T12 vino a arreglar.

L6 (pedido del dueño): registrar un ingreso de 1.000.000 en la cuenta efectivo del
user 1 para mover el saldo a asignar. Ejecutado por RPC `fn_registrar_movimiento_caja`
(movimiento 18923, billetera 2 ARS): el saldo pasó de 220.774,99 a 1.220.774,99 y el
saldo a asignar de −96.904,74 a +903.095,26.
