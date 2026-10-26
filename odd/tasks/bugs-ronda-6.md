# Ronda 6 — el aporte suma valor, los retiros se listan, el donut respira

Tres correcciones sobre la misma pantalla de Inversiones: una de **datos** (el aporte
subía el capital pero no el valor, y eso fabricaba una pérdida), una de **lectura de
datos** (la lista de retiros, que hoy es un solo número agregado) y una **visual** (los
porcentajes del donut tocaban el anillo).

## Specs

**S1** — (dueño, ronda 6, captura del gráfico) "los por centajes en el Donut quedan pegados
al Donut y los debes separar un poquito del margen para que no toquen el color y se puedan
ver visualmente bien."

**S2** — (dueño, ronda 6, captura de la tarjeta) "cuando sumamos capital a una inversión,
como en el caso de XXX, que acabo de sumar 200.000, el current value debe actualizarse
sumando ese dinero ingresado al momento del ingreso. Y se debe volver a calcular el gain,
porque si no pasa como quedó ahora, que sumé 200.000 y el valor actual quedó en un millón
y me figura una pérdida, porque el valor actual no se ha actualizado solo. Eso lo debes
hacer inmediatamente, se carga el nuevo capital."

**S3** — (dueño, ronda 6, captura de la tarjeta) "en la inversión Bitcoin ... justo el
texto debajo de variable de capital original, lo que está entre paréntesis, incluye el
nombre de la moneda. Dice ARS 500.000 menos ARS 200.000 Withdrawal, lo cual el nombre de
la moneda es redundante, porque ya está el nombre de la moneda antes, cuando ponemos el
valor 300.000. Así que quita el nombre de la moneda de lo que está entre paréntesis. Y a
medida que se van haciendo retiros, tienen que irse sumando los retiros abajo de ARS
200.000, como una lista de retiros si hubiera más de uno."

**S4** — (dueño, 2026-10-26) "cuando yo borro desde actividad reciente un agregado de
dinero, eso debería modificar la inversión. Tal como lo hemos resuelto para las
liquidaciones parciales, también sería el mecanismo de borrar un error que ha agregado
dinero por error o lo he agregado mal. Entonces, de esa forma, borrando una actividad
reciente, me debe volver para atrás la operación. Fíjate por qué no lo hace."

## Tasks

| ID | Specs | Ruta | Commit |
| --- | --- | --- | --- |
| T1 | S2 | `fn_aportar_inversion` suma el aporte a `valor_mercado_actual` (migración 100) + despliegue | — |
| T2 | S2 | reparación de los aportes ya registrados sin compensar (una sola vez, en la 100) | — |
| T3 | S3 | `fn_retiros_inversiones()`: los retiros individuales salen de `p_caja` (migración 100) | — |
| T4 | S3 | desglose sin moneda repetida + lista de retiros bajo el capital (`InversionCard`, locales, CSS) | — |
| T5 | S1 | separación de los porcentajes del anillo (`DistribucionDonut`) | — |
| T6 | S1-S3 | tests de las tres reglas | — |

## Log

**L1** — pedido original de la ronda 6, verbatim (dos capturas):

> 1. C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-d7ee159c-fecf-4815-b212-7bec44659dd0.png
> A pesar de que usas Ego Browser, no pudiste ver que los por centajes en el Donut quedan
> pegados al Donut y los debes separar un poquito del margen para que no toquen el color y
> se puedan ver visualmente bien.
>
> 2. C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-cc7bc2e8-db2f-459f-9c39-51e7700a0d3c.png
> Esta imagen tiene dos correcciones para hacer. La primera es que cuando sumamos capital a
> una inversión, como en el caso de XXX, que acabo de sumar 200.000, el current value debe
> actualizarse sumando ese dinero ingresado al momento del ingreso. Y se debe volver a
> calcular el gain, porque si no pasa como quedó ahora, que sumé 200.000 y el valor actual
> quedó en un millón y me figura una pérdida, porque el valor actual no se ha actualizado
> solo. Eso lo debes hacer inmediatamente, se carga el nuevo capital.
> Además, vas a ver en esta imagen, en la inversión Bitcoin, que justo el texto debajo de
> variable de capital original, lo que está entre paréntesis, incluye el nombre de la
> moneda. Dice ARS 500.000 menos ARS 200.000 Withdrawal, lo cual el nombre de la moneda es
> redundante, porque ya está el nombre de la moneda antes, cuando ponemos el valor 300.000.
> Así que quita el nombre de la moneda de lo que está entre paréntesis. Y a medida que se
> van haciendo retiros, tienen que irse sumando los retiros abajo de ARS 200.000, como una
> lista de retiros si hubiera más de uno.

**L2** — estado de los datos al momento de empezar (verificado contra Supabase):

- Inversión **25 "Xxx"** (usuario 1): `monto_invertido_original = 1.200.000`,
  `valor_mercado_actual = 1.000.000`, `monto_liquidado = NULL`. El movimiento `p_caja`
  **5333** del 2026-10-26 es el aporte: `valor_egreso = 200.000`,
  `detalle = 'investment_contribution: Xxx'`, `metadata.es_aporte = true`. Ese aporte subió
  el capital y **nunca** el valor → ganancia −200.000 y el total del hero bajó a 1.370.000.
- Inversión **1 "Bitcoin"** (usuario 1): capital 600.000, valor 370.000,
  `monto_liquidado = 200.000`. El retiro es el movimiento **5254** del 2026-10-23,
  `valor_ingreso = 200.000`, `detalle = 'rescate_inversion: Bitcoin'`.
- Por eso la fuente de los retiros individuales es `p_caja` filtrado por
  `detalle LIKE 'rescate_inversion:%'`, que es la convención que ya usan las liquidaciones,
  en vez de inventar una tabla nueva.

**L3** — por qué no lo hacía (S4), verificado contra la base y el código:

- El único trigger de inversión sobre `p_caja` en el DELETE es
  `tr_anular_inversion_al_borrar_movimiento` → `fn_tr_anular_inversion_al_borrar_movimiento`
  (migración **86b**), y su cuerpo salía temprano con
  `IF OLD.detalle NOT LIKE 'investment_prefix:%' THEN RETURN OLD`.
- No era un olvido: la 86b lo dice en su comentario — "si el usuario borra un rescate o una
  liquidacion, no se toca la inversion (eso es otra decision, con otras consecuencias
  contables)". La decisión quedó tomada ahora.
- Las otras dos funciones que corren al borrar no tocan inversiones:
  `fn_t_limpiar_dependencias_caja` limpia cuotas de tarjeta y `fn_eliminar_movimiento_caja`
  sólo hace el `DELETE`.
- Consecuencia real: **tampoco** se revertían los retiros parciales. Borrar un rescate
  devolvía la plata a la billetera (lo hace `fn_actualizar_saldo_billetera_integral`, que sí
  es AFTER DELETE) pero dejaba `monto_liquidado` y `valor_mercado_actual` como estaban, así
  que la tarjeta seguía mostrando el retiro que el usuario acababa de borrar. El arreglo
  cubre las dos ramas por la misma razón.
- Verificación: la 105 se aplicó y se probó **simulando** el borrado en una transacción con
  `ROLLBACK` (inversión y movimientos de prueba, `session_replication_role = replica` para
  saltear las validaciones del INSERT y `origin` para que dispare el DELETE). Tres casos en
  verde: aporte (capital y valor vuelven a 1.000.000), retiro parcial (`monto_liquidado` a 0
  y valor de vuelta a 1.000.000) y retiro que había finalizado la inversión
  (`estado` a `activa`, `fecha_liquidacion` a NULL). Después: 0 filas de prueba y los datos
  reales sin cambios.
