# Pago de resumen anterior: ventana anclada al ciclo y tope por pool

Sandbox QA `user_id = 20`, tarjeta MC BNA (`dia_cierre = 24`, `dia_vencimiento = 4`).
Bug de lógica de dinero en dos RPC de Supabase. Alto riesgo: item 1 (datos) e item 6 (sin test no hay red).

## Specs

- **S1.** El dueño reporta: *"cuando lo ejecuto me consume cuotas del mes de noviembre, cuando debería
  consumir solo las cuotas atrasadas del mes de octubre"*.
- **S2.** El dueño reporta: *"dejando la aplicación en un estado inconsistente, porque luego las cuotas
  de noviembre no se pueden pagar"*.
- **S3.** Tarjeta bajo análisis: *"Revisa exactamente la tarjeta en cuestión MC BNA"*. Para MC BNA el
  resumen impago es el que venció el `2026-10-04` (4 cuotas, `$440.666,67`) y el siguiente vence el
  `2026-11-04` (8 cuotas, `$594.109,17`).
- **S4.** Alcance autorizado: *"Arreglar el bug de pago (2 defectos, con tests)"* — (a) anclar la ventana
  al resumen que el usuario clickeó, (b) cortar la liquidación cuando se agota el pool.

## Tareas

| ID | Spec | Qué | Ruta | Commit |
|----|------|-----|------|--------|
| T1 | S1 | Anclar `v_prox_venc` a `CURRENT_DATE` (misma fórmula que `fn_reporte_vencimientos_tarjetas`), no a `p_fecha_pago` | Supabase `fn_registrar_pago_tarjeta_multi` · `temp_sql/108_*.sql` | `fix(tarjetas): anclar ventana...` |
| T2 | S2 | En ventana explícita, no marcar `pagado = true` más allá de `pool + saldo_a_favor`; el remanente queda impago y no se crea cuota sintética | Supabase `fn_liquidar_ciclo_tarjeta_multi` · `temp_sql/108_*.sql` | ídem |
| T3 | S1-S2 | Harness RED/GREEN transaccional: reporte y pago deben coincidir para 3 fechas de pago; prohibido `pagado` sin plata y prohibida cuota fantasma | `temp_sql/109_deploy_108.mjs` | ídem |
| T4 | — | Mapear tarjetas del clon por nombre + ciclo en vez de `row_number()` | Supabase `fn_clonar_usuario_admin` · `temp_sql/110_*.sql` | `fix(qa): mapear tarjetas...` |
| T5 | — | Re-clonar 30→20 y verificar que MC BNA conserva sus 34 cuotas con ciclo 24/4 | `tests/admin/clone_user.py` | ídem |

## Log

- **L1** (dueño, verbatim): *"Quiero que trabajes sobre el usuario 20 y te fijes e intentes detectar un bug
  que hay en el pago atrasado de la tarjeta, ya que cuando lo ejecuto me consume cuotas del mes de
  noviembre, cuando debería consumir solo las cuotas atrasadas del mes de octubre. Chequea bien las
  cuotas atrasadas a que ciclo pertenecen, por qué consume las cuotas de noviembre dejando la aplicación
  en un estado inconsistente, porque luego las cuotas de noviembre no se pueden pagar. Revisa
  exactamente la tarjeta en cuestión MC BNA"*
- **L2** (evidencia, experimento con ROLLBACK sobre user 20 / tarjeta 825 con ciclo forzado 24/4):
  `objetivo='anterior'` + `p_fecha_pago = 2026-10-28` → solo octubre (correcto).
  `objetivo='anterior'` + `p_fecha_pago = 2026-11-05` → octubre **+ las 8 de noviembre**, `liquidado =
  1.034.775,83`, `refinanciado = 594.109,16`, cuota sintética nueva al `2026-12-04`.
  `objetivo = NULL` (legacy) → idéntico a la fecha futura.
- **L3** (hallazgo colateral, bloquea el repro): `fn_clonar_usuario_admin` arma `_map_tarjetas` con
  `JOIN row_number() OVER (ORDER BY tarjeta_id)`. El `INSERT INTO p_tarjetas_credito` no tiene `ORDER BY`,
  así que 4 de 5 tarjetas quedaron cruzadas (AMEX→MC BNA, MC BNA→MC UALA, VISA BNA→AMEX, MC UALA→VISA
  BNA). Las 34 cuotas de MC BNA viven hoy en la tarjeta `825` con el ciclo de UALA (30/7).
- **L4** (dueño, verbatim): *"y luego el clon"* — el arreglo del clon va después del de pago.
- **L5** (evidencia, clon): `fn_clonar_usuario_admin` no era re-ejecutable. El trigger
  `fn_tr_bloquear_borrado_categoria_inversion` rechaza borrar categorías con
  `tipo_cupo = 'investment'`, y el primer clon copia `cat_investments_portfolio` del origen al
  destino: todo re-clon posterior moría con `error_category_system_locked`. Arreglado en la 110
  (fase de borrado con `session_replication_role = replica`, y vuelta a `origin`).
- **L6** (verificación, 2026-10-28): `111_deploy_110.mjs` RED (`error_category_system_locked`) →
  GREEN (B1-B3: cada tarjeta del destino con las cuotas de su par, MC BNA con 34, 69 cuotas en total).
  Re-clon real `audit_id=492`, `deletes=572 inserts=572`. Estado final de MC BNA: tarjeta `834`,
  ciclo 24/4, **34 cuotas / 34 impagas / 7 compromisos**, idéntica a la `5` del origen.
- **L7** (verificación final sobre la tarjeta real `834`, experimento con ROLLBACK): el escenario
  reportado, `objetivo='anterior'` con fecha de pago `2026-11-05`, consume **solo** las 4 cuotas del
  `2026-10-04` ($440.666,67), `refinanciado = 0` y sin cuota fantasma. Antes consumía
  $1.034.775,83 y dejaba la cuota fantasma de $594.109,16.
- **L8** (riesgo residual, no autorizado): el camino legacy (`p_objetivo = NULL`) conserva el
  comportamiento anterior a propósito (guarda A7). El frontend siempre manda objetivo, pero
  cualquier llamador nuevo que lo omita vuelve a comerse el ciclo siguiente. `fn_liquidar_ciclo_tarjeta`
  (la variante legacy que invoca el trigger de `p_caja`) tiene el mismo problema y no se tocó.
- **L9** (verificación independiente de la 108/110, `gentle-ai-verify`): cuatro hallazgos, tres causados
  por el tope por pool de la 108. (a) ALTA: con `p_resumen_real` el sobrante no aplicado no se acreditaba
  y el dinero desaparecía (repro: resumen 440.666,67, pago 300.000 → 87.333,33 evaporados). (b) La
  «Diferencia Tarjeta» contaba como gasto la deuda que seguía viva como cuota. (c) El `CONTINUE` del
  tope salteaba la cuota más cara y pagaba las baratas posteriores (FIFO invertido, subconjunto no
  determinístico). (d) Cada cuota pagada cerraba el mes entero en `p_compromisos_tarjeta`. Más: la
  excepción de triggers de la 110 apagaba también las cascadas (`p_pagos_tarjeta_log` quedaba huérfana),
  y el harness 109 tenía ids hardcodeados que el re-clon invalidó.
- **L10** (ronda 2, 112 + 113 + 114): corregidos los cuatro puntos y acotada la excepción de triggers a
  `p_estructuras_egresos`. `114_deploy_112_113.mjs` corre 8 casos con la tarjeta y la billetera resueltas
  por identidad (no por id): RED confirmado en P3 (87.333,33 perdidos), GREEN 8/8 después, incluida la
  guarda de FIFO, la de compromisos y la de huérfanas del clon. **RED de P2 y P4 no quedó registrado**:
  los tests estaban mal escritos en la primera pasada (tipo `numeric` para una fecha, y un fixture que
  el clon ya traía resuelto) y se corrigieron después de aplicar la 112; lo que se observó de FIFO fue
  la simulación de la verificación, no una ejecución del harness viejo. `109` se borra: lo reemplaza el 114.
- **L11** (límites conocidos, no verificados en ejecución): (a) tarjetas con `dia_vencimiento` NULL caen
  al camino legacy y recuperan el bug (el reporte tampoco las lista); (b) el límite inferior de la
  ventana «anterior» sigue viniendo de `p_fecha_pago`, y hoy lo tapa el clamp `v_min_fecha` — con mora
  de dos meses y una fecha de pago vieja podría pagar el resumen equivocado; (c) el tope es por moneda
  sin conversión cruzada: un pago de un resumen ARS con `target_moneda_cuota = 'USD'` no paga nada y
  todo queda a favor (el sandbox no tiene ninguna cuota USD, así que ningún test lo cubre); (d) dos
  tarjetas homónimas del mismo ciclo se emparejan por `row_number` y podrían cruzarse igual.
