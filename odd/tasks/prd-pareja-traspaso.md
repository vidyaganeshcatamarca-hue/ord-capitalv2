# PRD de traspaso — módulo Pareja

**Para quién es este documento.** Para el equipo que va a construir el módulo Pareja. No es
documentación de Préstamos: es el mapa de lo que ya existe alrededor de Pareja, de las reglas que
el dueño del producto ya aprobó, y de las trampas que ya medimos, para que no haya que volver a
descubrirlas ni volver a decidirlas.

**Cómo leerlo.** Al final de cada tema hay tres etiquetas, y no significan lo mismo:

- **Aprobado** — lo decidió el dueño del producto. No se reabre.
- **Implementado** — está en la base y probado. Puede que todavía no sea alcanzable desde la
  interfaz.
- **Propuesta** — no está decidido. Es una idea de diseño, no una obligación.

---

## 1. Qué existe hoy

Pareja no está construido como pantalla completa, pero **el modelo de datos y buena parte del
backend sí existen** y llevan tiempo en producción, usados por otras pantallas. Lo que hay:

**Tablas propias del módulo**

| Tabla | Para qué sirve |
| --- | --- |
| `p_hogares` | El hogar: la unidad que agrupa a dos (o más) personas. |
| `p_hogar_participantes` | Quién pertenece a cada hogar. Es la puerta de entrada de todo: si no hay fila acá, no hay hogar para esa persona. |
| `p_hogar_pagos` | Pagos y gastos compartidos del hogar. |
| `p_hogar_conciliaciones` | El cierre entre los dos: quién le debe a quién, cuánto, desde cuándo. |
| `p_hogar_invitaciones` | El código de invitación y su aceptación. |
| `p_proyectos_compartidos` | Proyectos (metas, viajes, etc.) que son de los dos. |

**Columnas de copropiedad esparcidas por el resto del sistema**

`hogar_id` existe hoy en: `p_caja`, `p_estructuras_egresos`, `p_inversiones`, `p_prestamos`,
`p_presupuestos`, `p_presupuestos_cierre`, `p_presupuestos_historial`, `p_sobres`, y en la vista
`v_p_caja_reportable`. `p_caja` además tiene `es_compartido`.

Hay dos excepciones que ya nos costaron tiempo:

- **`p_billeteras` no usa `hogar_id`: usa un booleano `es_compartida`.** Son dos convenciones
  conviviendo. Unificar es trabajo de este módulo, no de Préstamos.
- **`p_estructuras_egresos` y `p_presupuestos*` tienen la columna pero nadie la escribe todavía.**
  La columna existe; el comportamiento no.

**Funciones que ya existen**

`fn_inicializar_hogar`, `fn_generar_codigo_invitacion`, `fn_aceptar_invitacion`,
`fn_vincular_hogar_invitado`, `fn_desvincular_pareja`, `fn_disolver_hogar`,
`fn_configurar_porcentajes_hogar`, `fn_actualizar_proporcion_hogar`,
`fn_t_capturar_porcentajes_hogar`, `fn_registrar_pago_pareja`, `fn_saldar_balance_hogar`,
`fn_verificar_estado_hogar`, `fn_reporte_hogar_balances`, `fn_reporte_hogar_feed`,
`fn_reporte_historial_abonos_pareja`, `fn_reporte_proyectos_hogar`.

---

## 2. Las tres reglas que ordenan todo

Antes del detalle técnico, estas tres ideas. Si el equipo nuevo se lleva sólo esto, ya evita los
errores que cometimos.

### 2.1 Compartir es COPROPIEDAD, no visibilidad — **Aprobado**

El error conceptual que cometimos una vez: creer que compartir significaba «el otro puede ver».
No es eso. Cuando algo se comparte, **los dos pasan a ser dueños con todas las facultades**: los
dos pueden editarlo, pagarlo, corregirlo, darlo de baja. No hay un dueño y un invitado con
permisos de lectura.

Consecuencia que sorprende y que está bien así: **borrar algo compartido es bilateral**. Si uno lo
borra, desaparece para los dos, porque el objeto era de los dos. No es un defecto; es la
definición.

### 2.2 La titularidad no se mueve sola — **Aprobado**

Toda fila sigue teniendo un `user_id`: el que la creó. Y además puede tener `hogar_id`, que dice
«esto también es del hogar». Los dos datos conviven a propósito:

- `user_id` dice **quién es el titular registral** (y es lo que usan el borrado de datos, la
  clonación de usuario y los informes históricos).
- `hogar_id` dice **quién más puede usarlo**.

Cuando `hogar_id` es `NULL`, el objeto es privado. Cuando tiene valor, es de los dos.

### 2.3 El que paga es el que paga — **Aprobado**

Si B paga una deuda compartida, el movimiento de caja y la fila del pago son **de B**, salen de la
billetera **de B**, y el saldo de la deuda baja **una sola vez**. No se registra «en nombre del
titular». Esto evita el desastre clásico de la contabilidad doméstica: que el pago figure en la
billetera de quien no lo hizo y que después nadie pueda cuadrar nada.

---

## 3. Los tres tipos de préstamo, que no son lo mismo

Esta es la distinción que el dueño marcó como fundamental y que hay que respetar al construir
Pareja. Tres cosas distintas que la gente llama «préstamo de la pareja»:

### A. Préstamo privado

A le debe 200.000 a un prestamista. Nadie más lo ve. `user_id = A`, `hogar_id = NULL`.

### B. Préstamo **entre integrantes**

A le presta 50.000 a B. **Es un préstamo individual de A**, no un préstamo compartido: A es el
acreedor y B el deudor. Se registra con la dirección «me deben», contraparte B, y
`contraparte_user_id = B`. `hogar_id` queda en `NULL`: no es una obligación conjunta frente a un
tercero, es una deuda entre los dos.

Que sea individual no significa que B no lo vea: la pantalla de Pareja tiene un grupo propio,
«préstamos entre ustedes», donde ese préstamo aparece para los dos. Pero es **una sola fila**, con
un solo titular, y el que lo administra es A.

### C. Préstamo **compartido**

Los dos le deben 100.000 a un banco. Es una obligación conjunta frente a un tercero: una sola
fila con `hogar_id` seteado. Los dos lo ven, los dos lo pueden pagar, y el saldo es uno.

**Regla de interfaz ya aprobada:** no se pregunta «¿esto es compartido?» dentro del formulario de
alta de préstamos. Se crea privado, y si hay que compartirlo se hace después, desde una pantalla
central. Los formularios no se llenan de casillas; la copropiedad se administra en un solo lugar.

---

## 4. Cómo resolvimos la lectura compartida en Préstamos — **Implementado y probado**

Este es el patrón que el equipo debería replicar en Billeteras, Sobres, Inversiones y Categorías.
Es más simple de lo que parece y ya está verificado.

### 4.1 La condición

Cada función de lectura que devuelve filas de un usuario cambió su filtro de

```sql
WHERE row.user_id = v_user_id
```

a

```sql
WHERE (row.user_id = v_user_id
       OR (v_hogar_id IS NOT NULL AND row.hogar_id = v_hogar_id))
```

donde `v_hogar_id` sale de `p_hogar_participantes` para quien llama.

Dos detalles que importan:

- **Si quien llama no tiene hogar, el segundo término es `NULL` y la consulta se comporta
  exactamente igual que antes.** No hay cambio de comportamiento para los solteros. Lo probamos
  con una comparación simétrica (`EXCEPT` en los dos sentidos) contra el cuerpo anterior: cero
  diferencia.
- **Se usa `v_hogar_id IS NOT NULL AND`, no `COALESCE`.** Es explícito: sin hogar no hay
  copropiedad, ni siquiera para filas con `hogar_id` de otro.

En Préstamos eso se aplicó a **16 funciones de lectura**. Su equivalente en otros módulos es la
lista de funciones de reporte de cada uno.

### 4.2 La escritura

Se ensancharon **5 funciones**: editar, registrar pago, eliminar historial, gestionar deuda y
responder vínculos. La regla es la misma condición, pero con una diferencia clave: **el pagador
manda**. El `user_id` y la billetera del pago son de quien llama, no del titular de la deuda.

### 4.3 La guarda de pertenencia

Si alguien intenta adjuntar algo a un hogar al que no pertenece, la RPC levanta
`error_hogar_no_pertenece`. Sin esa guarda, cualquiera podría poner `hogar_id` de un hogar ajeno y
volverse «socio» de datos que no son suyos. La clave está traducida en español, inglés y portugués.

### 4.4 Nunca exponer el identificador de la pareja

Decisión de diseño tomada en Préstamos: **el servidor clasifica y el cliente no aprende el id del
otro**. `fn_prestamos_listar` devuelve un booleano, `contraparte_integrante`, que dice «esta
contraparte es tu pareja». El navegador nunca recibe el `user_id` del otro. Es más seguro y evita
que el frontend tenga que razonar sobre identidades ajenas.

Y ese booleano es **bilateral**: el mismo préstamo entre A y B lo ven B en «lo que me deben» y A en
«lo que debo», porque la consulta no excluye al propio llamante cuando el préstamo lo nombra.

---

## 5. Ejemplos completos, con los números

### Ejemplo 1 — cobro compartido

A y B tienen un préstamo compartido de 100.000 con un banco (una sola fila, `hogar_id` seteado,
saldo 100.000). B paga 30.000.

Resultado esperado y verificado:

- Se crea **una** fila en `p_prestamos_pagos`, con `user_id = B`.
- Se crea **una** fila en `p_caja`, tipo `expense`, en la billetera **de B**, por 30.000.
- El saldo del préstamo baja **una vez**: 100.000 → 70.000.
- A ve el préstamo con saldo 70.000 y el pago hecho por B.

Lo que **no** debe pasar: que el movimiento quede en la billetera de A, ni que el saldo baje dos
veces, ni que se cree una segunda fila de pago «espejo».

### Ejemplo 2 — corrección de ese pago

B se equivocó: eran 20.000, no 30.000. Corrige.

- La corrección y la anulación están **acotadas a quien pagó**. B corrige su propio pago: la caja
  de B se ajusta por la diferencia (30.000 → 20.000) y el saldo vuelve por 10.000.
- A **no** puede corregir el pago de B. No es una limitación: es lo que evita que A reescriba
  plata de la billetera de B para acomodarla a la suya.

### Ejemplo 3 — sobrepago

Saldo 60.000, B paga 100.000. La aplicación pide confirmación explícita: «el exceso de 40.000 se
va a registrar como intereses no registrados». Si B confirma:

- La billetera de B se debita 100.000 (una sola vez).
- El préstamo se cancela.
- Los 40.000 quedan identificados como intereses: no «desaparecen» ni se recortan en silencio.

### Ejemplo 4 — borrar datos con algo compartido

A ejecuta «Borrar mis datos». B sigue usando la aplicación.

Hoy, medido: se borra la **fila de participación** de A en el hogar; todo lo demás del hogar se
conserva para B; el hogar sigue existiendo porque queda un integrante. Pero **la titularidad de
los objetos compartidos sigue siendo de A**, porque `user_id` no se mueve. Es el hueco conocido
(numerado como C5 en las notas internas de Préstamos) y está explicado en el punto 9.

---

## 6. Lo que está implementado y lo que todavía no es alcanzable

**Implementado y probado** (con pruebas transaccionales que no dejan datos):

- Lectura compartida de préstamos: 16 funciones, 37 aserciones.
- Escritura compartida: 5 funciones, 37 aserciones, incluida la atribución del pagador.
- Contraparte entre integrantes: 31 aserciones, con clasificación en el servidor y visibilidad
  bilateral.
- Compartir por ítem: 13 aserciones.
- Guarda de pertenencia al hogar y claves de error en los tres idiomas.
- Clonación de usuario: al clonar una cuenta, `hogar_id` y `contraparte_user_id` se anulan, para
  que el clon no herede pertenencias del original.

**No alcanzable desde la interfaz** (a propósito, por decisión del dueño):

- Crear un préstamo compartido. Hoy **ningún formulario envía `hogar_id`**. Todo préstamo que se
  crea desde la aplicación es privado. La capacidad existe en la base y no tiene puerta.
- La pantalla «Pareja» de Préstamos existe y muestra dos grupos separados (gastos compartidos y
  préstamos entre los dos), pero sin hogar vinculado sólo puede mostrar su estado vacío. Eso es lo
  que se ve hoy en producción: el mensaje de que no hay hogar.

---

## 7. Qué tiene que hacer la pantalla central de Pareja — **Propuesta**

El dueño ya fijó el principio: **la copropiedad se administra en un solo lugar**, no en cada
formulario. La forma concreta no está decidida. Lo que sigue es una propuesta para discutir, con
el criterio de por qué está armada así.

1. **Una lista de lo que existe**, agrupada por tipo: billeteras, sobres, inversiones, préstamos,
   categorías. Cada ítem con su estado: privado / compartido.
2. **Una acción «compartir con mi pareja»** por ítem, con confirmación, que setea `hogar_id`.
   Con la misma acción inversa para volver a privado, que sólo se permite si el otro no tiene
   movimientos asociados (si los tiene, decide él o se resuelve con una regla explícita).
3. **Nada de casillas en los formularios de alta.** El alta crea privado y sigue siendo simple.
4. **Una sola operación por vez y con nombre claro**: «compartir», no «editar permisos».
5. **La pantalla de balances** ya existe a medias: `fn_reporte_hogar_balances` devuelve tres
   estados y Préstamos ya la consume para mostrar dos grupos que **nunca se netean entre sí**
   (gastos compartidos y préstamos entre los dos son cosas distintas y restarlas sería mentir).

---

## 8. Desvinculación y asignación de lo compartido

**Aprobado por el dueño, como regla funcional:**

> Si A está vinculado a B y A se desvincula (o borra sus datos), todos los elementos compartidos
> pasan a ser propiedad y administración de B.

**Estado actual del código:** `fn_desvincular_pareja` **no implementa esa distribución**. Hoy la
desvinculación corta el vínculo y deja los objetos compartidos en manos de quien los creó. La regla
está aprobada pero no ejecutada, y el dueño pidió explícitamente **no implementarla ahora ni
cambiarla unilateralmente**: se hace al construir Pareja, porque toca billeteras, sobres,
inversiones, préstamos y categorías al mismo tiempo.

**Por qué no es trivial** (esto es lo que hay que resolver, medido):

- La titularidad es `user_id` y es `NOT NULL` en `p_caja`, `p_sobres` y `p_estructuras_egresos`.
  No existe «sin titular», así que pasar todo a B significa **reescribir `user_id` masivamente**,
  que es exactamente lo que el dueño prohibió hacer a ciegas.
- El modelo de hogar hoy representa **dos** integrantes. Un hogar de tres o más no tiene
  representación: no hay a quién asignar «el que queda» cuando quedan dos.

---

## 9. Borrar mis datos con cosas compartidas — el hueco conocido

Este es el punto que el equipo nuevo tiene que resolver primero, porque es el único que hoy deja
un objeto en un estado raro.

**Regla aprobada:** al borrar sus datos, el que se va transfiere íntegramente el patrimonio
compartido al que se queda.

**Lo que hace hoy el procedimiento de borrado:**

- Borra los datos propios del que se va (42 tablas, con verificación derivada del catálogo).
- Borra **sólo su fila de participación** en el hogar, no el hogar: si queda alguien, el hogar y lo
  compartido siguen vivos para esa persona.
- Si se va el último, borra el hogar.
- **No mueve la titularidad.** Un préstamo compartido sigue con `user_id` del que se fue.

Ese último punto es el hueco. No hay datos en riesgo hoy (medido: cero hogares y cero filas
compartidas en producción), pero el mecanismo está incompleto y así está declarado.

Un detalle adicional que va a importar: `p_prestamos.contraparte_user_id` es `ON DELETE SET NULL`,
pero **ese `SET NULL` nunca se dispara en un borrado de datos**, porque el procedimiento no borra
la fila de `usuarios`: limpia sus datos y la deja. Quien construya Pareja va a tener que decidir si
eso cambia.

---

## 10. Integración con los otros módulos

| Módulo | Estado de la columna | Qué falta |
| --- | --- | --- |
| Préstamos | `hogar_id` implementado y probado en lecturas y escrituras | Puerta desde la interfaz |
| Inversiones | `hogar_id` existe y se persiste al crear/editar | Lecturas y escrituras compartidas |
| Sobres | `hogar_id` existe y se persiste | Lecturas y escrituras compartidas |
| Billeteras | Usa `es_compartida` (booleano), no `hogar_id` | Unificar la convención |
| Categorías / gastos | `p_estructuras_egresos.hogar_id` existe, nadie la escribe | Definir si una categoría puede ser compartida |
| Presupuestos | `hogar_id` en tres tablas, sin uso | Definir qué significa un presupuesto compartido |

La receta para cada uno es la misma que se usó en Préstamos: condición de lectura, auditoría de
escritura, guarda de pertenencia, y prueba transaccional con dos usuarios descartables.

---

## 11. Trampas y cosas que ya costaron caro

Cada una de estas nos costó una vuelta. Están acá para que no se repitan.

1. **Compartir no es visibilidad.** Ya explicado; es el error más caro.
2. **`es_compartida` en billeteras rompe el patrón.** Cualquier consulta genérica que asuma
   `hogar_id` va a fallar ahí.
3. **El trigger de saldo de la billetera se llama por `billetera_origen_id`, incluso para
   ingresos.** Si un pago compartido se registra con la billetera del otro lado, la plata no se
   mueve o se mueve al revés.
4. **Un pago no tiene hogar propio.** Por eso la corrección y la anulación quedan acotadas a quien
   pagó: si se ensanchan al co-dueño, se termina reescribiendo el movimiento de caja del otro.
5. **Sin guarda de pertenencia, `hogar_id` es una puerta abierta** a datos ajenos.
6. **No exponer ids de la pareja al navegador.** Un booleano alcanza y es más seguro.
7. **Los formularios no llevan casillas de compartir.** Se administra en un solo lugar.
8. **El `SET NULL` de `contraparte_user_id` no se dispara** en un borrado de datos, porque la fila
   de `usuarios` no se borra.
9. **Un hogar de tres no existe hoy.** Si el producto lo va a necesitar, es un cambio de modelo, no
   un detalle.

---

## 12. Cómo probar lo que se construya

La disciplina que usamos y que conviene mantener:

- **Pruebas transaccionales contra la base real**, con `BEGIN … ROLLBACK`, creando usuarios
  descartables y sin dejar nada. Nunca sobre datos de gente real.
- **Cada aserción mide el efecto observable**: la fila creada, el saldo de la billetera, el saldo
  de la deuda, y que **las cosas no cambien** cuando la operación se rechaza.
- **Una prueba de no-regresión por cada función compartida**: con un llamante sin hogar, la
  respuesta tiene que ser idéntica a la de antes. En Préstamos la hicimos con `EXCEPT` simétrico.
- **Recorrido por navegador en móvil (390 px) y escritorio** de los flujos afectados, con el número
  de la base al lado. Los tipos y los contratos no prueban que la pantalla funcione.

Volumen de referencia ya escrito para Préstamos, por si sirve de vara: 37+37 aserciones de
copropiedad, 31 de contraparte, 13 de compartir por ítem, 8 del cuestionario de vínculos.

---

## 13. Preguntas abiertas, para decidir antes de construir

1. ¿Un objeto compartido puede volver a ser privado? ¿Con qué regla si el otro ya registró
   movimientos sobre él?
2. ¿Qué pasa con la titularidad cuando alguien se va: se reescribe a nombre del que queda, o se
   agrega una noción de «sin titular» que hoy no existe?
3. ¿Hacen falta hogares de más de dos personas? Hoy el modelo no los representa.
4. ¿Se avisa al integrante que queda cuando el otro borra sus datos? No está decidido.
5. ¿Las categorías y los presupuestos pueden ser compartidos, o sólo billeteras, sobres,
   inversiones y préstamos?

---

## 14. Referencias

- Tablas: `p_hogares`, `p_hogar_participantes`, `p_hogar_pagos`, `p_hogar_conciliaciones`,
  `p_hogar_invitaciones`, `p_proyectos_compartidos`.
- Columnas: `hogar_id` en `p_caja`, `p_estructuras_egresos`, `p_inversiones`, `p_prestamos`,
  `p_sobres`, `p_presupuestos*`; `p_billeteras.es_compartida`; `p_prestamos.contraparte_user_id`.
- Funciones del hogar: las 16 listadas en el punto 1.
- Funciones de Préstamos tocadas por la copropiedad: `fn_prestamos_listar`, `fn_prestamo_detalle`,
  `fn_prestamo_crear`, `fn_prestamo_editar`, `fn_prestamo_registrar_pago`,
  `fn_prestamo_corregir_pago`, `fn_prestamo_eliminar_pago`, `fn_prestamo_eliminar_historial`,
  `fn_prestamo_gestionar_deuda`, `fn_saneamiento_vinculos_responder`, `fn_prestamos_calendario`,
  `fn_prestamos_resumen`, `fn_desvincular_pareja` (sin la distribución aprobada).
- Espejos de esas funciones en `funcionesSQL/`; índice completo en
  `start_info/indice de funciones.md`.
- Pruebas: `tests/prestamos/copropiedad-lectura-transaccional.sql`,
  `copropiedad-escritura-transaccional.sql`, `contraparte-lectura-transaccional.sql`,
  `compartir-por-item-transaccional.sql`, `vinculos-puntaje-copropiedad-transaccional.sql`.
- Notas de trabajo del módulo Préstamos: `odd/tasks/prestamos-saneamiento-rebuild.md` y
  `odd/tasks/traspaso-pareja.md`.
