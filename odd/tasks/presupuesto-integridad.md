# Presupuestos: integridad (etapas 0 y 1)

Aplica el plan aprobado en `docs/presupuesto/ORD_Presupuestos_plan_corregido.md` (versión 3.1).
Alcance de este documento: etapas 0 y 1. Las etapas 2 a 4 tienen su propio registro cuando empiecen.

## Specs

S1. «No prohibir saldos presupuestarios negativos. Los déficits de los padres son válidos y deben
arrastrarse. Lo que se prohíbe es transferir más dinero del efectivamente transferible o crear
asignaciones ficticias.»

S2. «Las transferencias desde arrastres positivos deben funcionar incluso si el padre no tiene una
asignación nueva en el ciclo. Un rechazo preventivo puede servir temporalmente, pero no es la solución
definitiva. Garantizar débito y crédito atómicos, con trazabilidad.»

S3. «Si un padre tiene subcategorías, los nuevos gastos deben imputarse a una subcategoría elegida. No
usar automáticamente la primera ni registrar silenciosamente en el padre. Los gastos históricos deben
seguir computándose.»

S4. «Al materializar un arrastre positivo para transferirlo, evitar sumarlo dos veces. Incorporar una
prueba que verifique el saldo antes y después de la transferencia.»

S5. «El arrastre es exclusivo de Base Cero. Las transferencias dependen del saldo presupuestario
positivo del padre, no de los techos de los hijos.»

S6. «Las transferencias deben conservar la suma de los saldos firmados del origen y destino, garantizar
débito y crédito atómicos y nunca modificar físicamente las billeteras. El saldo libre permanece
invariable cuando se transfiere entre padres sin déficit, pero puede aumentar cuando se cubre un
déficit anterior.»

S7. «Verificá además que los reintentos de una misma transferencia no dupliquen movimientos y que los
ajustes firmados sobre arrastres no generen doble contabilización en el reporte ni en el ciclo
siguiente.»

S8. Saldo libre: opción A, liquidez real. «El saldo libre para asignar parte del dinero real disponible
en las billeteras, descuenta las cuotas pendientes correspondientes al ciclo y las reservas
presupuestarias vigentes que todavía no fueron gastadas, evitando dobles descuentos.»

S9. «No desplegar parcialmente una etapa que produzca resultados incompatibles entre RPC, pantalla,
saldo libre, arrastre o historial. Verificar Base Cero y Libertad con el mismo rigor.»

## Tasks

- T1 · Espejos del módulo en línea con lo desplegado — hecho. 12 reescritos + el del archivado, que no
  existía. Copias previas en `temp_sql/900_espejos_previos/`.
- T2 · Estructura para la idempotencia — hecho y desplegado: columna `idempotency_key` e índice único
  `(user_id, idempotency_key, estructura_egreso_id)` en `p_presupuestos_historial`.
- T3 · `fn_crear_subcuenta_egreso` deja de mover el dinero del padre — hecho y desplegado.
- T4 · `fn_asignar_presupuesto` rechaza destino subcategoría y pierde el bloque de exclusividad — hecho
  y desplegado.
- T5 · `fn_transferir_entre_sobres` con débito comprobado, fila negativa, destino validado, idempotencia
  y las dos patas en el historial — hecho y desplegado.
- T6 · Pantalla: sin «Asignar» en subcategorías, mensaje propio en los tres idiomas, y la clave de
  operación enviada desde la transferencia — hecho en el repo, **sin publicar**.
- T7 · Prueba de integridad transaccional en `tests/sql/etapa1_integridad.sql` + runner — hecho, 6/6.

## Evidencia

`node tests/sql/run_etapa1_integridad.js` contra la base real, 6 de 6 casos, todo revertido:
asignar a un hijo rechazado sin mover nada · crear subcategoría deja el padre en 100.000 · transferir
30.000 a una categoría en −20.000 deja 20.000 y +10.000 con la suma en 30.000 y el libre subiendo
20.000 · el reintento con la misma clave no mueve · sin déficit el libre no cambia · el origen sin
fila queda en −10.000 y su disponible baja de 40.000 a 30.000.

## Log

- L1. «aprobado, implementa»
- L2. «si a los cambios en supabase»
- L3. Correcciones S1 a S7 sobre el plan v2, con la decisión S8 y la regla S9.
- L4. Pendiente para cerrar la etapa: publicar el front (decisión del dueño) y verificar en pantalla
  móvil que la fila de una subcategoría queda alineada sin el botón.
