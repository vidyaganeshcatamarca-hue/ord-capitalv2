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
| T1 | Modelo de datos en Supabase + migración legacy | S6-S11 | blocked: D1 |
| T2 | RPCs núcleo (crear/editar/listar/archivar/aportar/rescatar) | S6-S9, S14 | blocked: D1 |
| T3 | Integración presupuesto: reservas virtuales en `fn_obtener_saldo_a_asignar` | S8, DF-32 | blocked: D1 |
| T4 | RPC rendimiento + ingreso único en `p_caja` | S11 | blocked: D1 |
| T5 | UI completa + i18n es/en/pt | S6-S17 | pending |
| T6 | Cuota dinámica, semáforo 85/60, período inicial, reprogramación | S12 | pending |
| T7 | Orden manual por arrastre persistente | S15 | pending |
| T8 | Ciclo de vida y plan Free | S16 | pending |
| T9 | Notificaciones por infraestructura general | DF-30 | pending |
| T10 | Retiro de Cuenta Madre y transferencia entre sobres | S10, S9 | pending |

## Precisiones propuestas (§16, no aprobadas)

| # | Tema | Propuesta |
|---|---|---|
| 1 | Fecha sin meta | Grupo III del orden inicial, antes de "sin meta ni fecha"; muestra fecha y días restantes, sin cuota ni semáforo. |
| 2 | Moneda tras primer aporte | Bloqueada si el sobre tiene movimientos; permitida si saldo 0 y sin movimientos. |
| 3 | Cuota exacta | `meses = max(1, ceil(meses_calendario_restantes))`; `cuota = ceil(faltante / meses)` a 2 decimales; quincenal `cuota/2`, semanal `cuota/4.345`. |
| 4 | Ritmo ideal tras reprogramar | `esperado = base + (meta - base) * dias_transcurridos / dias_totales`, con `base` = saldo al replanificar. |
| 5 | Aviso "próxima a vencer" | 7 días antes; una sola notificación por (sobre, evento, fecha_objetivo). |
| 6 | Rendimiento nuevo en Free | Permitido: es dinero ya acreditado que el usuario conserva; bloquearlo rompe la trazabilidad del saldo real. |
| 7 | Edición histórica dependiente | No se puede bajar un aporte por debajo de lo ya rescatado de esa porción; error explícito. |
| 8 | Confirmación de archivado | Modal de confirmación explícita e irreversible. |
| 9 | Aporte inicial fallido | Todo o nada: una sola transacción; si falla, no se crea el sobre. |
| 10 | Inserción tras orden manual | El sobre nuevo se agrega al final del orden personalizado. |
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
