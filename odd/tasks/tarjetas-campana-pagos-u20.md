# Campaña de pruebas — pagos de tarjeta, usuario 20

> Trabajo grande, autorizado por el dueño el 2026-11-04. Se prueba contra un usuario
> **real** (20), no de sandbox: toda escritura se hace en transacción con ROLLBACK o se
> revierte con las funciones de borrado, y se verifica el estado final contra la línea base.
> Credenciales: las entregó el dueño; **no se copian a este archivo**.

## Specs

**S1 — Causa del pendiente de la ronda anterior.**
"busquemos la causa de lo que falta." → hallazgo **R-PG-11** del informe
`Personal/docs/varias/ajustes/bug-explorer-tarjetas-bx-full-tarjetas-20261102.md`.

**S2 — Pruebas reales sobre el usuario 20, desde navegador o base.**
"quiero que investigues puntualmente las siguientes operaciones con pruebas reales sobre el
User 20, pero desde Ego Browser, o si consideras mejor, desde Superbase directamente, o ambas."

**S3 — Pago mínimo y recálculo de cuotas.**
"Quiero que evalúes bien el mecanismo de pago mínimo, se rec alcula bien las cuotas".

**S4 — Banco distinto: el resumen real del banco no coincide con lo que dice la app.**
"quiero que lo mezcles también con la opción de que el banco es diferente, el valor del banco es
diferente al valor que se dice, que hagas pruebas con esto".

**S5 — Pagar de más con banco igual y con banco distinto; asignar a cuotas y cancelar cuotas futuras.**
"también que hagas pruebas con La opción de pagar de más con el valor del banco diferente e igual.
Asignarle a cuotas, cancelar cuotas futuras."

**S6 — Objetivo: romperlo.**
"quiero que hagas pruebas exhaustivas a ver si puedes romper el módulo y detectar bugs que aún no
se han detectado."

**S7 — Entorno de la campaña.**
"usa el perfil bug-explorer de ego-browser y el usuario 20, arielderenovsky@yahoo.com / clave:
<clave omitida por seguridad> (no es google, es login por mail)".

## Línea base del usuario 20 (medida 2026-11-04, antes de tocar nada)

| Dato | Valor |
|---|---|
| `user_id` / `auth_id` | 20 / `742e8a18-5d39-4f32-ac30-1d43f838c932` |
| Región | ARS, es, AR |
| Tarjetas | 953 MC BNA · 954 MC UALA · 955 AMEX · 956 NARANJA X · 957 VISA BNA |
| Cuotas impagas | 953: 31 (2.183.988,34) · 954: 4 (150.999,99) · 956: 6 (401.192) · 957: 1 (25.833,33) |
| Saldo a favor | 956: 95.152,43 · 957: 1.127.369,15 |
| Billeteras | 15; la que se usa para pagar es 1794 «lemon» (ARS 2.024.096); USD 1793 (832,74) |

## Tasks

| ID | Spec | Tarea | Estado |
|---|---|---|---|
| T1 | S1 | R-PG-11: causa técnica y confirmación en ejecución | hecho |
| T2 | S2 | Línea base del 20 y reglas de reversión | hecho |
| T3 | S2 | Abrir el perfil `bug-explorer`, login por mail como usuario 20, verificar identidad | pendiente |
| T4 | S3 | Pago mínimo: qué liquida, qué recalcula, qué refinancia | pendiente |
| T5 | S4 | Resumen real del banco **mayor** que el de la app | pendiente |
| T6 | S4 | Resumen real del banco **menor** que el de la app | pendiente |
| T7 | S5 | Pagar de más con banco igual | pendiente |
| T8 | S5 | Pagar de más con banco distinto (mayor y menor) | pendiente |
| T9 | S5 | Adelantar / asignar cuotas futuras | pendiente |
| T10 | S5 | Cancelar cuotas futuras | pendiente |
| T11 | S6 | Casos límite y de rotura (montos 0, negativos, texto, doble submit, favor insuficiente) | pendiente |
| T12 | S2 | Revertir todo y verificar contra la línea base | pendiente |
| T13 | — | Registro de hallazgos y cierre | pendiente |

## Log

**L1 (2026-11-04) — pedido del dueño, literal:** "busquemos la causa de lo que falta. Además,
quiero que investigues puntualmente las siguientes operaciones con pruebas reales sobre el User 20,
pero desde Ego Browser, o si consideras mejor, desde Superbase directamente, o ambas. Quiero que
evalúes bien el mecanismo de pago mínimo, se rec alcula bien las cuotas, quiero que lo mezcles
también con la opción de que el banco es diferente, el valor del banco es diferente al valor que se
dice, que hagas pruebas con esto, y también que hagas pruebas con La opción de pagar de más con el
valor del banco diferente e igual. Asignarle a cuotas, cancelar cuotas futuras. Bueno, todo este
tipo de trabajo quiero que hagas pruebas exhaustivas a ver si puedes romper el módulo y detectar
bugs que aún no se han detectado. usa el perfil bug-explorer de ego-browser y el usuario 20,
arielderenovsky@yahoo.com / clave: <clave omitida por seguridad> (no es google, es login por mail)"

**L2 (2026-11-04) — T1 cerrado.** Causa de R-PG-11 confirmada en ejecución sobre la tarjeta 957
(cuota 6519), en transacción revertida: con `p_cuotas_adelantar = [6519]` y el pago exacto de esa
cuota → `error_cuota_adelanto_invalida`; el mismo pago sin adelanto → aceptado y la cuota queda
`pagado = true`. La liquidación corre antes (línea 280) que la validación del adelanto (línea 348),
que exige `pagado = false`.

**L3 (2026-11-04) — T4 ejecutado y H1 abierto.** Pago real desde el modal de MC UALA (954),
«banco igual»: precarga ARS 34.333 (primera cuota), cuenta `lemon`, confirmado desde la UI.
Efectos verificados en la base: cuota 6472 liquidada; `p_caja` 17688 por 34.333,33 contra
`lemon` (2.024.096 → 1.989.762,67); sin saldo a favor. **Hallazgo H1:** el log del pago registra
`liquidado = 34333.333333333333`, `monto_total = 34333.33` y `refinanciado = 0.003333333333`, y
crea la **cuota 6884 por ARS 0,0033** con vencimiento 2026-12-07. El sobrante de tres milésimas
—que el usuario no puede escribir— se convierte en una cuota nueva. Revertido con
`fn_eliminar_pago_tarjeta_grupo(17688)` y verificado: caja borrada, cuota fantasma borrada,
6472 impaga, `lemon` exactamente 2.024.096,00, favor 0, log vacío.

**L4 (2026-11-04) — pedido del dueño, literal (reabre T5, escenario 2):**
"En este 2 me gustaría contemplar algo que no hemos contempl ado. Cuando yo pongo que la cuota del
banco es diferente, y p ongo un valor superior, debo exigir al usuario que pague ese valor. Por
ejemplo, si el gasto es de 35 y el valor real del banco es 40, y el usuario paga de las billeteras
35, no debo permitir que el sistema genere un pago mínimo por la diferencia de 5. ¿Se entiende? Debe
pagar el usuario sí o sí lo que pone en el monto del banco, en este caso los 40, y generar la
diferencia entre caja como lo está haciendo. Esto me parece que no está contemplado. La duda lo
chequeas con Ego Browser directamente desde la App. Siempre prueba en modo móvil. Te veo que estás
usando el modo PC."

**S8 — Regla nueva (derivada de L4).** Cuando el usuario declara un resumen real del banco, el pago
debe cubrir ese monto. Si declara más de lo que la app calcula, no se acepta un pago menor: la
diferencia contra caja se sigue generando, pero recién cuando el pago cubre lo declarado.

**L5 (2026-11-04) — verificado en móvil (390x844).** Con banco 40.000 y pago 34.333, el modal
muestra «You still owe ARS 5.667 of the actual statement. If you do not pay it now, it is recorded as
Card Difference» y el botón de confirmar se habilita al elegir la cuenta: hoy la app permite pagar
menos de lo declarado. El campo del banco acepta el valor tipeado con teclado real.

**L6 (2026-11-04) — entorno de pruebas local.** El dueño pidió probar todo en local (5173) y
sincronizar con producción al final. El 5173 lo sirve el worktree `Personal-3` (PIDs 6460 y 9652),
así que no tiene estos arreglos. Se levantó el dev server del worktree de trabajo (`Personal-2`) en
**http://localhost:5175**: mismo código que se está modificando, sin tocar el server del dueño.
