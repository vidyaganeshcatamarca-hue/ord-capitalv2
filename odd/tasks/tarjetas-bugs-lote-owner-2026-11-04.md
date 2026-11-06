# Tarjetas y categorías — lote de bugs del dueño (2026-11-04)

Documento de especificación para este lote. Se lee hasta `## Log`.
Contexto del módulo: `odd/tasks/traspaso-campana-tarjetas-2026-11-04.md` §8 y §9.
Campaña de escenarios en curso: `odd/tasks/tarjetas-campana-pagos-u20.md`.

Regla de lectura de evidencia: **cada captura se lee al comenzar su tarea**, nunca en lote.

## Specs

**S1** — «En el usuario 1, la subcategoría combustible aparece de dos formas diferentes en el resumen
de las fotos. A veces aparece como combustible y a veces aparece como transporte combustible. Lo
correcto es transporte combustible porque es el nombre del padre y del hijo. Pero no sé por qué, a
veces lo pone de una forma y a veces lo pone de otra forma.»
Evidencia: `pi-clipboard-e8e1e23f-4364-495f-bea3-4048804cf302.png`

**S2** — «La comparativa entre tarjetas no muestra las barras ni la información. Antes funcionaba
algo, tocaste.»
Evidencia: `pi-clipboard-4591c286-47c0-45bc-a304-895c494190c6.png`

**S3** — «En la pantalla de pago, fíjate que no tenemos la flecha para volver para atrás, el icono de
arriba a la izquierda funciona como el back para volver, pero debería ser una flecha. (pagar tarjeta
vencida). Controlá pago normal también.»
Evidencia: `pi-clipboard-d48e7561-8d98-4270-92da-ef9f6cc1cd7e.png`

**S4** — «La selección de los botones tarjeta y comparación: el botón elegido debería tener el color
verde de fondo habitual de los botones.»
Evidencia: `pi-clipboard-1c200464-77f1-4b8f-a25d-22106714aed1.png`

**S5** — «Cuando entro al resumen de la tarjeta, arranca el scroll de la posición de la última
pantalla. Cuando entro al resumen, debería arrancar el scroll desde arriba. Pero no, arranca en la
posición de la última pantalla. Corregí.»
Evidencia: `pi-clipboard-8e91ebd4-35f2-4e3c-8aeb-93f8257a64a5.png`

**S6** — «Cuando tengo un pago en dólares, me sugiere el pago en dólares. Si paso a la moneda local,
dentro del pago en dólares, me calcula bien el monto en moneda local, pero si vuelvo a dólares, ya no
vuelve la sugerencia a dólares, queda el pago local. Y otra cosa es el signo de la moneda, está mal
trabajar codeada en pesos, no está tomando el símbolo de la moneda local. Esto es user 198, libra
inglesa.»
Evidencia: `pi-clipboard-3886e151-437a-4646-8f39-0a6f5fa4c9e3.png`

**S7** — «Como usuario 198, un pago en dólares y otro en moneda local. A pesar de estar completando
bien todos los gastos, me da una diferencia en el mensaje, como si estuviera pagando algo de más. No
está haciendo bien los cálculos.»
Evidencia: `pi-clipboard-d2ef99b7-16e1-43d7-84bd-981fe4cabe18.png`

**S8** — «Este mensaje que está marcado ahí no tiene ningún sentido. No sé por qué está o si es un
error o qué pasa.»
Evidencia: `pi-clipboard-4c5831e4-1623-4536-aea2-996ff6c0731d.png`

**S9** — «Si selecciono la moneda, la billetera de efectivo para pagar en la moneda local, cuando
quiero pagar con moneda local la cuenta en dólares, ya no me muestra la cuenta de efectivo, pero me la
debería mostrar porque puedo pagar también con la misma cuenta.»
Evidencia: `pi-clipboard-8b529f34-3a7e-4616-9746-b496771dc1e5.png`

**S10** — «Mismo usuario, 198: pago y dejo un excedente, quiero aplicar el excedente a cuotas, elijo
la cuota y me dice que el excedente no alcanza.»
Evidencia: `pi-clipboard-c94dca73-eb53-4c63-b350-d6cb59ab5863.png`

**S11** — «La moneda en dólares tiene todos los decimales; debería tener los decimales solo de la
moneda en dólares, la regional y el seleccionado.»
Evidencia: `pi-clipboard-d315f6c9-6f6e-4cb9-8694-3b182717cb6e.png`

**S12** — «Usuario 1, fíjate el saldo de favor y el estimado a pagar. Y qué pasa cuando le doy a pagar
resumen en la segunda imagen: cambian todos los valores. Acá tenemos un problema: hay una cuota vencida
el 10 de noviembre y las otras vencen el 25 de noviembre. Se ve que se ha cambiado la fecha de cierre o
algo parecido, pero ha quedado todo desconfigurado. Hay que revisar bien el VAD para encontrar el
error. Si son de diferentes ciclos, deberían separarse; y si la metemos dentro del mismo ciclo,
deberían unificarse. También fíjate que dice próxima cuota 50 dólares, pero el estimado no coincide.
Pasa que esa cuota que quedó desfasada son justo 50 dólares. Hay algo ahí mal también en el cálculo de
la próxima cuota, o sea, el próximo resumen.»
Evidencia: `pi-clipboard-b851058f-6825-42ce-b9bd-9eea7d045eec.png` y
`pi-clipboard-b8f1468b-54a5-4772-9c6f-38a51b719ccc.png`

**S13 — modelo del pago de resumen (contexto que gobierna todas las tareas de este lote)**:
«Tenemos las variables jugando en el pago del resumen. Tenemos la variable del monto a favor, si
llegamos a tener algo. Tenemos la sugerencia de lo que hay que pagar en la moneda local. La selección
de multi-cuenta, podemos pagar de varias cuentas, de varias billeteras. Después tenemos la selección
de pago en moneda dólar, que la puedo pagar en moneda dólar, si tengo billetera, o la puedo pagar en
moneda local, con las conversiones adecuadas que eso requiere. Luego tenemos el modal de si el resumen
del banco es distinto o no, y todo lo que habíamos definido ya para cuando el modal sea distinto.
Puedo pagar de menos o de más, puedo pagar un monto mínimo, puedo pagar un excedente, y que ese
excedente se aplique a que quede saldo a favor o que se cancelen cuotas futuras. Toda esa complejidad
tiene que ser resuelta desde el módulo de tarjetas, en perfectas condiciones, sin bugs.»

## Tasks

**S14 — eliminación del recargo del 30 % en compras en dólares.** Ya no corre más; hay que quitarlo de
todos lados.

| ID | Spec | Qué | Estado |
|---|---|---|---|
| T13 | S14 | Cliente: quitar el default `?? 30` y dejar el recargo en 0 | pendiente |
| T14 | S14 | i18n: retirar las claves del recargo en es/en/pt | pendiente |
| T15 | S14 | Base: dejar de aplicar y de devolver el recargo en las 9 funciones | pendiente |
| T16 | S14 | Base: eliminar las columnas `recargo_dolar_pct` de `p_tarjetas_credito` y `p_pagos_tarjeta_log` | pendiente |

| ID | Spec | Qué | Evidencia | Estado |
|---|---|---|---|---|
| T1 | S1 | Nombre compuesto de subcategoría consistente en el resumen de fotos (usuario 1) | imagen 1 | pendiente |
| T2 | S2 | Restaurar barras y datos de la comparativa de tarjetas | imagen 2 | pendiente |
| T3 | S3 | Flecha de volver en la pantalla de pago (vencida y normal) | imagen 3 | pendiente |
| T4 | S4 | Tab activo con el verde de fondo habitual | imagen 4 | pendiente |
| T5 | S5 | Scroll desde arriba al entrar al resumen de la tarjeta | imagen 5 | pendiente |
| T6 | S6 | Volver a USD restaura la sugerencia; símbolo de moneda local (no pesos fijos) | imagen 6 | pendiente |
| T7 | S7 | Diferencia falsa con pago mixto USD + moneda local (usuario 198) | imagen 7 | pendiente |
| T8 | S8 | Mensaje sin sentido en el modal de pago | imagen 8 | pendiente |
| T9 | S9 | La billetera de efectivo debe ofrecerse también para pagar el tramo USD en local | imagen 9 | pendiente |
| T10 | S10 | El excedente debe alcanzar para la cuota elegida (usuario 198) | imagen 10 | pendiente |
| T11 | S11 | Decimales de USD correctos | imagen 11 | pendiente |
| T12 | S12 | Ciclos distintos separados / mismo ciclo unificado; próxima cuota y estimado coherentes (usuario 1) | imágenes 12a y 12b | pendiente |

## Log

**L1** (pedido del dueño, 2026-11-04): «Mientras seguimos avanzando con los escenarios, te voy a
pasar un popurrí de bugs que he encontrado y te voy a pasar también una explicación genérica para que
asumas nuestro entendimiento sobre el nuevo parque. Debemos dejarlo pipí, cucú.» + los 12 bugs con sus
capturas y el resumen del modelo (S13). Cierre: «Quiero que ahora revises los bugs que te he pasado, te
concentres en resolverlos. Y luego de resolver todo esto, seguimos con la prueba de los escenarios.
Pero, mientras tanto, si un bug toca un escenario puntual, lo abordas completamente para resolverlo.
Organiza bien la planificación de cómo lo harás. Quiero que quede el módulo completo y saneado.»

**L2** (pedido del dueño, 2026-11-05): «30% de impuestos sobre compras en dólares ya no corre más hay
que eliminarlo de todos lados». Superficie medida: 9 funciones (`fn_clonar_usuario_admin`,
`fn_crear_tarjeta_credito`, `fn_editar_tarjeta_credito`, `fn_gestionar_compra_cuotas`,
`fn_liquidar_ciclo_tarjeta_multi`, `fn_registrar_gasto_tarjeta`, `fn_registrar_pago_tarjeta_multi`,
`fn_reporte_mapa_tarjetas`, `fn_reporte_simulador_impacto`), 2 columnas
(`p_tarjetas_credito.recargo_dolar_pct`, `p_pagos_tarjeta_log.recargo_dolar_pct`) y en el cliente el
default literal `Number(targetCard?.recargo_dolar_pct ?? 30)` en `TarjetasPage.tsx:2484` más las claves
i18n del formulario en es/en/pt.
