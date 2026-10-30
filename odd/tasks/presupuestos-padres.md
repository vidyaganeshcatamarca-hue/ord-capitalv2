# Presupuesto en rubros padre con subcategorías

Feature: asignar presupuesto a un rubro padre que tiene hijos, como techo del conjunto.
Modos: libertad (`anticipado`) y base cero. Rama: `pi/inversiones-v1-puesta-punto`.

## Specs

**S1 — El padre puede llevar presupuesto y es el techo del grupo.**
Un rubro padre con hijos acepta un presupuesto. Ese monto es el máximo que puede consumir el
conjunto: sus hijos no pueden pasarse de ahí.

**S2 — Los hijos pueden llevar presupuesto individual, nunca mayor al del padre.**
L1: "También podrían tener presupuestos individuales y estos nunca deberían ser mayores a los del
padre." La suma de los presupuestos de los hijos no puede superar el presupuesto del padre.

**S3 — Asignar al padre y a los hijos no suma.**
L1: "Asignarle presupuesto a los padres y luego a los hijos no suma ambos, siempre los hijos están
dentro del presupuesto del padre en el caso de que existan." Total asignado del grupo = presupuesto
del padre. Si el padre tiene 500.000 y los hijos 300.000 repartidos, hay 500.000 asignados, no
800.000.

**S4 — Los rubros padre con hijos no reciben gastos.**
L2: "los rubros padres no deberian tener gastos si tienen hijos, es una regla del sistema." El
sobre del padre suma el gasto de sus hijos. Los registros históricos que violan la regla se mueven a
un hijo (T0).

**S5 — En libertad no hay arrastre.**
L2: "en modo libertad no hay arrastre de saldo, el saldo vuelve a 0 en cada ciclo." Ya es así en el
código: `v_arrastre_cero` y `v_modo_presupuesto = 'anticipado'` lo fuerzan a 0.

**S6 — El padre es un acumulador: nunca gasta y nunca arrastra por su cuenta.** (L12, L14, L16)
Su gasto es la suma de los gastos de sus hijos. Su número del mes siguiente es la suma de lo que
arrastran sus hijos con presupuesto más el fondo libre. No tiene arrastre propio, nunca.

**S11 — Cada peso tiene un solo dueño (la regla contra la duplicación).**
- Hijo con presupuesto: arrastra lo suyo respecto de su propio presupuesto, positivo o negativo.
- Hijos sin presupuesto: comparten el **fondo libre** = techo del padre − suma de presupuestos de
  los hijos. El fondo libre arrastra lo suyo respecto del gasto conjunto de esos hijos.
- El padre muestra la suma de todo lo anterior. Sumar además un arrastre propio del padre es la
  duplicación que hay que evitar.
Ningún peso puede vivir en dos niveles a la vez.

**S12 — El fondo libre es el tope de los hijos sin presupuesto.** (L15)
Un hijo libre no puede comerse la parte reservada a un hermano con presupuesto. Si el fondo libre
es 70.000 y un hijo libre llega a 80.000, la app avisa.

**S13 — La app avisa, no bloquea.** (L12)
Los presupuestos nunca frenaron un movimiento y esta feature no cambia eso: si el grupo se pasa del
techo, el padre se pinta excedido y el gasto queda cargado. Lo único que se rechaza son las
asignaciones que rompen el techo (S7).

**S14 — Asignar al padre mueve el saldo a asignar; reservar a un hijo no mueve nada.** (L17)
Con el padre en 100.000 y Despensa en 30.000, lo comprometido es **100.000**, no 130.000. Los 30.000
son una porción de los 100.000: reservarlos sólo angosta el fondo libre (100.000 → 70.000). Subir a
un hijo no cuesta plata; agrandar el grupo sí.

**S15 — Al ponerse un presupuesto al padre, sus hijos dejan de contar por separado.** (L17)
Si Despensa ya tenía 30.000 asignados y ahora el padre recibe 100.000, contar los 30.000 de Despensa
y además los 100.000 del padre restaría 130.000 por un grupo que sólo comprometió 100.000. En el
momento en que el padre tiene presupuesto, la asignación del hijo pasa a ser una porción del padre.

**S7 — Bajar el padre por debajo de lo repartido se rechaza con el detalle.**
L4: "Rechazar con el detalle". El mensaje dice cuánto hay repartido y cuánto hay que recortar.

**S8 — El techo se impone en las RPC y se explica en el frontend.**
L3: "quizas pueda ser del fornt end nomas, como salvaguarda al cargar los presupuestos." El frontend
da el mensaje amable; `fn_asignar_presupuesto` y `fn_transferir_entre_sobres` son los que impiden.
Sin trigger por ahora.

**S9 — La fila del padre no entra en las sumas globales.**
Una sola regla, escrita una vez: saldo a asignar, termómetro, proyección y telemetría dejan de contar
la fila del padre para no contar dos veces el mismo dinero.

**S10 — La activación no le sugiere montos al usuario.** (L9)
L9: "no le sugeriria nada al user, ya tiene datos suficientes para tomar la decicion de cuanto
presupuestar". El paso 2 de la activación de base cero existe y hoy deja los campos vacíos a
propósito (`PresupuestosPage.tsx:761`), así que no hay nada que adaptar para padres. Queda como
decisión aparte si la pantalla se elimina o se deja informativa.

## Tasks

| ID | Qué | Specs | Commit |
|---|---|---|---|
| T0 | Eliminar los 4 registros de testing cargados en rubros padre | S4 | hecho (script `temp_sql/150_borrar_4_padres.mjs`) |
| T1 | `fn_reporte_sobres_detalle`: fila del padre con gasto sumado de sus hijos | S1, S4 | pendiente |
| T2 | Las 5 sumas globales dejan de contar la fila del padre, con matriz de escenarios | S3, S9 | pendiente |
| T3 | `fn_asignar_presupuesto`: acepta padre y valida techo; rechazo con detalle | S2, S7 | pendiente |
| T4 | `fn_transferir_entre_sobres`: valida techo al mover a una hija | S8 | pendiente |
| T5 | Base cero: archivo y clonado con padres; sugerencia respeta el techo | S10 | pendiente |
| T6 | UI: padre desplegable, hijas indentadas, hoja con lo libre, avance del grupo, i18n | S1, S2, S7 | pendiente |

## Log

**L1** (pedido original) "Tanto para modo libertad como base cero Quiero agregar una funcionalidad
Que la pensemos juntos, la desarrollemos Y veamos que no arruine nada de lo que está funcionando hoy
Hasta ahora podemos agregarle presupuestos A las subcategorías Y a las categorías padre Que no tienen
subcategorías Lo que quiero implementar es la posibilidad De que le agreguemos presupuesto a las
categorías padre Con subcategorías Como si hiciéramos, por ejemplo Un presupuesto conjunto de varias
subcategorías Ejemplo Tengo la categoria alimentos, Y dentro de ellas cinco subcategorías. Que yo
pueda presupuestar el padre alimentos, entonces las cinco subcategorías no pueden pasarse del
presupuesto total de su padre. También podrían tener presupuestos individuales y estos nunca deberían
ser mayores a los del padre. ... Asignarle presupuesto a los padres y luego a los hijos no suma
ambos, siempre los hijos están dentro del presupuesto del padre en el caso de que existan."

**L2** "en modo libertad no hay arrastre de saldo, el saldo vuelve a 0 en cada ciclo. ten en cuenta
tambien que los rubros padres no deberian tener gastos si tienen hijos, es una regla del sistema."

**L3** (techo) "quizas pueda ser del fornt end nomas, como salvaguarda al cargar los presupuestos.
que opinas?"

**L4** (bajar el padre) "Rechazar con el detalle".

**L5** "El arrastre no aplica en modo libertad, pero en modo base cero debería funcionar. Pasemos
esos cuatro registros a algún hijo Eso no pasa nada, no afecta Resuélvelo así Que es como realmente
se resuelve cuando quiero crear un hijo De una cuenta padre que ya tiene asignaciones Eso ya está
resuelto en la app. En base 0 se me plantea la duda del arrastre Que no duplique la necesidad de
poner dinero dos veces ¿Cómo resolvemos eso?"

**L6** "no se que es es funcion sugerir distribucion, Porque en realidad al usuario se le informa lo
que gastó el mes anterior, lo que presupuestó el mes anterior y el prom edio de los últimos meses.
Entiendo que esa función de sugerir no se está usando."

**L7** (techo confirmado) "ok".

### Evidencia recogida antes de escribir código

- Filtro que prohíbe padres-con-hijos: sólo en `fn_reporte_sobres_detalle` (línea 105) y
  `fn_sugerir_distribucion_activacion` (línea 56).
- Gasto por rubro exacto: `GROUP BY c.estructura_egreso_id`. Un padre mostraría gasto 0 aunque sus
  hijos estén fundidos; el arrastre se calcula igual, por rubro exacto.
- Los reportes **ya** agrupan por padre: `COALESCE(e.padre_id, e.estructura_id)` en
  `fn_reporte_top_categorias_mes`, las dos sobrecargas.
- 0 filas de presupuesto en padres con hijos en toda la base (50 filas de presupuesto en total):
  la migración es inerte hasta que se use la feature.
- 4 movimientos cargados directo en rubros padre: u1 19 «Transporte» 18.000 (Pasaje, 26/07) y
  21 «Educación» 50.000 (Facu, 18/07); u84 2195 «Transporte» 18.000 y 2197 «Educación» 50.000.
  Ninguno de esos padres tiene un hijo «Pasaje» ni «Facu».
- `fn_crear_subcuenta_egreso` resuelve el caso "padre con asignaciones recibe su primer hijo"
  creando un hijo `no_detail` y migrando ahí movimientos, recurrentes, cuarentena, gastos fijos y
  presupuestos. Con hijos reales ya existentes no migra nada: por eso esos 4 quedaron colgados.
- `p_presupuestos` **sí** tiene índice único: `idx_presupuesto_unico_v2` sobre
  (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id,0)). Corregido: la primera
  evaluación dijo que no existía.
- Modos presentes en la base: `base_cero` (5 usuarios) y `anticipado` (76). «Libertad» es el nombre
  de la UI para `anticipado`.
- `fn_sugerir_distribucion_activacion` **sí se usa**: `PresupuestosPage.tsx:752`, paso 2 de la
  activación de base cero. La UI deja los campos vacíos a propósito ("sugerencia visual y no
  asignación forzada"), por eso no se reconoce la función.

### Aritmética del arrastre en base cero (respuesta a L5)

Ciclo octubre: billetera 1.000.000, Alimentos con 500.000 asignados, gastado 370.000.

1. Mientras el ciclo está abierto, los 130.000 sobrantes quedan **reservados** en el sobre como
   `monto_disponible`, y `fn_obtener_saldo_a_asignar` los resta del disponible.
2. Al cambiar de ciclo, el presupuesto del mes nuevo no existe (`monto_limite = 0`), así que el sobre
   nuevo aporta 0 al cálculo y los 130.000 **vuelven al saldo a asignar**, una sola vez.

Conclusión: en base cero el sobrante no se pierde y no hay que ponerlo dos veces. Arrastrarlo además
lo convertiría en capacidad del sobre **y** en plata libre para asignar: esa es la duplicación.
Si el dueño quiere arrastre en base cero igual, hay que reservarlo también en el pozo (restarlo),
lo que cambia el modelo de S6 y suma una tanda.

**L8** "arrastre si en base 0, no vuelve al poso, pasa en el sobre al mes siguiente (ya sea ganancia o
perdida). mi pregunta es: presenta el escenario de diferentes maneras arrastrando tanto el padre como
los hijos para que nos demos cuenta de donde tenemos los puntos criticos ya sea positivo o negativo y
que hacemos con el dinero para no asignarlo dos veces con todos los ejemplos posibles"

**L9** "no le sugeriria nada al user, ya tiene datos suficientes para tomar la decicion de cuanto
presupuestar"

**L10** (los 4 registros) "eliminalos de la tablas, son de testing. Lo que pasó aquí es que son
anteriores al límite que le pusimos a la base para poder migrar correctamente. La implementación fue
posterior, por eso quedaron esos registros quizás sin migrar. Bórralos, sólo esos registros, con
mucho cuidado." → hecho: `p_caja_id` 10, 75, 2392 y 2415 borradas; u1 Mercado Pago +50.000 y u84
Mercado Pago +50.000 (las dos de 18.000 no tenían billetera); 0 movimientos quedan en rubros padre.
El dueño confirmó después: "no importa si mueve saldos".

**L11** (T2) "extremamos los controles, probamos test con escenarios distintos para asegurar que no
se cuele un bug silencioso"

## Modelo de arrastre en base cero (respuesta a L8)

Por rubro: `capacidad = GREATEST(0, limite − gastado)`, `deuda = GREATEST(0, gastado − limite)`.
La parte del techo del padre que ningún hijo tiene asignada se queda en el padre. Y entonces:

`pozo = Σ saldos de billeteras − Σ capacidad de hojas − capacidad no repartida del padre − Σ deudas − cuotas`

`techo visible del padre = GREATEST(0, no repartido + Σ capacidad de hijos − Σ deuda de hijos)`

Escenarios con ingreso 700.000, Alimentos techo 500.000, Almacén 200.000, Verdulería 300.000:

| # | Qué pasa | Billetera | Arrastres / deudas | Pozo correcto | Punto crítico si se hace mal |
|---|---|---|---|---|---|
| E1 | No gasta nadie | 700.000 | A +200.000, V +300.000 | **200.000** | Si el techo del padre (500.000) entra al pozo: **−300.000**. P1: doble conteo positivo. |
| E2 | Gastan todo | 200.000 | ninguno | **200.000** | Nada arrastra; nada que duplicar. |
| E3 | Gastan de menos | 270.000 | A +50.000, V +20.000 | **200.000** | Sin arrastre el pozo da 270.000 y hay que reasignar 70.000 a mano. El arrastre no crea dinero: decide quién lo guarda. |
| E4 | Almacén se pasa 60.000 | 140.000 | deuda 60.000 | **80.000** | Con capacidad negativa (−60.000) el pozo daría **200.000**. P2: el sobregasto te regala plata. |
| E5 | Almacén gasta 700.000 | 0 | V +300.000, deuda 500.000 | **−800.000** | P3: si la deuda no se muestra, el número asusta sin explicación. |
| E6 | Techo 500.000 con sólo 300.000 repartidos | 700.000 | hojas 300.000 + padre 200.000 | **200.000** | P4: si nadie lleva lo no repartido, el grupo pierde 200.000 de techo. |
| E7 | Hijos sin presupuesto propio | 580.000 (gastó 120.000) | sólo el padre: 380.000 | **200.000** | P5: con hijos sin límite, la capacidad no tiene dónde vivir. Se lleva en el padre. |
| E8 | Bajar el techo con arrastres | — | hojas arrastran 600.000 | rechazo | P6: comparar contra lo asignado (500.000) y no contra el arrastre (600.000) deja pasar el recorte. |
| E9 | Reactivar base cero o clonar | — | — | — | P7: si el arrastre se materializa en filas, se duplica al archivar o clonar. Tiene que ser calculado. |

Decisiones abiertas que este cuadro deja a la vista:
- **D1**: una deuda de un hijo, ¿reduce el pozo (se repone) o sólo se informa? El cuadro asume que
  reduce, que es la convención de `fn_calcular_arrastre_deuda`.
- **D2**: con hijos sin presupuesto propio (E7), ¿la capacidad vive en el padre (puede gastar por
  cualquier hijo hasta el techo) o se obliga a repartir?

**L12** (aviso y padre en rojo) "la app solo avisa, el escenario es correcto, mes siguiente padre en
rojo -10000."

**L13** (hijo libre con padre presupuestado) "que pasa ahora si un hijo tiene presupuesto y el padre
tambien, y otro hijo libre. veamos ese escenario"

**L14** "Sigo sin entender completamente tus ejemplos... Un padre no puede hacer gastos por su cuenta
Las cuentas padres cuando tienen hijos no tienen permitido gastar dinero Los gastos del padre es
solamente un acumulador de la suma de los gastos de los hijos Esto es básico. ... ¿Qué pasa con los
arrastres negativos de los hijos cuando pasan el siguiente ciclo? ¿Lastran al padre? Esto es lo que
hay que resolver Todas las posibilidades de cuando los hijos pasan en negativo o en positivo El padre
nunca gasta"

**L15** "el tope de los hijos sin presupuesto es el fondo libre."

**L16** "cuando asigno el dinero disponible, lo hago al padre siempre y no a los hijos con
presupuesto? ej. padre con 100k y hijo1 con 30k. No debo asignar 130k, sino 100k solamente, al sobre
padre?"

**L17** "ok, continua con esas reglas definidas"

## Los tres escenarios acordados

Escenario 1 (cerrado): padre con presupuesto, hijos sin ninguno. El padre es el único número, así
que arrastra los dos signos. Ejemplo: Alimentos 100.000; Despensa 40.000 y Lácteos 55.000 → padre
−10.000 y en el ciclo siguiente arranca debiendo 10.000. Con la deuda, asignar 100.000 deja 90.000
disponibles; sin la deuda el saldo a asignar le regalaría 10.000 que ya se gastaron.

Escenario 2 (cerrado): hijo con presupuesto + hijo libre. El techo del padre se parte en reservado
(30.000 de Despensa) y fondo libre (70.000 de Lácteos). Las cuatro combinaciones de cierre dan
siempre padre = hijo con presupuesto + fondo libre:

| | Despensa | Lácteos | Padre termina | Despensa arrastra | Fondo libre arrastra |
|---|---|---|---|---|---|
| A | sobran 10.000 | sobran 20.000 | +30.000 | +10.000 | +20.000 |
| B | sobran 10.000 | debe 20.000 | −10.000 | +10.000 | −20.000 |
| C | debe 10.000 | sobran 20.000 | +10.000 | −10.000 | +20.000 |
| D | debe 10.000 | debe 20.000 | −30.000 | −10.000 | −20.000 |

Escenario 3 (cerrado): bajar el padre por debajo de reservado + fondo libre arrastrado se rechaza
con el detalle. Con Despensa en 40.000 efectivos y fondo libre en 20.000, el padre no puede bajar
de 60.000.
