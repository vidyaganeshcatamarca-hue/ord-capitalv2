# Ronda 3 de bugs — Inversiones, Inflación, Home y Presupuestos

Diez defectos reportados por el dueño el 2026-10-23 sobre la app en producción
(`4b2c0fc`). Siete son de presentación o de cálculo acotado; dos son
investigaciones (prorrateo de inflación y moneda heredada) y una define un
comportamiento nuevo en Presupuestos.

**Rama**: `pi/inversiones-v1-puesta-punto` · **Base**: `258ec57` · **Estado**: abierta

## Specs

### S1 — Historial de movimientos: el signo y el color estaban invertidos

> "tenemos los signos y los colores cambiados para este caso, lo que está con
> signo menos es lo que agregamos a la inversión por lo tanto tiene que estar en
> positivo y en verde y lo que está en verde tiene que estar en negativo y en rojo
> porque es lo que sacamos o lo que perdimos entonces la ganancia va en verde
> positiva o los ingresos y las pérdidas y los egresos van en rojo o en negativo"

Medido en la captura: `Rescate de inversión: Bitcoin` sale **verde y `$ 200.000`**
(sin signo), e `Inversión: Prueba` sale **rojo y `-$ 100`**. Debe ser al revés:
aportes en verde con `+`, rescates en rojo con `-`.

### S2 — Inflación: el botón Guardar aparece sin cambios

> "La primera vez que entras a la pestaña de inflación aparece el botón guardar,
> pero no se ha hecho ningún cambio en la fuente de inflación. Por lo tanto, el
> botón guardar solo aparece cuando hay cambios en la fuente. No sé por qué la
> primera vez registra como si hubiera algún cambio. Fíjate qué pasa."

### S3 — Portfolio: la ganancia muestra el porcentaje como si fuera monto

> "la ganancia aparece mal en número, no está haciendo bien la resta, sino que está
> mostrando el porcentaje, pero lo muestra como número. Ahí debe mostrar la
> ganancia en número, no el porcentaje."

Medido: Bitcoin capital `ARS 500.000` → valor `ARS 350.000` muestra `+ARS 10`;
Cripto try `R$ 2.500,00` → `R$ 3.000,00` muestra `+R$ 20,00`. El 10 y el 20 son
porcentajes impresos con formato de moneda.

### S4 — Home: el total del header se corta en inglés

> "Fíjate la ventana principal de valores, en el header, que no se muestra bien el
> valor total. Esto cuando la aplicación está en inglés lo muestra mal. Algo pasa
> con el título que lo agranda y no puede meter bien los valores completos, que
> aparezca el número completo. Si esto yo lo paso a español, lo muestra bien."

Medido: `MY PORTFOLIO (TOTAL)   ARS 1.258....`. En español, `MI CARTERA` es más
corto y el número entra. **El número no se corta nunca**: si falta espacio, cede
la etiqueta.

### S5 — Inflación: la fuente no se refresca después de guardar

> "Apenas cambio la fuente de la configuración de la inflación, abajo no refresca
> el cambio después que le doy a grabar, sino que tengo que cambiar a portfolio o a
> history y después volver a inflación para que pueda ver cuál es la fuente
> seleccionada. Debes refrescar la fuente una vez grabada, una vez puesto el save
> o lo guardar, debes refrescar la fuente inmediatamente."

### S6 — Gráfico: distribuir por inversión, no por tipo

> "En la pestaña de gráfico está haciendo la distribución por tipo de inversión, lo
> cual es incorrecto. Tienes que distribuir por cada una de las inversiones que
> tenemos. Si tengo cinco inversiones, muestro las cinco inversiones con sus
> diferentes porcentajes. Si tengo tres, muestro tres. Si tengo una, una. No
> mostramos la distribución por tipo variable o plazo fijo. Eso está mal."

Medido: una sola fila `Variable (2) — ARS 1.258.930 — 100,00%`.

### S7 — Inflación manual: el ejemplo parece texto ya cargado

> "el ejemplo está escrito con un color muy fuerte, por lo tanto parece una celda
> ya escrita. Lo que tienes que hacer es poner un color super suave, que se vea,
> pero un gris mucho más clarito, para que se entienda que es un ejemplo y que no
> está escrito"

El input muestra `E.g.: 35` / `Ej.: 35` como placeholder, con un gris demasiado
oscuro.

### S8 — Inflación manual: el valor es acumulado hasta hoy, no anual

> "yo pongo la inflación anual hasta ese momento. Ese es el dato que yo pongo.
> Entonces, debo tomar ese dato, no como el dato anual por 12 meses. Por ejemplo,
> estoy en octubre y pongo el valor de la inflación hasta octubre. Ese valor
> corresponde hasta el día que la cargo, hasta octubre. No es el valor anual. [...]
> Si yo ingreso la inflación anual, el cálculo que deberíamos hacer sería... Si la
> ingreso en octubre, calcular cuánto es la inflación por mes promedio y llevarla a
> 12 meses. Entonces divido, octubre es el mes 10, cargo la inflación anual hasta
> octubre, lo divido en 10 meses y lo multiplico por 12 y ahí obtengo un estimado
> de la inflación anual."

Regla del dueño: `anual_estimada = acumulada / meses_transcurridos * 12`
(simple; él lo pidió así, con el ejemplo 5% en octubre → 6%).

> "Luego me tienes que explicar, sabiendo la inflación anual, cómo haces tanto con
> la manual como con la de dólar para calcular desde cuándo el usuario puso la
> inversión hasta el tiempo que lleva para calcular la inflación prorrateando los
> días que está sufriendo la inversión de esa inflación. Explícame cómo lo tienes
> calculado para que yo lo pueda entender bien y veamos cuál es el mejor método."

**Esta S no se implementa sin explicación previa y conforme del dueño.**

### S9 — Home y demás: la moneda local viene del dispositivo, no del usuario

> "Este usuario, la imagen 1, muestra su configuración de moneda local argentina.
> Pero [...] se muestra el símbolo de la libra esterlina inglesa. ¿Qué ha pasado?
> [...] En el mismo teléfono, antes de que ingrese este usuario, que es el usuario
> 20, que ingresa por mail, no ingresa por Google, toma la configuración del usuario
> anterior logueado en el mismo teléfono. [...] Lo curioso es que si yo me logueo
> con el usuario número 1, que tiene la moneda local argentina, y luego entro con el
> usuario 20, el usuario 20 toma la moneda local argentina y las monedas segunda y
> tercera del usuario 1. Chequea si es un problema del usuario 20 o si es un
> problema de que estoy tomando del dispositivo información que debería tomar de la
> base de datos. [...] Explícame qué está pasando cuando encuentres el bug
> correctamente."

Medido: la configuración del usuario 20 guardada dice `Argentina · ARS`, secundaria
`BRL`, tercera `ARS`; Home muestra `TOTAL £ 9.895.596`.

### S10 — Presupuestos: las tarjetas con asignación abren el detalle

> "las tarjetas que ya tienen asignado un presupuesto no muestran esta información.
> el comportamiento que quiero es que al tocar las tarjetas que ya tienen
> asignaciones, me muestre la información que muestran las tarjetas que no tienen
> asignaciones. Se abre una ventanita con una X de cerrar, donde me muestre esa
> información como un detalle de lo que fue. Toda la información, lo asignado, lo
> gastado, lo asignado el último mes, lo gastado el último mes y el promedio de los
> últimos seis meses. [...] en las categorías con asignaciones, esta información no
> se muestra en la tarjeta original, sino que se muestra al hacer clic en la
> tarjeta. Y en las tarjetas que no tienen asignaciones, todavía se muestra esta
> información tal cual se está haciendo ahora."

## Tasks

| ID | S | Qué | Ruta | Commit |
|---|---|---|---|---|
| T1 | S1 | Invertir signo y color del historial de movimientos | inline si es 1 archivo | — |
| T2 | S2 | Dirty state inicial del form de inflación | inline | — |
| T3 | S3 | Ganancia del portfolio como monto, no porcentaje | inline | — |
| T4 | S4 | Header: el número nunca se corta | inline | — |
| T5 | S5 | Refrescar la fuente al guardar | inline | — |
| T6 | S6 | Gráfico por inversión | inline | — |
| T7 | S7 | Placeholder del ejemplo en gris suave | inline | — |
| T8 | S8 | Explicar el prorrateo y esperar decisión | read-only | — |
| T9 | S9 | Investigar la moneda heredada del dispositivo | read-only → fix | — |
| T10 | S10 | Modal de detalle en tarjetas con asignación | módulo presupuestos | — |

## Log

**L1** (2026-10-23, verbatim):

> vamos con Una serie de bugs:
> 1. Esta imagen de historial de movimientos de una inversión podemos ver que
> tenemos los signos y los colores cambiados para este caso, lo que está con signo
> menos es lo que agregamos a la inversión por lo tanto tiene que estar en positivo
> y en verde y lo que está en verde tiene que estar en negativo y en rojo porque es
> lo que sacamos o lo que perdimos entonces la ganancia va en verde positiva o los
> ingresos y las pérdidas y los egresos van en rojo o en negativo
> 2. La primera vez que entras a la pestaña de inflación aparece el botón guardar,
> pero no se ha hecho ningún cambio en la fuente de inflación. Por lo tanto, el
> botón guardar solo aparece cuando hay cambios en la fuente. No sé por qué la
> primera vez registra como si hubiera algún cambio. Fíjate qué pasa.
> 3. En el portfolio de inversiones, las diferentes inversiones, la ganancia aparece
> mal en número, no está haciendo bien la resta, sino que está mostrando el
> porcentaje, pero lo muestra como número. Ahí debe mostrar la ganancia en número,
> no el porcentaje.
> 4. Fíjate la ventana principal de valores, en el header, que no se muestra bien el
> valor total. Esto cuando la aplicación está en inglés lo muestra mal. Algo pasa
> con el título que lo agranda y no puede meter bien los valores completos, que
> aparezca el número completo. Si esto yo lo paso a español, lo muestra bien. No sé
> por qué.
> 5. Apenas cambio la fuente de la configuración de la inflación, abajo no refresca
> el cambio después que le doy a grabar, sino que tengo que cambiar a portfolio o a
> history y después volver a inflación para que pueda ver cuál es la fuente
> seleccionada. Debes refrescar la fuente una vez grabada, una vez puesto el save o
> lo guardar, debes refrescar la fuente inmediatamente.
> 6. En la pestaña de gráfico está haciendo la distribución por tipo de inversión,
> lo cual es incorrecto. Tienes que distribuir por cada una de las inversiones que
> tenemos. Si tengo cinco inversiones, muestro las cinco inversiones con sus
> diferentes porcentajes. Si tengo tres, muestro tres. Si tengo una, una. No
> mostramos la distribución por tipo variable o plazo fijo. Eso está mal.
> 7. Ahora vamos a la configuración de la inflación manual, el ejemplo está escrito
> con un color muy fuerte, por lo tanto parece una celda ya escrita. Lo que tienes
> que hacer es poner un color super suave, que se vea, pero un gris mucho más
> clarito, para que se entienda que es un ejemplo y que no está escrito
> 8. Cuando elijo la configuración manual de la inflación, yo pongo la inflación
> anual hasta ese momento. Ese es el dato que yo pongo. Entonces, debo tomar ese
> dato, no como el dato anual por 12 meses. Por ejemplo, estoy en octubre y pongo el
> valor de la inflación hasta octubre. Ese valor corresponde hasta el día que la
> cargo, hasta octubre. No es el valor anual. Entonces, debo aplicar esa inflación
> hasta esa fecha y no considerarla anual, porque anual va a ser diferente. Voy a
> tener que seguir modificándola. Entonces, lo que sugiero que hagamos para ser
> ordenados es lo siguiente. Si yo ingreso la inflación anual, el cálculo que
> deberíamos hacer sería... Si la ingreso en octubre, calcular cuánto es la
> inflación por mes promedio y llevarla a 12 meses. Entonces divido, octubre es el
> mes 10, cargo la inflación anual hasta octubre, lo divido en 10 meses y lo
> multiplico por 12 y ahí obtengo un estimado de la inflación anual. Luego me tienes
> que explicar, sabiendo la inflación anual, cómo haces tanto con la manual como con
> la de dólar para calcular desde cuándo el usuario puso la inversión hasta el
> tiempo que lleva para calcular la inflación prorrateando los días que está
> sufriendo la inversión de esa inflación. Explícame cómo lo tienes calculado para
> que yo lo pueda entender bien y veamos cuál es el mejor método para hacerlo con
> estas modificaciones que te digo del ingreso manual.
> 9. Acá tenemos un problema rarísimo que quiero que investigues con mucha atención.
> Este usuario, la imagen 1, muestra su configuración de moneda local argentina. Pero
> se muestra, cuando se muestra su moneda, se muestra tanto aquí en Home como en
> tarjetas y en presupuestos, el símbolo de la libra esterlina inglesa. ¿Qué ha
> pasado? Y también la segunda y la tercera moneda están mal. ¿Qué ha pasado? En el
> mismo teléfono, antes de que ingrese este usuario, que es el usuario 20, que
> ingresa por mail, no ingresa por Google, toma la configuración del usuario anterior
> logueado en el mismo teléfono. En este caso se logueó el usuario 198, que tiene
> Reino Unido como país local, y la libra esterlina como moneda local, y las monedas
> que aparecen en la imagen 1 son las mismas que tiene configurado el usuario 198.
> Cuando me logueo nuevamente con el usuario 20, este toma, no sé por qué motivo, del
> dispositivo, estas referencias de la moneda local y de la segunda y la tercera
> moneda. No sé si es un problema del usuario 20, que está mal configurado, o es un
> problema que queda en el dispositivo, está tomando del dispositivo la información y
> no de la base de datos. Lo curioso es que si yo me logueo con el usuario número 1,
> que tiene la moneda local argentina, y luego entro con el usuario 20, el usuario 20
> toma la moneda local argentina y las monedas segunda y tercera del usuario 1.
> Chequea si es un problema del usuario 20 o si es un problema de que estoy tomando
> del dispositivo información que debería tomar de la base de datos. Como moneda,
> país, moneda local, moneda secundaria y moneda terciaria. Explícame qué está
> pasando cuando encuentres el bug correctamente. Investiga el usuario 20 a ver si
> tiene alguna deficiencia en la información, por lo cual no está pudiendo tomar bien
> la moneda local, que en realidad la toma pero la muestra mal. Y la segunda y la
> tercera moneda creo que la muestra mal también o la toma mal. no se investiga
> 10. Fíjate en el menú de presupuestos, por ejemplo, Snack and Suites, tengo toda la
> información que necesita mostrar una tarjeta. Lo asignado el último mes, lo gastado
> el último mes, el promedio de los últimos seis meses. Fíjate que las tarjetas que ya
> tienen asignado un presupuesto no muestran esta información. el comportamiento que
> quiero es que al tocar las tarjetas que ya tienen asignaciones, me muestre la
> información que muestran las tarjetas que no tienen asignaciones. Se abre una
> ventanita con una X de cerrar, donde me muestre esa información como un detalle de
> lo que fue. Toda la información, lo asignado, lo gastado, lo asignado el último mes,
> lo gastado el último mes y el promedio de los últimos seis meses. Entonces, para
> quedar claros, en las categorías con asignaciones, esta información no se muestra en
> la tarjeta original, sino que se muestra al hacer clic en la tarjeta. Y en las
> tarjetas que no tienen asignaciones, todavía se muestra esta información tal cual se
> está haciendo ahora. Ese es el comportamiento que acabo de definir.

**L2** — Hallazgos colaterales de las capturas, no pedidos pero reales: el texto
`Calculated inflation: 12,62%%` lleva **doble signo de porcentaje** (capturas 2 y 8),
y en la captura 8 el bloque de inflación acumulada dice `2,47% · last 6 months`
mientras el input vale `5`. Se reportan al dueño; se corrigen solo si caen dentro
del mismo archivo que ya hay que tocar.
