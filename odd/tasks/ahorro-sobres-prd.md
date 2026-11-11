# Ahorro / Sobres — PRD funcional consolidado 2026-11-06

Rama `feat/ahorro-sobres-prd`. Fuente única de verdad:
`C:\temp\Antigravity\ORD Capital v2\Personal\docs\ahorro\ORD_Ahorro_Sobres_PRD_Funcional_Consolidado_2026-11-06.md`
(32 decisiones DF-01..DF-32 aprobadas; 12 precisiones pendientes en §16 sin aprobar).

## Specs

- **S1** (L1, verbatim): "Vamos a terminar de desarrollar el módulo de ahorro sobres, pulir lo que está hecho y corregir lo que haya que corregir."
- **S2** (L1, verbatim): "síguelo al pie de la letra, ya está verificada la planificación. Si encuentras contradicciones me preguntas, si encuentras errores me preguntas".
- **S3** (L1, verbatim): "revisa el código que ya está desplegado, corrige lo que no funcione, agrega lo que no esté implementado, quita lo que no vaya de este módulo".
- **S4** (L1, verbatim): "usa Ego Browser para las verificaciones, siempre en modo móvil, ingresa con las cuentas de Google disponibles, cualquiera, son de testing, sobre todo el user 198, Ariel Dere 75".
- **S5** (L1, verbatim): "Los cambios los vas comitiendo en una rama nueva."
- **S6** — DF-06 del PRD: sólo el **nombre** es obligatorio; monto objetivo y fecha son opcionales e independientes.
- **S7** — DF-07: **una sola moneda por sobre**, elegida al crear; sin conversiones.
- **S8** — DF-01/DF-02/DF-03: modalidad **real externa** o **virtual en ORD** por cada aporte, con atribución de la billetera de origen conservada aunque el sobre reciba de varias.
- **S9** — DF-04/DF-05/DF-29: el rescate vuelve **exclusivamente a su billetera de origen**, con reparto explícito entre orígenes; nunca transferencia entre sobres.
- **S10** — DF-20: **eliminar el concepto Cuenta Madre**. No crear cuentas especiales para respaldar sobres.
- **S11** — DF-21..DF-24: rendimiento **manual** por sobre sobre una reserva real elegible, un **único ingreso** «Rendimientos de ahorros» en Actividad reciente e informes, sin duplicar saldo libre.
- **S12** — DF-12/DF-13/DF-15: semáforo por **ritmo real vs. ideal**, verde ≥85%, amarillo ≥60% y <85%, rojo <60%, con período neutral inicial.
- **S13** — DF-16/DF-17: **historial básico** (fecha, tipo, importe, billetera) y corrección del **movimiento original** con auditoría.
- **S14** — DF-18/DF-19: archivar **sólo con saldo exactamente cero**, histórico consultable, **sin reactivar** y **sin pausa**.
- **S15** — DF-26/DF-27: orden inicial (meta+fecha → meta sin fecha → sin ambas), arrastre persistente, Aportar/Rescatar visibles y el resto en menú de tres puntos.
- **S16** — DF-31: en Free se conserva consulta, edición, corrección, rescate y archivado; se bloquean creación y aportes nuevos.
- **S17** — §13 del PRD: traducciones **íntegras** en los idiomas activos (hoy faltan las 56 claves del módulo en es/en/pt).

## Diagnóstico del código desplegado (HEAD `760f4a6` == `produccion`)

| Qué | Evidencia |
|---|---|
| **i18n ausente al 100%** | Las 56 claves que usa el módulo (`sobres_*`, `state_*`) dan `0` en `es.ts`, `en.ts` y `pt.ts`. Verificado en móvil: la pantalla renderiza `sobres_title`, `sobres_subtitle`, `sobres_total_saved`, `state_in_progress`. `src/locales/*.ts` |
| El sobre **es una billetera** | `p_billeteras.es_fondo_prevision = true` + `monto_meta` + `fecha_objetivo`. `funcionesSQL/fn_crear_fondo_prevision.md` |
| Moneda **hardcodeada ARS** | `INSERT ... VALUES (p_nombre, 'ARS', 0, ...)` en `fn_crear_fondo_prevision`. |
| Alta **exige meta y fecha** | `SobreFormModal.tsx:48` rechaza si `amount <= 0` o falta `fechaObjetivo`; `defaultTargetDate()` precarga hoy+6 meses (DF-06 + nota UX de §5.2 incumplidos). |
| Aporte/rescate = **transferencia de caja** | `SobreTransferModal.tsx:52` llama `fn_registrar_movimiento_caja` con `tipo='transfer'`; el origen se pierde, no hay modalidad real/virtual, no hay reparto multi-origen. |
| **Cuenta Madre vigente** | `RespaldoFisicoPanel.tsx` usa `fn_crear_cuenta_madre_ahorro`, `fn_vincular_sobre_a_respaldo`, `fn_distribuir_rendimientos_proporcional`. DF-20 la elimina. |
| **Transferencia entre sobres** | `fn_transferir_entre_sobres` + strings `toast_transfer_envelope_*`. DF-29 la prohíbe. |
| Historial **no existe** | `SobreDetail.tsx:56` imprime `t('sobres_history_unavailable')`. |
| Semáforo **no cumple DF-12/13** | `fn_calcular_cuota_sobre` usa `state_critical` por "≤2 meses y <50%"; sin período inicial, sin umbrales 85/60, sin ritmo real. |
| Sin meta/fecha **muestra datos falsos** | `fn_reporte_estado_fondos_prevision` devuelve `dias_restantes = fecha_objetivo - hoy` → `NULL` → `Number(null) = 0` → "0 días" (CA-13). |
| Archivado con **tolerancia 0,01** | `fn_archivar_fondo_prevision`: `IF ABS(v_saldo) > 0.01` y luego `saldo_actual = 0`. Contradice §8.3 y CA-23. |
| Orden / arrastre **no existe** | No hay columna de orden ni drag & drop en `SobresPage.tsx`. |
| Plan Free **no aplicado** | `usuarios.plan_tipo` existe (`free`/`trial`) pero ninguna RPC ni pantalla lo consulta. |
| Rendimientos **sin ingreso** | `fn_distribuir_rendimientos_proporcional` inserta `p_caja.tipo='adjustment'`; DF-22 exige ingreso «Rendimientos de ahorros». |

## Decisiones abiertas

- **D1 (bloquea T1..T4)** — modelo de datos del dinero. El modelo actual no puede cumplir S8/S9. **RESUELTA:** el dueño eligió la opción **A** (tablas nuevas, atribución derivada de movimientos).
- **D2 (§16 del PRD)** — 12 precisiones pendientes; propuestas en `## Precisiones propuestas`. El ítem 12 (datos legacy) queda **sin efecto**: no hay datos que migrar.

## Tasks

| ID | Tarea | Specs | Estado |
|---|---|---|---|
| T1 | Modelo de datos en Supabase (sin migración: no había datos) | S6-S11 | **done** `685988d` |
| T2 | RPCs núcleo (listar/porciones/detalle/crear/editar/aportar/rescatar/archivar/reordenar) | S6-S9, S14 | **done** `2cf529a` |
| T5 | UI completa + i18n es/en/pt (109 claves × 3 idiomas) | S6-S17 | **done** `ecb2d1c` |
| T6 | Cuota dinámica, semáforo 85/60, período inicial, reprogramación | S12 | **done** en `fn_sobre_plan` |
| T10a | Retiro de Cuenta Madre, transferencia entre sobres y gráfico inventado | S10, S9 | **done** `ecb2d1c` |
| T4 | RPC de rendimiento + ingreso único en `p_caja` + modal | S11 | **done** `3071e08`; prueba visual en L17 |
| T3 | Integración presupuesto: reservas virtuales en `fn_obtener_saldo_a_asignar` | S8, DF-32 | pending: autorización |
| T11 | Corregir aportes y rescates (DF-17, §8.2) | L11, L16 | **done**: RPC, modal, botón y prueba visual (L17) |
| T7 | Orden manual por arrastre persistente | S15 | **done**: ver L10 y prueba visual en L17 |
| T8 | Plan Free en la UI | S16 | **sin objeto**: el dueño levantó la restricción (ver L14) |
| T9 | Notificaciones por infraestructura general | DF-30 | pending |
| T10b | Baja de las RPC legacy de Cuenta Madre y transferencia entre sobres | S10 | **done** `c02bb37` (nueve RPC dropeadas; queda `fn_transferir_entre_sobres` por cupo de presupuesto) |

## Precisiones propuestas (§16, no aprobadas)

| # | Tema | Propuesta |
|---|---|---|
| 1 | Fecha sin meta | **RECHAZADA por el dueño.** Una fecha sola no existe: sin meta no se acepta la fecha (ver L9). |
| 2 | Moneda tras primer aporte | Bloqueada si el sobre tiene movimientos; permitida si saldo 0 y sin movimientos. |
| 3 | Cuota exacta | `meses = max(1, ceil(meses_calendario_restantes))`; `cuota = ceil(faltante / meses)` a 2 decimales; quincenal `cuota/2`, semanal `cuota/4.345`. |
| 4 | Ritmo ideal tras reprogramar | `esperado = base + (meta - base) * dias_transcurridos / dias_totales`, con `base` = saldo al replanificar. |
| 5 | Aviso "próxima a vencer" | **RATIFICADA** (ver L12): 7 días si el plazo total es menor a 6 meses, 14 días desde 6 meses. Una sola notificación por (sobre, evento, fecha_objetivo). |
| 6 | Rendimiento nuevo en Free | **RATIFICADA**: permitido, es dinero ya acreditado que el usuario conserva. |
| 7 | Edición histórica dependiente | **RATIFICADA** (ver L11): piso = lo ya rescatado de la porción; billetera y modalidad sólo si la porción no tiene rescates. |
| 8 | Confirmación de archivado | Modal de confirmación explícita e irreversible. |
| 9 | Aporte inicial fallido | Todo o nada: una sola transacción; si falla, no se crea el sobre. |
| 10 | Inserción tras orden manual | **RATIFICADA** (ver L10): el sobre nuevo entra al final de su grupo. |
| 11 | "1 mes" y plazo < 7 días | Un mes calendario; si la fecha objetivo está a menos de 7 días, espera 1 semana. |
| 12 | Datos legacy | **Sin efecto**: verificado que no existen sobres ni cuentas madre en `p_billeteras`. |

## Log

- **L1** (pedido original, verbatim):

> Vamos a terminar de desarrollar el módulo de ahorro sobres, pulir lo que está hecho y corregir lo que haya que corregir . Hemos cambiado algunas indicaciones, vas a encontrar todo en el PR que te paso a continuación, síguelo al pie de la letra, ya está verificada la planificación. Si encuentras contradicciones me preguntas, si encuentras errores me preguntas, revisa el código que ya está desple gado, corrige lo que no funcione, agrega lo que no esté implementado, quita lo que no vaya de este módulo. Pregúntame todo lo necesario, usa Ego Browser para las ver ificaciones, siempre en modo móvil, ingresa con las cuentas de Google disponibles, cualquiera, son de testing, sobre todo el user 198, Ariel Dere 75. El PR es el siguiente:
> C:\temp\Antigravity\ORD Capital v2\Personal\docs\ahorro\ORD_Ahorro_Sobres_PRD_Funcional_Consolidado_2026-11-06.md
>
> , está en otra carpeta, no en tu carpeta de sistema, pero tú trabajas en tu propia carpeta, eres PI3. Los cambios los vas comitiendo en una rama nueva.

- **L2** — Auditoría del código desplegado completada (`HEAD 760f4a6` == `produccion`). Evidencia en `## Diagnóstico`. Verificación en vivo con ego-browser, viewport 390×844, cuenta `arieldere75@gmail.com` (user 198): `http://localhost:5173/sobres` renderiza todas las claves i18n crudas y el panel de Cuenta Madre. Capturas en `C:\Users\Vidya Ganesh\ego\ahorro-sobres-audit-20261106-01\`.
- **L3** — `https://personal.workcapital.com.ar/sobres` devolvió `502 Bad Gateway` (Cloudflare) el 2026-11-09 11:34 UTC. La verificación se hizo contra el dev server local, que corre el mismo commit que `produccion`.
- **L4** (corrección del dueño, verbatim): "las pruebas las haras con el user vidyaganeshcatamarca, que usa presupuesto base 0 cuando corresponda". → Cuenta de prueba: `vidyaganeshcatamarca@gmail.com` = **user 1** (`plan_tipo = free`). El user 198 (`arieldere75@gmail.com`, `trial`) queda sólo para verificación visual. El plan Free del user 1 sirve además para probar DF-31 (S16).
- **L5** — D1 resuelta: opción A. DDL escrito en `odd/tasks/ahorro-sobres-prd.schema.sql`, validado en una transacción con `ROLLBACK` y **creado en Supabase** con autorización del dueño. Verificado en la base: 3 tablas, RLS activo, todas las constraints e índices.
- **L6** (constancia del dueño, verbatim): "ten en cuenta que no hay users con sobres creados que migrar". → Verificado: `p_billeteras` tiene `0` filas con `es_fondo_prevision`, `0` con `es_cuenta_madre_ahorro` y `0` con `billetera_respaldo_id`. Se retiró del modelo el caso legacy (`es_legacy`, `legacy_billetera_id`): billetera de origen y modalidad pasan a ser obligatorias en todos los movimientos.
- **L7** — T1, T2, T5 y T6 cerrados y commiteados. Verificado en la base con 20 aserciones transaccionales (`PASS`) sobre el user 198 y el user 1 para el caso Free, y en movil 390x844 con ego-browser: alta con aporte inicial virtual, segundo aporte real desde otra porcion, rescate repartido 30.000 + 20.000, detalle con cuotas y equivalencias, historial y saldos. Capturas en `C:/Users/Vidya Ganesh/ego/ahorro-sobres-audit-20261106-01/`.
- **L8** — Datos de prueba borrados al terminar (`p_sobres`, `p_sobre_movimientos` y `p_sobre_movimientos_auditoria` en 0). La billetera auxiliar del test SQL nunca persistio: corria dentro de `ROLLBACK`.
- **L9** (definición 29, corrección del dueño, verbatim): "ok, proyecto". Ratifica el replanteo que el agente presentó: **la fecha sólo existe si hay meta**. Quedan dos tipos de sobre y se retira la propuesta de "fecha sin meta" del §16 (fila 1). Aplicado en la base: `CHECK (fecha_objetivo IS NULL OR monto_meta IS NOT NULL)`, rechazo con `error_sobre_date_requires_meta` en `fn_sobre_crear` y `fn_sobre_editar`, estados `state_free_savings` (sin meta ni fecha) y `state_project` (con meta y sin fecha) en `fn_sobre_plan`, y orden inicial de tres grupos en `fn_sobres_listar`: proyecto con fecha → proyecto sin fecha → ahorro libre. En la UI la fecha queda deshabilitada hasta que haya meta, y borrar la meta borra la fecha. Verificado con 10 aserciones transaccionales (`PASS`) en `temp_sql/ahorro_fecha_meta_test.sql`, incluido que el `CHECK` de la tabla también lo impide por fuera de las RPC.
- **L10** (definición 30, ratificación del dueño, verbatim): "primera regla correcta, arrastre para a modo manual. Agregar un boton en ese caso que diga 'orden automatico'" y después "para volver a modo automatico, con el boton". Ratifica: el primer arrastre convierte la lista entera en orden manual, y el botón vuelve al automático. Implementado: hook `useOrdenArrastre` (presión sostenida 350 ms, sin librerías, con `pointer events` y captura de puntero; el objetivo se elige por la tarjeta cuyo centro está más cerca del dedo, así funciona en una columna y en la grilla de escritorio), botón "Orden automático" visible sólo cuando hay orden manual, y aviso "Mantené presionada una tarjeta para moverla" cuando no lo hay. **Autorización explícita del dueño ("si") para crear la RPC** `fn_sobres_orden_automatico()`, porque ninguna función existente apagaba `orden_manual`. Renumera por fecha de alta: si sólo apagara la bandera, al volver al automático los grupos quedarían bien pero las tarjetas de cada grupo seguirían en el orden del último arrastre. Verificado con 9 aserciones transaccionales (`PASS`) en `temp_sql/ahorro_orden_automatico_test.sql`: agrupación inicial, arrastre a manual, apagado de la bandera, vuelta a los grupos, renumeración por alta y sobre nuevo al final de su grupo. **Pendiente: la prueba visual en móvil**, que el dueño pidió juntar en una sola pasada al final.
- **L11** (definición 31, ratificación del dueño, verbatim): "si". Ratifica las tres reglas de la corrección de aportes y rescates (§16.7, DF-17, §8.2):
  1. **Piso del importe**: un aporte no puede quedar por debajo del total ya rescatado de esa misma porción (`billetera_id` + `modalidad`). Ejemplo con billetera 200.000, aporte real 100.000 y rescate real 30.000: el piso del aporte es 30.000; bajarlo a 50.000 deja la porción en 20.000 y la billetera en 180.000; bajarlo a 25.000 dejaría la porción en −5.000 y se rechaza con `error_sobre_aporte_below_rescued`. El rescate es espejo: su importe no puede superar lo aportado en su porción.
  2. **Cambio de billetera de origen**: permitido sólo si esa porción no tiene rescates (`error_sobre_portion_in_use`). Si los tiene, reatribuirlos dejaría rescates apuntando a una billetera de la que nunca salió plata, así que se rechaza y el usuario corrige primero el rescate.
  3. **Cambio de real/virtual**: misma restricción y por el mismo motivo.
  La corrección **actualiza el movimiento original** y no crea un rescate ficticio (§8.2), y la devolución a la billetera va como `adjustment` para no contarse como ingreso ni como gasto. Queda registrada en `p_sobre_movimientos_auditoria`. **No implementado todavía**: hoy no existe ni RPC ni pantalla de corrección de aportes/rescates; esta definición habilita esa tarea.
- **L12** (definición 32, corrección del dueño, verbatim): "7 dias en proyectos de menos de 6 meses y 14 en proyectos de mas de 6 meses". Ratifica la anticipación del aviso "meta próxima a vencer" (§16.5, DF-30, §10.5), escalonada por el plazo total del proyecto:
  - **7 días** cuando el plazo total es **menor a 6 meses**.
  - **14 días** cuando el plazo total es de **6 meses o más**. El dueño dijo "más de 6"; el caso exactamente igual a 6 meses no estaba nombrado y se resuelve del lado de los 14 días, porque avisar tarde es peor que avisar de más.
  - **Plazo total** = `fecha_objetivo − plan_inicio_at`, con aritmética de calendario (`interval '6 months'`), no 180 días. Reprogramar la fecha reinicia `plan_inicio_at`, así que el plazo se vuelve a medir sobre el tramo nuevo.
  - Ejemplos: creado el 01/03 con fecha 01/08 (5 meses) avisa 7 días antes; creado el 01/03 con fecha 01/09 (exactamente 6 meses) y con fecha 01/12 (9 meses) avisan 14 días antes.
  - Un sobre sin fecha objetivo nunca avisa: no hay plazo. Si la meta ya está cumplida al abrirse la ventana, no hay "por vencer": corresponde el evento "meta alcanzada".
  - **Deduplicación**: una sola notificación por (sobre, evento, fecha objetivo), con `referencia_id = sobre_id` y la fecha en `metadata` de `p_notificaciones_enviadas`, que ya existe, igual que la categoría `cat_ahorro` de `p_notificaciones_config`. Reprogramar la fecha habilita un aviso nuevo; jamás recordatorios periódicos (DF-30).
- **L13** (definición 43, ratificación del dueño, verbatim): "si". El ingreso del rendimiento **cuenta como cualquier otro ingreso** en reportes y proyecciones. No se escribió código nuevo.
  - La proyección de capacidad (`fn_reporte_timeline_proyeccion`) no lee fuentes de ingreso: promedia `p_caja` con `tipo = 'income'` de los últimos 180 días y divide por 6. El rendimiento entra en ese promedio como cualquier otra entrada de plata.
  - Fundamento: `p_ingresos` sólo distingue `es_pasivo` y `activo`; **no existe la noción de ingreso recurrente versus extraordinario en todo el sistema**. Un aguinaldo o un bono hoy cuentan igual que el sueldo, así que excluir sólo el rendimiento sería un caso especial sin principio. Además, un usuario que registra rendimiento todos los meses tiene capacidad real que la proyección debe ver.
  - Costo que el dueño aceptó: un rendimiento grande y aislado infla el techo de capacidad durante seis meses (ejemplo: 120.000 de rendimiento único sobre 600.000 de sueldo semestral sube el promedio de 100.000 a 120.000 por mes). Si eso hubiera molestado, la solución de fondo era agregar la distinción recurrente/extraordinario para todos los ingresos, no un parche para este.
  - En `fn_reporte_top_fuentes_ingreso` el rendimiento aparece con su propia fuente, **Rendimientos**, porque la plata entró a la billetera y tiene que verse.
- **L14** (decisión del dueño, verbatim): "Quita la restricción de que Free no puede hacer actividades . Quitala." Levanta el bloqueo por plan en el módulo de ahorro. **Revierte DF-31 en lo que respecta a crear y aportar**: cualquier usuario, en cualquier plan, puede crear sobres, aportar y registrar rendimiento. Se eliminó el guard `IF v_plan = 'free'` de `fn_sobre_crear` y de `fn_sobre_aportar`, junto con la variable, la lectura de `usuarios.plan_tipo` y la clave i18n `error_sobre_plan_requires_premium` de los tres idiomas, para no dejar código muerto ni un texto que ya nunca se muestra.
  - Verificado con 5 aserciones transaccionales (`PASS`) en `temp_sql/ahorro_free_sin_bloqueo_test.sql`, corriendo como **user 1** (`plan_tipo = 'free'`): crea un sobre, aporta 1.000, la billetera baja de 461.774,99 a 460.774,99, el sobre queda con 1.000 y ninguna de las dos funciones menciona ya el plan.
  - Consecuencia operativa: el user 1 vuelve a servir para probar el alta de sobres, que era justamente lo que el bloqueo impedía.
- **L15** — Implementada la corrección de aportes y rescates que faltaba del PRD (DF-17, §8.2), con las reglas ratificadas en L11. Una sola RPC, `fn_sobre_editar_movimiento(p_movimiento_id, p_importe, p_billetera_id, p_modalidad)`, porque las reglas de un aporte y de un rescate son la misma leídas de un lado o del otro.
  - Toca la fila de `p_sobre_movimientos` y **la misma** fila de `p_caja` enlazada por `caja_movimiento_id`: nunca inserta una nueva, así que no aparece un rescate ficticio. La fecha original se conserva y queda rastro en `p_sobre_movimientos_auditoria` con motivo `savings_movement_edit`.
  - El saldo de la billetera no se recalcula a mano: lo mantiene el trigger `tr_actualizar_saldo_p_caja_integral`, que en un UPDATE revierte el OLD y aplica el NEW. Eso es lo que hace seguro cambiar la billetera de origen.
  - **Defecto propio detectado y corregido antes de commitear**: los errores de piso y techo armaban el `params` con el nombre de la variable dentro del literal (`{"maximo": v_cruzado}`), porque `RAISE EXCEPTION` no interpola variables adentro de la cadena. Ahora viajan con `%` y el valor real; la aserción A10 vigila que no vuelva a pasar.
  - Verificado con 10 aserciones transaccionales (`PASS`) en `temp_sql/ahorro_editar_movimiento_test.sql`, corriendo como user 1: rechazo por debajo de lo rescatado, corrección aceptada con el sobre y la billetera moviéndose juntos, la pata de caja editada sin duplicarse, rechazo de cambio de billetera y de modalidad con rescates en la porción, rechazo de rescate por encima de lo aportado, corrección aceptada del rescate, dos filas de auditoría, y rechazo de un rendimiento por esta vía.
  - Cuatro claves i18n nuevas en los tres idiomas: `error_sobre_not_a_contribution`, `error_sobre_aporte_below_rescued`, `error_sobre_rescate_above_contributed`, `error_sobre_portion_in_use`.
  - **Falta la pantalla** para corregir desde el detalle del sobre: la RPC está lista y probada, la UI todavía no existe.
- **L16** — Pantalla de corrección de aportes y rescates, sobre la RPC de L15. Cada fila del historial que sea aporte o rescate gana un botón que abre `SobreMovimientoModal` con importe, billetera y modalidad precargados. El rendimiento no entra por acá: tiene su propia corrección (DF-28).
  - Para poder precargar la billetera hizo falta **una línea autorizada por el dueño** en `fn_sobre_detalle`: el historial ahora expone `billetera_id` además de `billetera_nombre`. No se podía resolver por nombre porque **el mismo user 1 tiene dos billeteras llamadas "Dolar app"** (ids 400 y 1171): corregir contra la homónima equivocada habría sido exactamente el error que esta función existe para evitar. Verificado con 3 aserciones transaccionales (`PASS`): el id llega, coincide con el nombre que ya venía, y el resto del JSON no cambió.
  - Cinco claves i18n nuevas en los tres idiomas: `sobres_correct_title`, `sobres_correct_hint`, `sobres_correct_success`, `sobres_correct_action`, `sobres_wallet_destination`.
  - `tsc -b` limpio. **Sin prueba visual todavía**: entra en la pasada final pendiente (tarea 51).
- **L17** — Prueba visual completa en móvil (390×844, ego, sesión de Google del **user 1**), capturas 42 a 54. Cierra los tres frentes que quedaban abiertos: orden por arrastre, corrección de aportes y **rendimiento**, que era el único sin evidencia en pantalla.
  - **Fecha sin meta**: con meta la fecha se habilita; al quitar la meta se limpia y vuelve a quedar deshabilitada. Los tres estados verificados.
  - **Orden**: la lista arranca en los tres grupos (proyecto con fecha → proyecto sin fecha → libre). Al arrastrar el sobre libre al tope aparece el botón "Orden automático"; al pulsarlo la lista vuelve al orden por alta y el botón desaparece, porque el sobre ya no está en modo manual.
  - **Aporte y corrección**: aporte de 1.000 y corrección a 500 desde el lápiz del historial: queda **un** movimiento y **una** pata de caja editada, no dos.
  - **Rendimiento** (la que faltaba). La causa del bloqueo anterior era de vocabulario: los dos botones de modalidad dicen *"It is still in my account; I reserve it in ORD"* y *"I set it aside at the institution"*, no "Real"/"Virtual", así que buscar por texto `real` nunca activaba la modalidad real y el checkbox `.sobre-check` no existía. Clickear el segundo botón por posición lo destraba. Flujo verificado: aporte **real** de 300 con el checkbox *"This reserve earns returns"* tildado → el detalle muestra la porción como **SET ASIDE** y los aportes virtuales como **RESERVED IN ORD** (4.500 y 325, la distinción se ve en pantalla) → menú de la tarjeta → *Record return* → importe 25 → el historial muestra **Return · Nov 11 · +ARS 25** y el saldo del sobre pasa a 4.825.
    - En la base queda exactamente el diseño de S11: movimiento `rendimiento` (id 129) con `caja_ingreso_id` → fila de `p_caja` `tipo='income'`, `detalle='savings_yield'`, `cuenta_ingreso_id=219`, `valor_ingreso=25`; y la pata `adjustment` con `detalle='savings_envelope_aporte_real'` y `valor_egreso=25`. El ingreso acredita la billetera y la reserva la debita: **el saldo de la billetera queda igual**, el sobre sube. Un solo ingreso por rendimiento, como pide DF-21.
    - El modal sólo ofrece reservas reales, con `genera_rendimiento` y saldo vivo (filtro sobre `fn_sobre_porciones`), y la porción virtual nunca aparece: un rendimiento va siempre a la reserva que lo generó.
  - **Limpieza de los datos de prueba**, con el orden que exige el esquema y un paso que no estaba previsto: `p_sobre_movimientos_auditoria` tiene FK **RESTRICT** contra los movimientos, así que se borra **primero la auditoría**, después las patas de `p_caja`, después los movimientos y al final los sobres. Borrar una pata restaura el saldo por el trigger; la FK `caja_movimiento_id` es SET NULL, por eso el orden es seguro.
  - Resultado de la limpieza: cero sobres, cero movimientos, cero filas de auditoría y cero patas. La billetera 2 volvió a **220.774,99**, que es exactamente el saldo que tenía antes de crear el primer sobre de prueba: no quedó ni un peso de residuo. La pantalla quedó en el estado vacío ("No envelopes yet").
- **L18** — **Bug encontrado en la auditoría de punta a punta y arreglado**: el aporte inicial **virtual** del formulario de alta **no descontaba de la billetera**. El movimiento quedaba con `caja_movimiento_id = NULL`, así que la misma plata se veía dos veces (en la billetera y en el sobre) y el usuario podía gastar lo que ya había reservado.
  - **Causa**: `fn_sobre_crear` creaba la pata de caja solo en la rama real (`IF p_aporte_modalidad = 'real' THEN ... v_caja_id := fn_sobre_pata_billetera(...)`), mientras que `fn_sobre_aportar` la crea siempre. El mismo acto —aportar— se comportaba distinto según el botón, y contradecía la regla ratificada de que real y virtual descuentan igual y solo difieren en la conciliación. Además la validación virtual restaba a mano lo ya reservado (`saldo − v_ya_reservado`), lo que con el arreglo habría descontado dos veces.
  - **Arreglo** (autorizado por el dueño): la pata se crea siempre, la validación queda en una sola (`saldo >= importe`, porque el saldo ya viene neto de lo reservado) y desaparece `v_ya_reservado`, que quedaba sin uso. Se regeneró el espejo desde la definición viva.
  - **Evidencia**: 8 aserciones transaccionales (`PASS`) en `temp_sql/ahorro_crear_virtual_test.sql` — el alta virtual descuenta, el movimiento queda con pata `adjustment` de egreso, el sobre recibe el importe, **la suma billeteras + sobres se conserva** (459.265,59 antes y después: no se crea ni se destruye plata), rechaza el importe mayor al saldo, el alta sin aporte no toca la billetera y el alta real sigue descontando con su modalidad y su rendimiento.
  - **Verificado también en la app real**: sobre "QA Virtual Fix" con 500 virtuales desde Cash → movimiento con pata, saldo de la billetera de 218.774,99 a **218.274,99** (−500 exacto).
  - **Hecho del terreno**: `fn_sobre_crear` exige billetera e importe **juntos**; pasar billetera sin importe responde `error_sobre_initial_aporte_invalid`.
  - **Bug menor pendiente** (misma tanda): el rechazo por saldo insuficiente llega al usuario con el texto `{{billetera}}` sin interpolar.
- **L19** — **Auditoría de punta a punta del módulo en la app real** (móvil 390×844, user 1), antes de avanzar con los avisos. Ocho bloques recorridos, dos bugs corregidos y cinco hallazgos abiertos.
  - **B1 alta**: los tres estados y los tres grupos bien (`PLAN STARTED` con fecha, `PROJECT` sin fecha, `FREE SAVINGS`); la cuota, quincenal y semanal coinciden exacto con `fn_sobres_listar` (64.675 / 32.338 / 15.091 con 498.000 de faltante y 231 días, verificado a mano); validaciones del front todas con su mensaje.
  - **B2 aportes**: virtual y real descuentan, decimales aceptados, rechazo por saldo con el modal abierto, meta alcanzada (`GOAL REACHED`) y aporte por encima de la meta permitido (106,67%).
  - **B3 rescates**: por porción, "todo" exacto, repartido virtual + real en un envío, y el aviso de que la plata del banco se libera allá; rescate total deja el sobre en 0.
  - **B4 corrección y archivo**: la corrección edita el movimiento y su misma pata con auditoría; bloqueo por porción sucia con mensaje claro; archivar exige saldo 0 y el `ConfirmModal` avisa que no se reactiva.
  - **B5 orden**: arrastre → 77 al tope y las tres a manual; "Automatic order" renumera y apaga la bandera; el sobre nuevo entra al final **de su grupo**.
  - **B6 cálculos**: reprogramar de 2027-06-30 a 2028-06-30 pasa de 231 a 597 días y la cuota de 64.675 a 25.025 (12.513 y 5.839), todo cuadra a mano; con el plan iniciado 90 días atrás el sobre muestra `BEHIND`.
  - **B7 moneda y aislamiento**: sobre en USD con su billetera (273 → 223) y formato propio; el user 198 ve 0 sobres y pedir porciones, aportar, archivar o corregir un sobre del user 1 responde `error_sobre_not_found`. El único "no rechazo" fue `fn_sobre_saldo`, y es **falso positivo**: es helper interno con EXECUTE sólo para `postgres` y `service_role` (como `fn_sobre_pata_billetera`, `fn_sobre_plan`, `fn_sobre_producto_rendimiento` y `fn_sobre_saldo_base`), así que el cliente no puede llamarlo.
  - **B8 limpieza**: auditoría, patas, movimientos y sobres fuera; la billetera ARS volvió a **220.774,99** y la USD a 273, o sea el estado previo exacto.
  - **Bugs corregidos**: (1) el aporte virtual del alta no descontaba de la billetera (`cd5bac6`, ver L18); (2) la tarjeta mostraba `$ 2.000` donde el detalle mostraba `ARS 2.000` porque los componentes de sobres no se suscribían al contexto de formato (`a23f4c5`, se agregó `useFormatRevision` a los siete).
  - **Hallazgos abiertos**: (a) `fn_reporte_patrimonio_neto`, que alimenta el TOTAL del Home, **sólo suma `p_billeteras`**: no suma los sobres, contradice la regla ratificada y hoy subestima el patrimonio en 3.650; requiere autorización para tocar la RPC. (b) Los mensajes con parámetros llegan sin interpolar: `{{billetera}}` y `{{saldo}}`. (c) Con una moneda sin billeteras el formulario de alta muestra un selector vacío en vez del aviso. (d) El porcentaje de avance difiere entre tarjeta y detalle (106,67% vs 107%; 0,4% vs 0%). (e) La página se colgó dos veces durante la auditoría, no reproducible al repetir con página nueva.
