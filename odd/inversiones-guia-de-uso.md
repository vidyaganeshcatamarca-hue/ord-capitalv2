# Módulo Inversiones — guía de uso

> **Estado:** en desarrollo, todavía **no está publicado en producción**. Se puede
> probar en local; la publicación la habilita el dueño del producto.
> **Versión del documento:** 1.0 · **Rama de trabajo:** `pi/inversiones-v1-puesta-punto`

---

## 1. Qué es este módulo en una frase

Es el lugar donde **decís cuánto pusiste fuera del banco** — ese dinero que no está en
tu cuenta pero que sigue siendo tuyo — y **seguís cuánto te está rindiendo**.

No es un cotizador de precios ni un bróker. **Vos le decís cuánto vale cada inversión
y la app te dice cómo te está yendo.** La app no te va a buscar el precio del dólar
ni el del Bitcoin: esa parte la cargás vos (o la cargás cuando la app te lo pida).

---

## 2. Para quién es y qué problema resuelve

Es para el caso más común de la vida financiera adulta: **tenés plata guardada en
algún lado que no está trabajando, o que está trabajando y no sabés cuánto te está
rindiendo.**

Hoy, sin este módulo, esa plata normalmente es invisible. Si tenés un plazo fijo en
un banco y un certificado de acciones en un broker, tu balance mental es: "tengo plata en
otro lado, más o menos". Ese "más o menos" es el agujero.

Este módulo te da tres cosas:

1. **Un inventario de lo que tenés afuera**, con el valor que vos le asignás.
2. **Una medida de si te está rindiendo**, en pesos y —si configurás la inflación—
   en términos de **poder de compra real**. Que tu plata "suba" 5% en un año donde la
   inflación fue 40% es perder plata. El módulo te lo dice.
3. **Un historial cerrado** de lo que ya liquidaste, para que puedas mirar atrás y ver
   si tus decisiones rindieron.

---

## 3. Cómo se llega al módulo

Desde el menú principal, la opción **Inversiones** (el ícono de la curva ascendente).

> **Importante:** el módulo es de **modo Avanzado**. Si estás en modo Simple, la
> opción Inversiones no aparece en el menú. Para verla, entrá a **Configuración** y
> activá el **modo Avanzado** (pide confirmación). Para volver al Simple, el mismo
> lugar — en un toque, sin confirmar.

No hay un acceso directo desde Supervivencia: el botón "Ver Inversiones" que aparece
ahí te lleva hoy a tus billeteras, no a este módulo.

---

## 4. Qué ves al entrar

La pantalla tiene tres zonas, de arriba hacia abajo.

### 4.1 La banda superior: cuánto tenés y cuánto te está rindiendo

Arriba del todo, en una banda fija, está **el número grande**: el valor total de tus
inversiones, expresado **en tu moneda local** (la del país que configuraste). No en
dólares, no en una moneda fija: en la tuya.

Debajo de ese número va **una línea por cada moneda en la que tenés inversiones**,
con su propio monto. Por ejemplo:

```
      12.500.000
    ARS  ·  USD 2.400
```

Esto significa: 12.500.000 pesos y 2.400 dólares, **sumados en la primera línea solo
porque es tu moneda local**. Si tenés una tercera moneda (por ejemplo euros), aparece
una tercera línea. Las monedas sin cotización de referencia **no se suman** en el
total: se listan aparte, porque sumarconvertidas a ojo sería mentirte.

Y al lado, dos números más:

- **Rendimiento nominal**: cuánto creció tu plata en porcentaje, sin más.
- **Rendimiento real**: cuánto creció **en poder de compra**, descontando la
  inflación. Este solo aparece si configuraste tu fuente de inflación (pestaña
  *Inflación*). Antes de eso, la app te lo pide con un botón.

Y un veredicto en palabras, porque un número solo no se entiende:

> **"¡Ganaste poder adquisitivo real!"** o **"Perdiste poder adquisitivo real"**

### 4.2 La barra de pestañas

Cuatro pestañas:

| Pestaña | Qué te responde |
|---|---|
| **Cartera** | ¿Qué tengo afuera ahora mismo? |
| **Historial** | ¿Qué liquidé y cómo me fue? |
| **Distribución** | ¿Cómo está repartida mi plata? |
| **Inflación** | ¿Cómo se calcula mi rendimiento real? |

### 4.3 El botón "Nueva Inversión"

Arriba de las pestañas, el botón grande. Es la acción principal del módulo.

---

## 5. Las funcionalidades, una por una

### 5.1 Crear una inversión (Nueva Inversión)

Es el corazón del módulo. Al presionarlo se abre un formulario con cinco cosas que
llenás:

1. **Nombre del activo** — cómo lo querés llamar. Es libre: "Plazo Fijo Galicia",
   "Bitcoin", "GGAL", "Fondo Común". Este texto es tuyo y el módulo nunca lotraduce
   ni lo modifica.
2. **Tipo de activo** — Plazo Fijo, Cripto, Cedear, Acciones u Otro.
3. **Tasa Anual (TNA)** — solo si es Plazo Fijo, y es obligatoria. Es el interés
   anual pactado (por ejemplo 110% anual). **Si no la ponés, el módulo no te deja
   guardar**: sin TNA no hay forma de saber cuánto rinde.
4. **Monto** — cuánto invertiste.
5. **Moneda** — en qué moneda está esa plata. Te aparecen las tuyas: la local y las
   que hayas configurado. **No hay monedas fijas**: si dejás de usar el dólar como
   segunda moneda, desaparece de acá.
6. **Billetera de origen** — de qué cuenta salió el dinero. Solo te muestra las
   billeteras **en la misma moneda** que elegiste (no podés "invertir pesos" desde
   una billetera en dólares: no hay conversión automática).

Al guardar, pasan tres cosas:

- El dinero **sale de esa billetera** (tu balance de esa cuenta baja).
- Queda registrado como **movimiento de tipo "Inversión"** en el historial de esa
  billetera.
- Se crea la categoría "Inversiones" en tu orçamento, que agrupa este capital para
  que no se te mezcle con tus gastos del mes. Esto es lo que se llama **Base Cero**:
  el capital invertido no se gasta, queda bloqueado y separado.

> **Esa categoría es del sistema y es intocable.** No aparece en el editor de
> Categorías, no se le puede cambiar el nombre ni el ícono, no admite
> subcategorías, no se puede borrar y no admite movimientos manuales: el único
> modo de escribarle es el módulo de Inversiones. Si la vieras o quisieras
> editarla, es un error.

> **Sobre las billeteras:** si no tenés ninguna billetera activa en la moneda que
> elegiste, el módulo te avisa ("No tenés billeteras activas en esta moneda") y no
> te deja guardar. Primero creá la billetera, después invertí.

### 5.2 La Cartera: tus inversiones activas

La lista de todo lo que tenés afuera. Cada inversión es una tarjeta con:

- **Nombre y tipo** (el badge "Plazo Fijo" / "Variable").
- **Capital original**: cuánto pusiste.
- **Valor actual**: cuánto vale hoy según vos.
- **Ganancia**: la diferencia, en color (verde si ganaste, rojo si perdiste).
- **El semáforo de frescura** — con cuántos días pasó desde tu última conciliación.

El semáforo es la parte más útil de la tarjeta, porque responde "¿esto está viejo?":

| Semáforo | Significado |
|---|---|
| 🟢 **Actualizado** | La conciliaste hace menos de 30 días. Confiable. |
| 🟡 **Por actualizar** | Entre 31 y 45 días. Todavía bien, pero conviene mirarlo. |
| 🔴 **Desactualizado** | Más de 45 días. **El número que ves puede estar viejo.** |

Esto importa: el módulo **no adivina el valor** de tu inversión. Usa el valor que vos
cargaste la última vez (o el cálculo automático del plazo fijo). Si hace dos meses
que no lo actualizás, ese número es de hace dos meses, y el semáforo te lo avisa.

Sobre las tarjetas hay dos acciones rápidas (y el detalle completo tiene las mismas):

- 📊 **Actualizar Valor** (solo en activos variables).
- 💸 **Liquidar**.

### 5.3 Actualizar el valor (conciliación)

Es el botón 📊. Se abre una pantalla con el valor anterior y un campo para escribir
el valor nuevo. Cuando guardás:

- Se actualiza el valor de la inversión.
- **El semáforo vuelve a verde** y el contador de días se reinicia.
- Se recalculan la ganancia, el rendimiento nominal y el real.
- **Un plazo fijo no necesita esto**: su valor lo calcula la app sola con la TNA que
  cargaste, día por día. (Si lo conciliás a mano, la app deja de calcularlo y queda
  congelado en el valor que vos le pongas.)

### 5.4 El detalle de una inversión

Tocás la tarjeta y entrás al detalle. Ahí tenés:

- **Encabezado** con el nombre, el tipo y el semáforo.
- **Cuatro números grandes**: capital original, valor actual, rendimiento nominal,
  rendimiento real (este último te dice "configurá tu fuente de inflación" si todavía
  no lo hiciste).
- **Datos adicionales**: fecha de inicio, TNA (si tiene), moneda, fecha de tu última
  conciliación.
- **Historial de movimientos**: todos los movimientos de esa inversión en el tiempo
  — la creación, las conciliaciones, los rescates, la liquidación — con fecha,
  descripción y monto.

Al pie están las dos acciones: **Actualizar Valor** y **Liquidar**.

### 5.5 Liquidar (cierre total)

Es el botón 💸. Significa: "cerré esta inversión; el dinero volvió a mi cuenta".

El modal te muestra el capital, el valor actual y te deja escribir **cuánto
recibís total** al liquidar. La app calcula sola la **ganancia o pérdida estimada** y
te la muestra antes de confirmar, con el color correspondiente.

Elegís la **billetera de destino** (de nuevo: solo billeteras de la misma moneda) y
confirmás. Entonces:

- Ese monto **entra** a la billetera destino.
- La inversión pasa al **Historial** y desaparece de la Cartera.
- Quedan registrados, por separado y con detalle, el capital recuperado, la ganancia
  (o la pérdida). Nada se mezcla: podés ver exactamente cuánto era capital y cuánto
  era rendimiento.

> **No se puede deshacer.** Si liquidás por error, no hay "deshacer" desde la app.
> El modal te lo advierte antes de confirmar.

### 5.6 Rescate parcial (retirar una parte)

En el mismo modal de liquidación hay un modo **parcial**: no cerrás la inversión,
saco una parte del dinero.

- Escribís **cuánto querés retirar**.
- La app te avisa si el monto supera lo que te corresponde ("No podés retirar más
  que el valor actual").
- Ese monto entra a la billetera destino.
- **La inversión sigue viva**, con el saldo que queda, y su valor se actualiza.
- Si el rescate parcial ya cubrió todo el capital, la inversión se cierra sola.

Después de un rescate parcial, cuando liquides el resto, **la billetera suma solo la
parte que faltaba** — no el capital entero otra vez. El módulo lleva la cuenta
exacta para que tu balance nunca se infle.

### 5.7 El Historial: lo que ya cerraste

La pestaña **Historial** muestra las inversiones que ya liquidaste, de la más
reciente a la más antigua. Cada una con:

- **Monto original → monto recibido** (la flecha entre los dos).
- **Ganancia o pérdida** (en color).
- **Rendimiento** en porcentaje.
- **Días mantenida**: cuánto tiempo tuve esa plata invertida.
- **Fechas**: inicio y liquidación.

Es tu historial de decisiones. Después de un año, esta pestaña es la que te dice si
estás aciertando con tu plata o si la estás dejando dormir.

Dentro de esta pestaña hay un segundo nivel: el botón de **rendimiento real** abre
un gráfico de barras que compara, de un vistazo, **tu rendimiento nominal contra tu
rendimiento real**. Es la forma más rápida de ver la brecha entre "gané 12%" y
"gané 12%, pero la inflación se comió 30%".

### 5.8 La Distribución: cómo está repartida tu plata

La pestaña **Distribución** responde "¿cómo tengo parado el riesgo?".

- Un **gráfico de torta (donut)** con el reparto por tipo de activo.
- Una **tabla** debajo con, por tipo: cantidad de inversiones, valor total y
  porcentaje.

Todo en tu moneda local. Si no tenés inversiones, la pantalla te lo dice con un
estado vacío claro.

> **Ojo con un detalle honesto:** hoy la distribución agrupa en dos familias
> (plazo fijo y variable), no en los cinco tipos que elegís al crear. Es decir: una
> Cripto y una Acción cuentan como "variable". El motivo es que el sistema todavía
> no guarda el tipo fino de cada inversión —lo sabe por la TNA, no por el tipo que
> elegiste— y preferimos mostrarte dos grupos honestos antes que cinco grupos con
> información inventada. Es una mejora pendiente, ya anotada.

### 5.9 La Inflación: cómo se calcula tu rendimiento real

La pestaña **Inflación** es la configuración que hace posible el rendimiento real.
Ahí definís:

- **País** — el tuyo (Argentina, México, Brasil, Chile, Colombia, Uruguay, Paraguay,
  Bolivia o Perú).
- **Fuente de inflación**:
  - **Proxy Dólar (recomendado)**: usa el movimiento del dólar de tu país como
    aproximación de la inflación local. Es simple, automático y no necesita
    conexión a nada.
  - **Desactivado (solo nominal)**: si preferís ver solo el rendimiento nominal.
  - **API Automática**: **todavía no está disponible** — aparece deshabilitada con
    la etiqueta "Próximamente". Es el próximo paso natural del módulo.

Al guardar, la app recalcula tu rendimiento real y el veredicto del header.

**Y un detalle de la corrección:** esta pestaña ahora **recuerda lo que configuraste**.
Antes siempre te mostraba Argentina y "Proxy Dólar" de fábrica, aunque habías
guardado otra cosa. Ahora abre con tus valores reales; si nunca configuraste nada,
lo dice honestamente ("Sin configurar") en lugar de fingir una elección.

---

## 6. Qué NO hace este módulo (para no esperarlo)

Conviene ser claro, porque es la diferencia entre "no funciona" y "no está hecho":

- **No busca precios.** No cotiza dólar, Bitcoin, CEDEARs ni acciones. El valor de
  cada inversión lo cargás vos (salvo el plazo fijo, que lo calcula con la TNA).
  Integrar cotizaciones automáticas es un trabajo futuro.
- **No es un broker.** No compra ni vende nada. No hay conexión con tu banco.
- **No calcula impuestos.** No hay retención, ni ganancias de capital, ni
 cálculo técnico. Tus movimientos quedan registrados en tu historial financiero, pero
  el módulo no hace declaraciones fiscales.
- **No aparece en tu balance de gastos.** El capital invertido no es un gasto: se
  separa en su propia categoría ("Inversiones") para que no contamine tu Base Cero
  mensual. El dinero sale de la billetera, pero no se cuenta como gasto.
- **No convierte entre monedas automáticamente.** Cada inversión vive en su moneda y
  se muestra en su moneda. Para el total general sí se convierte a tu moneda local
  usando la cotización de referencia del sistema; si una moneda no tiene
  cotización, queda fuera del total y te la lista aparte.
- **No envía recordatorios de conciliar** todavía. El semáforo te avisa, pero no hay
  notificaciones automáticas (hay una categoría de notificaciones configurada para
  inversiones, pero todavía no se emite).
- **No tiene un simulador.** La interfaz tiene lugar para un botón "Simular", pero
  hoy no hace nada.
- **No muestra las inversiones en la pantalla de Inicio.** Son visibles solo dentro
  del módulo (y desde el enlace de Supervivencia). Es una decisión tomada a
  propósito: el balance del Inicio es de tu dinero líquido y del día a día.

---

## 7. Cómo se siente en el uso diario

Un recorrido típico, de punta a punta:

> **Mes 1.** Tenés 3.000.000 en una billetera. Abrís Inversiones, tocás "Nueva
> Inversión", ponés "Plazo Fijo Galicia", tipo Plazo Fijo, TNA 110%, monto 3.000.000,
> moneda pesos, billetera "Cuenta Principal". Guardás. La plata sale de la cuenta y
> el saldo queda en 0. En la Cartera, tu inversión aparece con semáforo **verde** y un
> valor actual apenas mayor al capital (un día de interés). El header dice 3.000.000
> en pesos.
>
> **Mes 3.** El plazo fijo devenga solo: el valor actual ya está ~27% arriba (tres
> meses a 110% anual). Tocás "Actualizar Valor" con el saldo real que te da el
> banco, guardás, y el semáforo vuelve a verde. El rendimiento nominal aparece en el
> header y, si configuraste inflación, también el real.
>
> **Mes 6.** Necesitás la plata. Tocás "Liquidar", escribís el total que te paga el
> banco, la app te dice "Ganancia por liquidación: +$810.000" antes de que confirmes,
> elegís la billetera destino y confirmás. La plata vuelve a tu cuenta, la inversión
> pasa al Historial con sus 180 días mantenida y su rendimiento. El saldo de tu
> billetera quedó exactamente como debía.
>
> **Un camino distinto, a mitad del año.** Necesitás solo una parte: abrís "Liquidar",
> elegís "Rescate parcial", escribís 1.000.000, la app te avisa si te pasás, y
> retirás esa parte. La inversión sigue viva con el resto. Cuando decidas cerrarla,
> liquidás lo que queda y tu billetera suma **solo** ese resto, no todo.

---

## 8. Preguntas frecuentes

**¿Puedo invertir en una moneda que no tengo en ninguna billetera?**
No. Elegís la billetera de origen y solo te aparecen las de esa misma moneda. Para
invertir en otra moneda primero tenés que tener una billetera en ella.

**El valor de mi inversión cambió, ¿la app se entera sola?**
No, salvo los plazos fijos (que se calculan con la TNA). Para el resto sos vos quien
carga el valor nuevo con "Actualizar Valor", y el semáforo te recuerda cuándo te
toca hacerlo.

**Vendí mi cripto a pérdida, ¿cómo lo registro?**
Con "Actualizar Valor" bajás el valor y la app calcula la pérdida sola. Cuando decidas
sacarlo de la cartera, usás "Liquidar" y escribís cuánto recibiste realmente.

**Liquidé una inversión dos veces por error, ¿puedo arreglarlo?**
No hay vuelta atrás desde la app: la liquidación no se puede deshacer. Por eso el
modal te muestra la ganancia/pérdida estimada antes de confirmar.

**¿Me puedo equivocar al elegir el tipo de activo?**
Hoy el tipo fino se usa solo en la ficha de la inversión, no en los cálculos ni en la
distribución. Si te equivocás, el número importante (capital, valor, rendimiento) no
se ve afectado. Y como el tipo guardado es el que elegiste, avisame si querés que
lo corrijamos.

**¿Por qué el total no coincide con la suma de mis billeteras?**
Porque son cosas distintas: el total de Inversiones es tu plata **fuera** de las
cuentas. El de las billeteras es tu plata **dentro**. Sumarlos sin separar te da
mentira.

---

## 9. Estado de madurez

| Área | Estado |
|---|---|
| Crear, conciliar, liquidar, rescatar | Completo, con las correcciones de esta tanda |
| Rendimiento nominal y real | Completo (el real depende de configurar la inflación) |
| Historial y distribución | Completo |
| Cotizaciones automáticas de activos | **Pendiente** (hoy las cargás vos) |
| Distribución por tipo fino (cripto/cedear/acciones por separado) | **Pendiente** (hoy agrupa en dos familias) |
| Fuente de inflación por API | **Pendiente** (deshabilitada, "Próximamente") |
| Notificaciones de conciliación vencida | **Pendiente** (configuradas, no emitidas) |
| Simulador de rendimientos | **Pendiente** (el botón existe, no hace nada) |
| Integración con el balance de Inicio | **Fuera de alcance por decisión** |

---

*Documento de uso, no técnico. Para el detalle de implementación y el estado de
desarrollo, ver `odd/tasks/inversiones-v1-puesta-punto.md`.*
