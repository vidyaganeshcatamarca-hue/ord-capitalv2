# Recurrentes — depuración de la tanda de 15 puntos

Rama: `pi/sesion-3`. Continúa `odd/tasks/gastos-recurrentes-panel.md` (handoff del módulo).
Cada `S#` cita el pedido del dueño sin resumir. El `L1` del Log es el pedido completo.

## Specs

**S1 — Monto siempre fijo: se elimina la opción de promedio.**
"Al ingresar un movimiento recurrente, un gasto, tengo una opción en el modal que es monto fijo o
promedio de los últimos tres meses. Promedio de los últimos tres meses es incorrecto, el monto
siempre es fijo, así que debes sacar ese modal directamente, sacas la opción. Ambas opciones quedan
fuera y el monto es fijo siempre. Luego en cuarentena se puede llegar a modificar, si es que ha
cambiado."

**S2 — Billetera obligatoria y nombre traducido.**
"Al elegir billetera aparece una opción sin billetera elegir la después, eso es incorrecto, siempre
tengo que elegir la billetera de origen Y después tenemos la billetera efectivo, aparece la key sin
traducción."

**S3 — Ajustes: doble borde verde por grupo y Recurrentes primero.**
"En el menú ajustes para invocar a los gastos recurrentes, la identación y su padre que es dato y
operaciones. Quiero que resaltes el borde verde de todos los componentes del mismo grupo con un
doble borde verde grueso para que quede bien clarito cuáles son los componentes del grupo. Y además
que pongas recurrentes como primera alternativa. Y esto de doble borde para los grupos del menú de
ajustes se aplica a todos los submenús de los grupos del menú de ajustes."

**S4 — Categoría: tocar la fila despliega las subcategorías.**
"Para elegir la categoría en los recurrentes de egresos, quiero que al hacer clic en la categoría ya
se despliegue las subcategorías. Ahora, para que eso suceda, tengo que tocar en la flechita hacia
abajo. Pero dejando la flechita para indicar cuáles son las que tienen subcategorías, yo quiero
tocar en la categoría y que se me despliegue solito, en cualquier parte de la categoría."

**S5 — Sin límite de 3 días por semana o por mes.**
"Tanto en el modal semanal como en el mensual me permite elegir solo 3 días de la semana o 3 días
del mes. Quiero quitar esa restricción para que se puedan elegir los días que quieran. En la semana
hasta 7, en el mes hasta 31. No hay restricción en ese sentido."

**S6 — Estado del módulo de ingresos recurrentes (informe).**
"¿Qué pasó con el módulo de ingresos de recurrentes? ¿En qué etapa quedó? ¿Qué no está desarrollado?
Tiene la misma lógica, creo que las funciones ya estaban corregidas, pero no ha desarrollado el
contenido. Todo lo que uno sepa, fíjate en Engram y en lo anterior hecho."

**S7 — Única vez: no hay fecha de fin.**
"Cuando la modalidad elegida es Única Vez, tiene que desaparecer la fecha de fin, directamente no se
elige fecha de fin porque es una Única Vez."

**S8 — Con tarjeta no se elige día ni se muestra el calendario mensual.**
"Cuando la billetera es una tarjeta en el gasto recurrente no aparece el calendario mensual porque
se respeta los cierres de cada tarjeta. Así que cuando se repite toda esa sección hay que sacarla
del frontend. Además, si no elijo un día, me tira ese mensaje de error que tengo que elegir un día
para poder guardar ese recurrente, lo cual está mal, por el mismo motivo que te acabo de decir, no
se elige día para la billetera de tarjeta porque el día es el día de cierre de la tarjeta, y se
muestra con tres días de antelación en cuarentena."

**S9 — Iconos lucide: nombres sin resolver.**
"Acá tenemos un problema de nombre de icono no resuelto UsersRound en el icono de la ropa. Algo pasó
que no aparece el icono y aparece el nombre. Vuelvo a chequear los iconos a ver si hay más iconos
con este problema (iconos lucide)."

**S10 — Las categorías de sistema no se ofrecen para elegir.**
"Cuando muestras las categorías, estás mostrando también categorías de sistema como misterio,
olvido o inversiones. Las categorías de sistema no se muestran en los desplegables de elección."

**S11 — Sin avisos del manejo interno de días.**
"El mensaje de elegir hasta tres días completo, hay que sacarlo, y el mensaje de que avisamos que en
febrero caerían los días, etcétera, también lo sacamos, no se avisa nada del manejo interno de
febrero y los días de 30 días, eso es automático, sin mensaje."

**S12 — El interruptor de dólares no se apaga ni se pierde al guardar.**
"El botón recurrente de tarjeta para pagar en dólares se prende pero ante cualquier clic en otro
lugar se apaga y si lo dejo prendido y pongo guardar no lo toma queda apagado y no registra el gasto
como en dólares."

**S13 — Cómo funciona el motor de recurrentes (informe).**
"Infórmame cómo funciona el motor de recurrentes, cuándo se activan, cuándo se hacen los controles,
si se hacen cada vez que la app inicia una vez por día o qué ritmo tienen, cuéntenme un poquito cómo
está desarrollado porque perdí el hilo y no sé cómo se hizo."

**S14 — Unificar la clave one/other del borrado en los tres diccionarios.**
"Ya he corregido yo este mensaje en es.ts. traducir a otros diccionarios. unificar la clave para uno
y muchos, ya no es necesaria la diferencia."

**S15 — Recorrido móvil completo de Recurrentes con Pi-Ego.**
"Corre desde punto a punto con PI-EGO todas la pantallas de recurrentes en modo móvil en busca de
errores y para edificar que tus correcciones han quedado todas bien."

## Tasks

| ID | S# | Ruta | Estado |
|---|---|---|---|
| T1 | S1 | modal: quitar el selector de variabilidad; enviar siempre `fijo` | hecho |
| T2 | S2 | modal: billetera obligatoria, sin opción vacía, nombre con `t()` | hecho |
| T3 | S3 | `settingsMenu.ts` + `ConfiguracionHub.css`: doble borde verde por grupo, recurrente primero | hecho |
| T4 | S4 | `CategoriaPicker`: la fila del grupo expande; el chevron queda como indicador | hecho |
| T5 | S5 | front `RECURRENCIA_LIMITES` sin tope + SQL de constraints | front hecho / SQL pendiente de OK |
| T6 | S6 | informe del estado de ingresos recurrentes (sin código) | informado |
| T7 | S7 | `RecurrenciaEditor`: sin fecha de fin en modo `unica` | hecho |
| T8 | S8 | tarjeta: sin bloque mensual ni error de día + SQL | front hecho / SQL pendiente de OK |
| T9 | S9 | iconos: `item.icono` con `CategoryIcon` en la tarjeta; auditoría del catálogo | hecho |
| T10 | S10 | `GastosRecurrentesPage`: filtrar categorías de sistema | hecho |
| T11 | S11 | sacar los hints de 3 días y del recorte de febrero | hecho |
| T12 | S12 | el interruptor de USD: `ToggleSwitch` (el reset global mataba el tilde nativo) | hecho |
| T13 | S13 | informe del motor (sin código) | informado |
| T14 | S14 | unificar `recurrentes_borrar_cuerpo_*` en es/en/pt y sus usos | hecho |
| T15 | S15 | recorrido móvil de punta a punta (Pi-Ego no disponible: se usó Playwright 360×844) | 18/18 PASS |

## Log

**L1 (pedido original, verbatim):** ver §"Specs" — es el mismo texto, un punto por `S#`.

**L2 (clasificación, orquestador):** tanda grande (15 puntos, 3 áreas de UI + SQL pendiente de
aprobación) → documento de tarea, `todo` visible y commits por unidad de trabajo.

**L3 (decisión de alcance):** T5 y T8 tienen parte de backend (CHECKs de tabla y validaciones de
`fn_crear/editar_gasto_recurrente`). Regla 1 del `AGENTS.md`: se presenta el SQL y se espera OK.
El frontend se implementa igual, alineado al contrato nuevo.

**L4 (evidencia de base, sólo lectura vía Management API):** `dia_del_mes` es NOT NULL; el CHECK
`forma_check` limita `dias_semana` y `dias_mes` a 1..3; `dias_rango_check` ya acepta 1..7 y 1..31;
con tarjeta solo se admite `modo='mensual'` y la fila igual necesita un día. El generador ya calcula
el día de tarjeta con `dia_cierre` y no lee `dias_mes`. → el único cambio de backend necesario son
`dia_del_mes` nullable, el CHECK de forma y las dos RPC de alta/edición.
Archivo propuesto: `temp_sql/74_recurrentes_sin_tope_y_tarjeta_sin_dia.sql` (no aplicado).

**L5 (motor):** `fn_generar_recurrentes_hoy()` recorre TODAS las recurrencias activas de TODOS los
usuarios y es `SECURITY DEFINER`. Hoy NO la invoca nadie: no hay job en `cron.job` ni llamada en
`src/`. El motor existe y está probado, pero está inerte hasta que se agende.

**L6 (verificación móvil):** `ego-browser` no está instalado en esta máquina (`spawn ego-browser
ENOENT`) y la ventana de ego-lite no está abierta. Se verificó igual con Playwright (Chromium,
360×844, `isMobile`), script `tests/recurrentes-mobile-e2e.mjs`, 18/18 PASS. La sesión del usuario de
prueba se rearmó con un magic link propio (perfil de ego vencido el 2026-11-02).

**L7 (regresión):** suite de `tests/*.test.js` 270 pass / 4 fail, **los mismos 4 que antes del cambio**
(verificado con `git stash`), `tsc --noEmit` 0 y `npm run build` exit 0.
