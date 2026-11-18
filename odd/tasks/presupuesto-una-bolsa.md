# Presupuestos: una sola bolsa (etapa 2)

Continúa `presupuesto-integridad.md` (etapas 0 y 1, cerradas). Aplica el plan aprobado
`docs/presupuesto/ORD_Presupuestos_plan_corregido.md`, versión 3.1, etapa 2.

## Specs

S10. «Los hijos nunca manejan plata, nunca tienen asignaciones y solo las asignaciones las tiene el
padre. Los hijos pueden gastar de la cuota del padre, pueden tener límites en ese gasto, que son
techos, pero siempre manejan la plata del padre y nunca manejan su propia plata.»

S11. «El padre no puede estar en positivo si el hijo tiene arrastre, eso está mal.»

S12. «arrastre negativo es deuda, por lo tanto no se puede transferir a otro sobre. arrastre positivo
es dinero, se puede transferir.» «el arrastre del mes anterior se suma al asignado este mes.»

S13. «Las transferencias dependen del saldo presupuestario positivo del padre, no de los techos de los
hijos.»

S14. «Las transferencias deben conservar la suma de los saldos firmados del origen y destino […]
El saldo libre permanece invariable cuando se transfiere entre padres sin déficit, pero puede aumentar
cuando se cubre un déficit anterior.»

S15. «Si un padre tiene subcategorías, los nuevos gastos deben imputarse a una subcategoría elegida […]
Los gastos históricos deben seguir computándose.»

S16. Saldo libre: liquidez real. «descuenta las cuotas pendientes correspondientes al ciclo y las
reservas presupuestarias vigentes que todavía no fueron gastadas, evitando dobles descuentos.»

S17. «No desplegar parcialmente una etapa que produzca resultados incompatibles entre RPC, pantalla,
saldo libre, arrastre o historial. Verificar Base Cero y Libertad con el mismo rigor.»

## Qué se construye

1. **Una sola definición de la bolsa del padre:** lo que arrastra, con su signo, más lo asignado, menos
   lo gastado por el grupo —incluido lo gastado en el padre mismo—. Sin piso artificial por fila.
2. **La subcategoría pierde plata y arrastre propios.** Su arrastre sube al padre: deja de poder estar
   en positivo mientras un hijo arrastra deuda.
3. **La lista de orígenes** ofrece solo padres y categorías sueltas, y solo con saldo positivo.
4. **La validación de transferencia** usa esa misma bolsa. Se retiran las dos validaciones que existen
   porque hoy hay plata en dos lugares: «no entra en el techo repartido» y «no podés bajar del
   repartido».
5. **Se retiran las fórmulas duplicadas:** hoy conviven cuatro definiciones de «libre» y dos de
   «disponible». Queda una de cada una y la pantalla lee esa.
6. **La conciliación del saldo libre** se verifica con una identidad: lo libre más lo que resta por
   gastar en cada categoría da el dinero de las billeteras.

## Tasks

- T20 · `fn_disponibles_transferibles` — filtro padres/sueltas y saldo positivo, con la definición única.
- T21 · `fn_disponible_transferible` — la misma bolsa, sin piso por fila, arrastre solo en base cero.
- T22 · `fn_reporte_sobres_detalle` — fila del padre = bolsa del grupo; fila del hijo sin plata propia.
- T23 · `fn_transferir_entre_sobres` — fuera las dos validaciones de techo; usa la bolsa del padre.
- T24 · `fn_obtener_saldo_a_asignar` — la identidad de conciliación; sin doble descuento de tarjeta.
- T25 · Pantalla: una sola función de disponible, orígenes solo padres, etiquetas coherentes.
- T26 · Prueba transaccional nueva: bolsa del padre, origen hijo rechazado, identidad del libre en las
  cuatro operaciones, los dos modos.
- T27 · Recorrido en móvil 390x844 en Base 0 y en Libertad, con capturas — en curso.

## Hecho

- T20 a T24 desplegados y verificados: `fn_disponible_transferible` (bolsa del grupo, sin piso,
  arrastre solo en base cero), `fn_disponibles_transferibles` (solo padres o sueltos, solo positivos),
  `fn_reporte_sobres_detalle` (padre = bolsa, con su gasto propio y el arrastre con signo; la
  subcategoría sin plata ni arrastre propios y sin contar en los totales).
- T26 escrito y verde: `tests/sql/etapa2_bolsa.sql`, 5 de 5. El runner de `tests/sql` ahora acepta el
  archivo por parámetro.
- Números del padre Alimentos-Hogar tras la etapa: plata 106.246 + arrastre 472.905 = asignado
  579.151; gastado del grupo 381.251; bolsa disponible 197.900,5. La lista de transferencias pasó de
  37 orígenes (23 hijos, 31 sin saldo) a 4 orígenes reales.
- El reporte antes ignoraba el gasto imputado al padre mismo: ahora lo suma.
- `cuenta_en_totales` ya no depende de si el padre tiene plata: la subcategoría no cuenta nunca. Así
  cada grupo aporta exactamente una fila y el saldo libre no puede contar dos veces.

## Log

- L5. «No vamos a publicar nada hasta que no termines todas las etapas planificadas, recién ahí vamos a
  publicar, no te preocupes por lo que queda de pasado en producción, ocúpate de terminar tu tarea y de
  hacer las pruebas correctas para que todo quede pipí, cucú.»
