# Auditoría del módulo de presupuesto contra el plan v3.1

Fecha: 18 de noviembre de 2026.
Rama: `fix/ronda-14-bugs-presupuesto-cuarentena`, 20 commits sobre `origin/produccion`.
Documento de referencia: `Personal/docs/presupuesto/ORD_Presupuestos_plan_corregido.md` (v3.1, 482 líneas).

Método: auditoría de solo lectura sobre el plan, los espejos de `funcionesSQL/`, las migraciones de
`temp_sql/`, `src/` y `tests/`. Cuando algo exigía mirar la base y no se podía, dice **NO PROBADO** en
lugar de suponerse.

---

## 1. Incumplimiento declarado: la línea base de la etapa 0.3

El plan, sección 3, pide **preservar antes de tocar**: exportar el estado de los presupuestos de las
cuentas de prueba, guardarlo como línea base de regresión con su huella, y respaldar antes de escribir.

**No se hizo.** No existe ningún artefacto previo: no hay exportación, no hay md5, no hay respaldo, y
no hay script que los produzca. Se buscó por nombre y por contenido en el repo y en `temp_sql/`.

Peor: se escribió en la base sin esa línea base (ver §2, datos modificados).

**Lo que sí existe ahora**, y no se presenta como línea base: `odd/auditoria-etapa4/estado-actual.json`,
tomado el 18/11 a las 17:03 UTC, con su `sha256`
(`64f1e46158f89bd7ffefe8c0d5b10c65e1502976df6bc22546c623983ecb10ad`). Contiene: las 83 cuentas con su
modo, día de ancla y fecha de activación; por cuenta, cantidad de filas, cuántas con plata, cuántas con
tope y el md5 de sus filas; los md5 globales de `p_presupuestos` y del historial; y la huella de las
**64 funciones** del módulo que están instaladas. Sirve para que cualquier cambio desde acá sea
comparable y detectable, no para fingir un antes.

El generador es `odd/auditoria-etapa4/tomar_foto.mjs` y se puede volver a correr para comparar.

---

## 2. Inventario de lo que se modificó

### 2.1 Código local (commiteado, 20 commits sobre el tronco de entrega)

`094f024` cabecera de fila · `b1c981a` mensajes de transferencia · `7a18e9d` tarjeta de reparto ·
`faad088` arrastre dentro del asignado · `1af3e83` espejos alineados + archivado · `bbbaa8e` etapa 1
(plata en el padre, rechazo a subcategoría, transferencia atómica) · `6dfbd09` documentos · `9c4d12d`
franja de la hija y pistas de asignación · `1b83e10` etiquetas que mentían · `5b16d40` etapa 2 (una
bolsa) · `b57c4e0` etapa 3 (el padre sin techo) · `a630389` gasto en padre exige subcategoría ·
`343fd9a` manejador muerto · `02d901e` techo editable y rastro · `cf00d24` documentos · `148873d`
moneda local y cruce del ciclo · `406b306` diálogo de mover plata fuera · `f2972a6` aviso y reporte con
equivalente · `007ac5b` la fila dice la verdad del déficit · `78a2752` repetición mensual.

Medición contra el tronco de entrega (`origin/produccion`), no contra `main`: 20 commits.

### 2.2 Migraciones preparadas y NO ejecutadas

| Archivo | Qué contiene | Estado |
| --- | --- | --- |
| `temp_sql/962_etapa4_tablas.sql` | Las dos tablas del cierre: `p_presupuestos_cierre` y `p_presupuestos_pertenencia`, con sus índices y RLS encendido | **Escrito, nunca aplicado.** Ninguna referencia en el resto del repo |
| `temp_sql/960_etapa4_repeticion.sql` | `fn_repetir_presupuestos_ciclo` | Aplicado |
| `temp_sql/963_etapa4_sin_transferencias.sql` | Guarda de libertad en dos funciones | Aplicado |
| `temp_sql/952_etapa4_moneda.sql`, `957_etapa4_moneda2.sql` | Moneda local y cruces de ciclo | Aplicados |
| `temp_sql/958_reset_techos.sql` | Limpieza de topes | Aplicado |
| `temp_sql/954_fix_bolsa.sql` | Reparación de la bolsa | Aplicado |

### 2.3 Funciones realmente instaladas en Supabase (esta sesión)

No es lo mismo que el SQL escrito. Lo que quedó instalado:

1. `fn_crear_subcuenta_egreso` — no migra la plata del padre ni borra su fila.
2. `fn_asignar_presupuesto` — rechaza destino subcategoría; sin el bloque de exclusividad.
3. `fn_transferir_entre_sobres` — débito comprobado, fila creada en negativo, idempotencia, dos patas; después, **guarda de libertad**.
4. `fn_disponible_transferible` — bolsa del grupo, arrastre solo en base cero, moneda local, sin piso; reescrita dos veces (reparación desde la etapa 2 y moneda).
5. `fn_disponibles_transferibles` — solo padres o sueltos, positivos; después, **vacía en libertad**.
6. `fn_reporte_sobres_detalle` — fila del padre = bolsa, hijo sin plata propia, una fila por grupo, moneda local.
7. `fn_aviso_categoria_en_rojo` — cruce del ciclo corregido y moneda local.
8. `fn_reporte_presupuestos_mensuales` — cruce del ciclo corregido y moneda local.
9. `fn_asignar_techo` — escritor del tope (etapa 3).
10. `fn_historial_presupuesto` — lectura del rastro (etapa 3).
11. `fn_repetir_presupuestos_ciclo` — **nueva**, repetición mensual.

Columnas e índices: `p_presupuestos_historial.idempotency_key` + índice único; `p_presupuestos_historial.monto_techo`; `p_presupuestos.monto_techo` (de la etapa anterior a esta tanda).

### 2.4 Datos ya modificados

| Qué | Cuánto | Reversible | Evidencia del estado previo |
| --- | --- | --- | --- |
| `p_presupuestos.monto_techo` puesto en `NULL` en todas las filas que lo tenían | Hoy: 0 de 99 filas con tope | **No exacta.** Se puede reconstruir aproximadamente | Registro de esta sesión: se sembraron 92 filas y 76 quedaron con tope. La mayoría de los valores se derivaban por script: `round(monto_limite * 1.2)` (`temp_sql/181_techos_restantes.sql:21`) o `= monto_limite` (`175_techo_y_plata.sql:26`). Los escritos a mano no son reconstruibles |
| Asignación real de 12.345 en la cuenta de libertad (usuario 198), revertida por RPC | Queda una fila de historial con motivo `revertir_prueba_etapa1` | Sí, por diseño | Saldo devuelto a 105.500 |
| Escrituras de prueba en transacciones revertidas | 0 filas | — | Huella antes/después idéntica, verificada por el verificador independiente |

Las cuentas que se tocaron en las pruebas son las que el runner elige con
`ORDER BY user_id LIMIT 1` —o sea la cuenta 1 del dueño— **no una cuenta de prueba designada**. Es un
incumplimiento del punto 3.3 del plan aunque todo haya quedado revertido.

---

## 3. Matriz de cumplimiento

### Etapa 0

| Ref | Requisito | Veredicto | Qué falta |
| --- | --- | --- | --- |
| 0.1 | Refrescar los 13 espejos viejos | PARCIAL | Se refrescaron 12 + el del archivado, con script (`901_etapa0_espejos.mjs`). No hay registro de la corrida ni del conteo, así que "trece" no se puede probar. Además **dos RPC que la pantalla llama no tienen espejo**: `fn_asignar_techo` y `fn_historial_presupuesto` |
| 0.2 | Documentar el archivado | CUMPLE | Falta anotarlo en `start_info/indice de funciones.md` |
| 0.3 | Línea base + respaldo antes de escribir | **FALTA** | Todo. Ver §1 |
| 0.4 | Anotar las funciones sin uso en el índice | **FALTA** | `fn_obtener_saldo_disponible_para_asignar` figura sin aclaración; es huérfana confirmada (0 llamadores) |
| 3.3 | Tocar solo cuentas de prueba | **NO SE CUMPLE** | No hay cuentas de prueba designadas; las pruebas usan la cuenta 1 |

### Etapa 1 — Integridad

| Ref | Requisito | Veredicto |
| --- | --- | --- |
| 1.1a | Débito y crédito en una transacción | CUMPLE |
| 1.1b | Origen sin fila: se crea con el descuento en negativo, sin copiar el arrastre | CUMPLE |
| 1.1c | Rechazar solo por encima de lo transferible, con el número real | CUMPLE |
| 1.1d | Registro con las dos patas | CUMPLE |
| 1.1e | Nunca toca una billetera | CUMPLE |
| 1.1f | El reintento no aplica dos veces | CUMPLE |
| 1.1g | El ajuste firmado vive en un solo ciclo | CUMPLE |
| 1.1h | El arrastre es exclusivo de base cero | CUMPLE |
| **1.1i** | **Las transferencias dependen del saldo del padre, nunca de los techos de los hijos** | **FALTA** — siguen vivos los dos bloqueos (`error_budget_child_over_parent` y `error_budget_parent_below_children`), y **un test los congela** |
| 1.2 | Crear subcategoría no mueve dinero | CUMPLE |
| 1.3 | A una subcategoría no se le asigna dinero, lo rechaza el servidor | CUMPLE |
| 1.4 | El déficit es válido; no se inventa un débito | CUMPLE |

### Etapa 2 — Una sola bolsa y un solo saldo

| Ref | Requisito | Veredicto | Qué falta |
| --- | --- | --- | --- |
| 2.1 | Una definición de la bolsa, sin piso por fila | PARCIAL | Sobreviven dos pisos: `fn_reporte_sobres_detalle:57` y `fn_obtener_saldo_a_asignar:42` |
| 2.2 | La subcategoría pierde plata y arrastre propios | PARCIAL | El arrastre ya es 0; su `monto_asignado`/`monto_disponible` siguen saliendo de `monto_limite` en vez de 0 |
| 2.3 | La lista de orígenes: padres y sueltos, solo positivos | CUMPLE | La pantalla puede saltearla con su cálculo de respaldo |
| 2.4 | La validación usa la misma bolsa; mueren las dos validaciones de «techo repartido» | PARCIAL | Murieron en asignación; siguen en transferencia |
| 2.5 | Cuatro fórmulas a una | PARCIAL | Ver §4: hay envoltorios legítimos y un cálculo contradictorio |
| **2.6** | **Identidad de conciliación: lo libre + lo que resta por gastar = billeteras** | **FALTA** | No existe en ningún RPC, ni en pantalla, ni en prueba |

### Etapa 3 — Pantalla, textos y funcionamiento aprobado

| Ref | Requisito | Veredicto | Qué falta |
| --- | --- | --- | --- |
| 3.1 | Editor de tope por subcategoría, opcional, se puede dejar vacío | CUMPLE | Sin espejo y sin entrada en el índice |
| 3.2 | Margen compartido, con el gasto del padre | CUMPLE, con desvío | El mismo número a todas las hermanas en lugar de repartirlo. Decisión del dueño; contradice la letra del §5 |
| 3.3 | Etiquetas: Asignado solo en el padre, Tope en la hija, un solo «sin asignar» | CUMPLE | — |
| 3.4a | «Ingresar Monto»: texto o conducta, no las dos a medias | CUMPLE | Ahora dice «Sumar al asignado» y suma |
| 3.4b | «Promedio de 6 meses»: corregir el texto | CUMPLE | — |
| **3.4c** | **«Asignar todo lo disponible»: construirlo o retirarlo del diccionario** | **FALTA** | Las claves siguen en los tres idiomas y no las usa nadie |
| 3.5 | El diálogo de mover plata desaparece con su código | CUMPLE | Queda el parámetro muerto `p_mover_plata` en la función |
| 3.6 | Gasto nuevo en padre con hijos exige elegir subcategoría | PARCIAL | Pantalla sí; **el servidor no lo impide** |
| 3.7 | Rastro visible con valor anterior, nuevo, fecha y motivo | CUMPLE | Sin espejo y sin entrada en el índice |
| **3.8** | Los tres idiomas | PARCIAL | `error_transfer_only_base_zero` no está en ningún diccionario |

### Etapa 4 — Cierre, ciclos cerrados y lo que falta construir

| Ref | Requisito | Veredicto | Qué falta |
| --- | --- | --- | --- |
| **4.1** | El cierre guarda el saldo y la lectura congelada | **FALTA** | Solo la tabla escrita; sin aplicar y sin lector ni escritor |
| **4.2** | Corrección histórica genera un ajuste en el ciclo activo | **FALTA** | Nada escribe ni lee ajustes |
| **4.3** | La mudanza de subcategoría rige desde el mes siguiente | **FALTA** | Solo la tabla; no hay operación que cambie `padre_id` |
| 4.4 | Repetición mensual en libertad | CUMPLE | Un detalle: un modo nulo se trata como «no libertad» y nunca repite |
| 4.5a | El corte apunta al ciclo real | CUMPLE | — |
| 4.5b | Archiva antes de poner en cero | CUMPLE | — |
| **4.5c** | **Después del corte, ofrecer la distribución sugerida** | **FALTA / CONTRADICTORIO** | El código deja la lista vacía por una decisión del dueño registrada ahí. Ver §5 |
| **4.5d** | Dejar de tratar igual a padres e hijos; decidir los topes | **FALTA** | Pone en cero todo sin distinguir, y no toca los topes |
| 4.6a | Transferir en libertad se rechaza | CUMPLE | — |
| **4.6b** | **Escribir sobre un ciclo cerrado se rechaza en el servidor** | **FALTA** | Solo lo impide la pantalla |
| 4.7 | Moneda: el gasto entra con su equivalente | PARCIAL | Cuatro lugares corregidos; `fn_calcular_arrastre_deuda` sigue leyendo el nominal desde `p_caja` |
| 4.8 | El día de inicio en los cinco cálculos | PARCIAL — 2 de 5 | Corregidos el reporte mensual y los avisos. Siguen por mes calendario: `fn_calcular_arrastre_deuda`, `fn_telemetry_refresh_user_metrics`, `fn_reporte_proyeccion_presupuestaria` |

---

## 4. Los cuatro cálculos de saldo: cuáles son envoltorios y cuál contradice

El plan pide una sola definición funcional, pero prohíbe borrar por borrar. Clasificación:

| Cálculo | Dónde | Qué es | Veredicto |
| --- | --- | --- | --- |
| `margenCompartidoDeSobre` | `src/lib/barraSobre.ts:100` | Devuelve la bolsa que publica el servidor (`monto_disponible`), sin piso | **Es la definición** |
| `libreDe` | `PresupuestosPage.tsx:2206` | Delega en la anterior | Envoltorio legítimo |
| `disponibleDeSobre` | `PresupuestosPage.tsx:270` | Calcula lo disponible de un sobre para el modal de monto manual | Envoltorio a revisar: hay que confirmar que lee los mismos campos del servidor y no recalcula |
| `disponibleEfectivo` | `PresupuestosPage.tsx:2350` | Encadena el anterior para el modal | Envoltorio legítimo, si el anterior lo es |
| **`fondoLibreDe`** | `PresupuestosPage.tsx:822` | `max(techo − repartido, 0)`: usa el techo, **no cuenta el gasto del padre** y **pone piso en cero** | **Contradictorio.** Es exactamente la fórmula que el plan retira. Hoy sobrevive como respaldo cuando el servidor no devuelve el id |
| `disponibleParaTransferir` | `PresupuestosPage.tsx:833` | Encadena los dos anteriores como respaldo de la lista del servidor | **Contradictorio por arrastre**: si el respaldo está mal, la pantalla ofrece orígenes que el servidor rechaza |

Conclusión: hay **un** cálculo a retirar (`fondoLibreDe` y su respaldo), no cuatro. Los demás son
envoltorios que se pueden dejar, con la condición de que lean la misma fuente y no recalculen.

Falta además un test: `escape-y-criterio-disponible.test.js:52-71` **congela el respaldo viejo** como
si fuera la regla.

---

## 5. Contradicciones que necesitan tu palabra

### 5.1 La distribución sugerida después del corte

- **El plan (v3.1), §2.3 y §4.5:** «poner en cero, archivar antes, y **después ofrece la distribución
  sugerida** en lugar de dejar la lista vacía».
- **El código (`PresupuestosPage.tsx:1206-1212`):** «Decisión del dueño: la app no le sugiere montos al
  usuario, porque ya tiene sus propios datos… Por eso no se llama más a `fn_sugerir_distribucion_activacion`»,
  y a continuación deja la lista vacía.
- **Tu regla de ahora:** el cambio de modo **reinicia la planificación del ciclo y preserva el historial
  financiero**. No implica asignar automáticamente.

Las tres cosas no pueden regir a la vez. Las opciones, sin elegir por vos: (a) queda la lista vacía y se
corrige el plan; (b) se ofrece la sugerencia como propuesta que el usuario acepta o descarta, sin
asignar nada por su cuenta; (c) se ofrece el reparto informativo sin montos por categoría.

### 5.2 «Reparta el margen entre los hijos sin tope»

El plan, tabla del §5, dice que el margen compartido «se reparte entre los hijos sin tope». Tu decisión
anterior, registrada en la ficha de trabajo, es lo contrario: **todas las hermanas ven el mismo margen**
—con 100.000 en el padre y 60.000 consumidos por las que tienen tope, a las dos sin tope «les quedan
10.000, no 10.000 a cada una»—.

El código implementa tu decisión, no la letra del plan. Hay que corregir el plan o el código; no las dos.

### 5.3 El campo «Asignado» del padre cambió de significado

La fila del padre publica `monto_asignado = plata + gastado`. Un número derivado bajo un campo que se
llama «asignado». No está en el plan: el plan pide que el mismo número coincida en los tres lugares, no
que el campo cambie de significado. Es aceptable si la pantalla lo rotula como corresponde, pero conviene
decidirlo.

---

## 6. Plan de cierre de faltantes

Ordenado por lo que pediste priorizar. Cada bloque dice de qué depende y qué riesgo tiene.

### Bloque A — Recuperar la confianza en la prueba (dependencia de todos los demás)

1. Anotar la huella actual como punto de comparación (ya tomada, con sha256) y agregar un comando que la
   vuelva a tomar y la compare.
2. **Corregir los tests que leen `temp_sql/`**: nueve archivos de `tests/presupuestos` leen migraciones
   gitignoreadas y sin sincronizar, así que no pueden detectar que lo instalado se aleje. Pasarlos a leer
   `funcionesSQL/`.
3. Designar cuentas de prueba y parametrizar los tests transaccionales para que no elijan «el primer
   usuario con auth». Hoy tocan la cuenta del dueño.
   - *Riesgo:* cambiar el andamiaje de tests puede poner en rojo casos que hoy pasan por casualidad. Es
     el riesgo correcto: mejor saberlo.

### Bloque B — Una sola definición de saldo y la conciliación

4. Retirar `fondoLibreDe` y su respaldo; que la pantalla use la bolsa del servidor o no muestre el dato.
5. Revisar que `disponibleDeSobre` lea los campos del servidor y no recalcule; si recalcula, unificarlo.
6. Acotar el test que congela el respaldo viejo.
7. **Construir la identidad de conciliación**: lo libre + lo que resta por gastar en cada categoría debe
   dar el dinero de las billeteras; si no da, una línea aparte que lo explique. Con su test, en los dos
   modos.
   - *Riesgo:* es probable que hoy **no cierre**, y ahí aparece el defecto de verdad. Hay que estar
     dispuestos a encontrar una reserva duplicada. Depende de B4 y B5.

### Bloque C — Que las transferencias dependan del saldo del padre

8. Sacar los dos bloqueos por techos de los hijos (`error_budget_child_over_parent` y
   `error_budget_parent_below_children`) y las claves que los acompañan.
9. Acotar (no borrar) el test que los congela, para que afirme la regla nueva.
   - *Riesgo:* es el cambio de comportamiento más grande que queda. Toca el camino por el que pasa toda
     transferencia. Depende de tener el Bloque A andando para poder probarlo en los dos modos.

### Bloque D — El cierre del ciclo

10. Aplicar la tabla del cierre con su RLS, y crear la función de cierre: al abrir el ciclo siguiente se
    calcula una vez y se congela el saldo y la lectura.
11. Leer el arrastre desde el cierre anterior en vez de recalcularlo en vivo.
12. Guarda del servidor: no se escribe sobre un ciclo cerrado (asignar, transferir, tocar el tope).
    - *Depende de:* Bloque B (la lectura congelada tiene que usar la definición única) y de tu decisión
      sobre 5.1.
    - *Riesgo:* es la pieza que cambia de dónde sale el arrastre. Si el cierre se calcula mal, arrastra el
      error para siempre. Va con prueba de dos ciclos encadenados.

### Bloque E — Ajustes por corrección histórica

13. Registrar el ajuste en el ciclo activo con su motivo y la referencia al ciclo corregido; un ajuste por
    corrección, no dos ni cero.
    - *Depende de:* Bloque D.
    - *Riesgo:* criterio 24 exige que un ajuste no se cuente dos veces. Hoy no hay nada que lo pruebe.

### Bloque F — Pertenencia por ciclo

14. Aplicar la segunda tabla y hacer que mover una subcategoría de padre rija desde el ciclo siguiente,
    con el informe leyendo la pertenencia del ciclo que muestra.
    - *Depende de:* Bloque D (primero se congela el cierre, después se muda).
    - *Riesgo:* toca el informe que alimenta toda la pantalla. Es el último a propósito.

### Bloque G — Los faltantes sueltos

15. `fn_calcular_arrastre_deuda`: día de inicio y moneda local.
16. `fn_telemetry_refresh_user_metrics` y `fn_reporte_proyeccion_presupuestaria`: día de inicio.
17. «Asignar todo lo disponible»: construir o retirar del diccionario.
18. Guarda del servidor para un gasto sin subcategoría en un padre con hijos.
19. `error_transfer_only_base_zero` en los tres diccionarios.
20. Espejos y entradas en el índice para `fn_asignar_techo`, `fn_historial_presupuesto`,
    `fn_repetir_presupuestos_ciclo` y `fn_archivar_presupuestos_ciclo`.
21. Modo nulo: tratarlo como libertad en todos lados, o impedir que exista. Hoy la repetición no repite y
    el reporte muestra arrastre.
22. Sacar el parámetro muerto `p_mover_plata`.
23. Decidir `monto_asignado` del padre (5.3).

### Bloque H — Pruebas de regresión de los dos modos

Un solo archivo parametrizado, con datos propios creados dentro de la transacción en vez de usar «el
primer usuario», que corra **la misma lista** en libertad y en base cero:

1. Asignar al padre; asignar a una subcategoría y ser rechazado.
2. Crear la primera subcategoría de un padre y verificar que la plata no se movió.
3. Transferir sin déficit: el libre no cambia. Transferir con déficit: el libre sube exactamente el
   déficit cubierto. Reintentar con la misma clave: no mueve y **deja un solo registro**.
4. Transferir desde un arrastre positivo con y sin fila en el ciclo.
5. Que ninguna billetera se mueva en ninguna de las operaciones anteriores.
6. Tarjetas: un gasto con tarjeta no descuenta billetera; verificar que la reserva no se libere dos veces.
7. Arrastre: presente en base cero, **inexistente en libertad** (criterio 17).
8. Ciclo que no empieza el día 1: un gasto del día 2 cae en el ciclo correcto y el del día 1 en el
   anterior, en los cinco informes.
9. Cambio de modo: archiva, reinicia el ciclo real y no toca el de al lado; el historial financiero queda.
10. Ciclo cerrado: asignar, transferir y tocar el tope se rechazan en el servidor.
11. Conciliación: la identidad cierra después de asignar, transferir, gastar y recibir un arrastre.
12. Tres idiomas: ninguna clave cruda, ningún mensaje técnico a la vista.

---

## 7. Lo que se construyó más allá del plan

No es incumplimiento, pero conviene saberlo y decidir si queda:

1. **El cierre y el ajuste en una tabla con un campo de tipo** — el plan no fija la forma; fue criterio
   de desarrollo y el dueño lo delegó.
2. **Un eje propio para el tope**: columna, escritor y columna en el historial. El plan pide poder
   editarlo y dejarlo vacío; no pide que sea columna aparte.
3. **La repetición deja rastro** (`repeticion_mensual`) por categoría copiada. El plan pide copiar, no
   dejar rastro. Es información útil, no un daño.
4. **`monto_asignado` del padre cambia de significado** (ver 5.3).
5. **`no_detail` sigue imputándose sin que el usuario elija**. El plan prohíbe la primera de la lista y
   el padre en silencio; este caso no es ninguno de los dos, pero tampoco está en el plan.
6. **Cuatro pruebas transaccionales y un runner** que el plan no enumera.

---

## Respuestas del dueño del 19/11 (vinculantes)

1. **Telemetría:** tiene que evitar el doble conteo entre padre e hijos, conservando la
   funcionalidad anterior, y **todos los gastos reales de los hijos se contabilizan una sola vez**
   en el grupo. No se ignoran gastos para tapar una duplicación. → Pendiente de reparación; el test
   `el barrido` queda en rojo a propósito hasta entonces.
2. **Termómetro:** es funcionalidad independiente del presupuesto; no interviene en las
   asignaciones ni modifica presupuestos. **Si nuestros cambios rompieron su comportamiento anterior,
   se repara** sin introducir dobles contabilizaciones. No se vuelve a sumar presupuesto fila por fila
   sin verificar. → Pendiente de reparación.
3. **Tests de DDL:** consultan la estructura realmente instalada en Supabase por catálogo, y para
   pruebas sin conexión se mantiene un **esquema actualizado y versionado**. Nunca migraciones
   ignoradas como única fuente. → Hecho: `start_info/esquema-presupuesto.md`, generado por
   `odd/auditoria-etapa4/generar_esquema.mjs` con huella `2953db3f…32c0ff`.
4. **Los cuatro tests de bloqueos por techos:** se reescriben **durante el Bloque C** para comprobar
   las reglas nuevas. Una prueba vieja no puede obligar a mantener un comportamiento eliminado.
   → Anotado para el Bloque C.
5. **Cuentas de prueba:** la 20 (`arieldere@yahoo.com`) o la 198 (`arieldere75@gmail.com`).
   → El runner de `tests/sql/` ya no elige cuenta: recibe `--usuario N` y las pruebas usan el
   marcador `{{USUARIO}}`. Por defecto, 20.
