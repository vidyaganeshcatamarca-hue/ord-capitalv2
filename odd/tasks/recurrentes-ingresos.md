# Recurrentes de ingreso

Extiende el módulo de recurrentes para que también genere **ingresos**, con el mismo motor
de calendario, la misma cuarentena y la misma pantalla. Egresos no cambia de comportamiento.

## Specs

- **S1.** Se **extiende** `p_gastos_recurrentes`, no se crea una tabla nueva.
  > "a) extiende"
- **S2.** Toda ocurrencia de ingreso **pasa por cuarentena siempre**: no entra directo a la caja.
  > "b) pasa por cuarentena siempre"
- **S3.** Se usa **la misma pantalla**, con las dos pestañas que ya existen (Egresos / Ingresos).
  > "c) misma pantalla, la misma ya tienen dos botones, una de de egresos y otra de ingresos"
- **S4.** La **fuente de ingreso es opcional**, igual que en la carga manual de un ingreso.
  > "d) opcional, tal cual la carga manual"
- **S5.** Mismos patrones y mismas reglas que egresos: motor por usuario al abrir la app,
  puntero `proxima_ocurrencia`, pausa = "no lo generes", borrado, índice único
  `(recurrente_id, fecha)` en `p_caja_cuarentena`.
  > "quiero que continúes con la implementación de ingresos siguiendo exactamente los mismos
  > patrones que en ingresos Las mismas reglas"
- **S6.** La tarjeta del recurrente muestra la **moneda en iniciales** junto al monto. Para un
  ingreso la moneda es la de la billetera destino.
  > "Yo quiero ver en qué moneda está con las iniciales de la moneda."

## Tasks

| ID | Specs | Ruta | Detalle |
|----|-------|------|---------|
| T1 | S1, S4 | SQL 82 | Columnas `naturaleza`, `estructura_ingreso_id`, `billetera_destino_id` + CHECK de exclusión |
| T2 | S1, S5 | SQL 82 | `fn_crear_gasto_recurrente`, `fn_editar_gasto_recurrente`, `fn_listar_gastos_recurrentes` |
| T3 | S2, S5 | SQL 82 | `fn_generar_recurrentes_usuario` inserta la ocurrencia de ingreso con `tipo='income'` |
| T4 | S1, S3 | Front | Tipo `GastoRecurrenteRow` con naturaleza; hook manda los campos nuevos |
| T5 | S3, S6 | Front | Pestaña Ingresos; tarjeta con moneda e iconos de la fuente de ingreso |
| T6 | S1, S4 | Front | Modal: selector de fuente de ingreso y billetera destino cuando es ingreso |
| T7 | S2, S5 | Pruebas | Smoke SQL transaccional (crear, editar, generar, deduplicar, aislar usuarios) |
| T8 | S2, S3 | Pruebas | Recorrido en ego 360×844: alta de ingreso, aparición en cuarentena, aprobación, borrado |

## Log

- **L1.** Pedido original, textual:
  > "3. Entiendo que todas las RPC, que son 7, aparentemente ya están preparadas para recibir un
  > recurrente de ingresos De ser así, quiero que continúes con la implementación de ingresos
  > siguiendo exactamente los mismos patrones que en ingresos Las mismas reglas, quiero decir
  > Desarrolla el módulo faltante de recurrentes ingresantes . Hazme las preguntas necesarias
  > para que te aclare tus dudas"
- **L2.** Verificación previa: la premisa era falsa. Las RPC de recurrentes son solo de egreso
  (`p_estructura_egreso_id`, `p_billetera_defecto_id`, `p_tarjeta_id`) y la tabla no tenía
  columnas de ingreso. Lo reutilizable es el calendario: `fn_recurrente_proxima_ocurrencia` y
  el puntero no saben de dinero.
- **L3.** Decisiones del dueño: extender (S1), cuarentena siempre (S2), misma pantalla (S3),
  fuente opcional (S4).
- **L4.** "dale" = autorización del esquema presentado (columnas nuevas, cuarentena intacta,
  RPC con parámetros al final y con default para no romper el bundle viejo durante el deploy).
- **L5.** Supuesto declarado y no objetado: la **billetera destino es obligatoria** en un
  ingreso, igual que el egreso exige billetera de origen.
- **L6.** Implementado y verificado. Commits: `2fb33ae` (esquema, RPC, motor, documento) y
  `3ac40bd` (pestaña, modal, tarjeta, motor al guardar).
- **L7.** Evidencia de las pruebas:
  - Smoke transaccional del 82 (`temp_sql/82`), 13 aserciones en PASS: alta de ingreso, fila
    con naturaleza/origen correctos, rechazo de ingreso sin billetera destino, de ingreso con
    categoría de egreso, de egreso con fuente de ingreso y de billetera inexistente,
    generación de la ocurrencia con `tipo='income'`, no duplicación al correr el motor dos
    veces, aprobación que crea el movimiento de ingreso y **suma el saldo** en la billetera
    destino, edición de monto/días/fuente/destino, compatibilidad con el bundle viejo (sin
    `p_naturaleza` no se degrada el ingreso a egreso), listado con naturaleza y moneda, y
    aislamiento entre usuarios. La transacción terminó en `RAISE EXCEPTION`, así que la base
    quedó intacta.
  - Recorrido en ego (perfil Vidya, 360×844): alta de un ingreso mensual (fuente «Avisos»,
    1.234, billetera Paypal Ar) → tarjeta en la pestaña Ingresos con «1,234 ARS · días 4» →
    ocurrencia pendiente detectada en la tarjeta → borrado con confirmación propia del
    ingreso. Todo el dato de prueba se borró: el usuario 1 volvió a sus 5 egresos, la bandeja
    quedó sin pendientes y no se creó ningún movimiento.
- **L8.** Lo que NO se verificó por UI y por qué: la **aprobación** del ingreso se probó solo
  en SQL transaccional. Aprobar por la bandeja mueve el saldo real de una billetera del dueño,
  así que la prueba quedó del lado de la base con rollback; el camino que dispara la UI es la
  misma RPC `fn_aprobar_cuarentena_v2(pendiente_id)`.
