# Préstamos y Saneamiento — reconstrucción

Objetivo: implementar el PRD funcional aprobado `Personal/docs/deudas/Prestamos-Saneamiento.md` (v1.0, 2026-11-13).
Rama: `feat/prestamos-saneamiento-rebuild`, creada desde `origin/produccion` @ `c592f68`.
Estado: planificación cerrada. Sin cambios de base de datos ejecutados.

## Specs

Fuente normativa: `docs/deudas/Prestamos-Saneamiento.md`. Los tres PRD de diagnóstico
(`saneamiento.md`, `prd-saneamiento.md`, `prd-deudas.md`) son evidencia del estado
previo, no requisitos.

- **S1 · Navegación.** `Préstamos` es pantalla principal independiente con cinco
  secciones: `Debo`, `Me deben`, `Saneamiento`, `Calendario`, `Pareja`.
  «Saneamiento» **no es** pantalla principal independiente: es una sección de
  Préstamos centrada en el ataque de deudas. «Calendario» es sección **hermana**, no
  subapartado de Saneamiento. **Bandeja de Cuarentena queda fuera** de Préstamos.
  Ruta objetivo `/prestamos` (P27), conservando compatibilidad con enlaces existentes.

- **S2 · Universo del Plan de Ataque.** El Plan de Ataque utiliza **únicamente los
  préstamos pendientes de la sección «Debo»**. Se excluyen: préstamos que «Me deben»,
  tarjetas de crédito, gastos recurrentes y préstamos saldados.

- **S3 · Un préstamo no se compensa.** No restar «Me deben» de «Debo». Los importes de
  monedas distintas no se suman nominalmente.

- **S4 · Alta de préstamo nuevo.** Registrar simultáneamente: el préstamo, su dirección,
  contraparte, moneda, importe originalmente acordado y saldo pendiente inicial; las
  condiciones conocidas; y el movimiento de fondos real. La recepción o entrega inicial
  **no es un segundo movimiento añadido al mismo dinero**.

- **S5 · Alta de préstamo histórico.** Solicitar el **importe original** y el **saldo
  pendiente actual**. No volver a registrar una entrada o salida de dinero que ocurrió
  en el pasado. No presentar pagos previos inferidos como operaciones reales.

- **S6 · Modalidades.** Cuotas con fechas, pago único con fecha, o devolución libre sin
  fechas. Se admiten pagos y cobros parciales en todas las modalidades.

- **S7 · Estados.** **al día**, **próximo a vencer**, **vencido**, **saldado**. Sin fecha
  de vencimiento acordada, no adjudicar automáticamente el estado «vencido». Registrar
  un pago parcial no elimina la condición de atraso si sigue pendiente un importe
  exigible vencido. Cuando el **saldo pendiente total llega a cero**, marcar **Saldado
  automáticamente**.

- **S8 · Eliminación del historial.** El usuario **puede eliminar del historial** un
  préstamo saldado, previa confirmación. La eliminación **no debe borrar ni revertir
  movimientos de fondos reales** ya contabilizados en billeteras.

- **S9 · Aplicación libre de pagos.** No exigir asociación exacta del movimiento con una
  cuota: los movimientos se aplican libremente al **saldo pendiente total**.

- **S10 · Sobrepago en «Debo».** Si el importe supera el saldo total pendiente: mostrar
  la diferencia y pedir **confirmación explícita** de que se registrará como **intereses
  del préstamo no registrados anteriormente**. Si el usuario cancela, **no registrar** el
  pago tal como fue ingresado. Si confirma, aplicar el saldo pendiente para saldar el
  préstamo y registrar el excedente como intereses pagados. Registrar **un solo egreso
  por el importe total** y un solo débito de billetera.
  Ejemplo aprobado: deuda pendiente de $80.000; pago de $100.000 → se cancelan $80.000
  de saldo y se reconocen $20.000 como intereses adicionales pagados; egreso total
  «Deudas» y movimiento de billetera = $100.000; estado final «Saldado».
  Este mecanismo **no debe utilizar un saldo negativo ficticio**.

- **S11 · Corrección de operaciones.** El usuario puede editar una operación de
  pago/cobro original que se haya registrado incorrectamente. Deben actualizarse de forma
  consistente tanto la billetera como el saldo del préstamo y la identificación de
  intereses, preservando una trazabilidad interna de la corrección. Cambiar condiciones
  de un préstamo no altera retroactivamente los pagos y cobros reales ya registrados.
  Si una corrección deja pendiente un préstamo anteriormente saldado, ORD actualiza su
  estado y lo vuelve a mostrar donde corresponda.

- **S12 · Matriz contable.** Recibo préstamo nuevo («Debo») → **Ingreso**: «Ingreso x
  préstamo recibido». Devuelvo préstamo recibido → **Egreso íntegro**: «Deudas». Otorgo
  préstamo nuevo («Me deben») → **Egreso**: «Préstamos otorgados». Me devuelven préstamo
  otorgado → **Ingreso**: «Cobro de préstamos». Incorporo préstamo histórico → **Ningún
  ingreso/egreso nuevo**. Corrijo una operación existente → Recalcular operación
  original, sin duplicar ingreso/egreso.

- **S13 · Categoría «Deudas».** La categoría única de egreso «Deudas» se crea
  automáticamente al registrar la primera deuda de la clase «Debo». Todo pago de deuda
  recibido, incluido capital e intereses, utiliza **esa única categoría**. No crear
  categorías separadas de gasto por principal/intereses. Usar su identidad sin
  coincidencias vagas.

- **S14 · Nombres exactos.** «Ingreso x préstamo recibido», «Deudas», «Préstamos
  otorgados», «Cobro de préstamos». Reutilizar los existentes, evitando duplicados por
  nombre o creación paralela.

- **S15 · Multimoneda.** Cada préstamo mantiene su saldo en la moneda propia del
  préstamo. Se admiten operaciones desde billeteras de otra moneda. El usuario identifica
  por separado **(a)** el importe realmente debitado o acreditado en la moneda de la
  billetera y **(b)** el importe reconocido para cancelar el saldo del préstamo en su
  moneda. ORD **no inventa ni impone automáticamente un tipo de cambio**. No sumar montos
  nominales de monedas distintas ni reducir la deuda utilizando la unidad equivocada.

- **S16 · Estrategias de Saneamiento.** **Matemática**: mayor tasa de interés primero; la
  tasa no informada se trata como **0 % sólo para ordenar**. **Emocional**: menor saldo
  pendiente primero. **Vínculos**: cuestionario contextual y puntos por acreedor personal;
  los préstamos personales se priorizan respecto de los institucionales. La estrategia
  activa se recuerda para próximas visitas.

- **S17 · Cuestionario de Vínculos.** Sólo cuando el usuario elige solicitar una sugerencia
  mediante Vínculos. **No se realiza** durante el alta ni la edición del préstamo. Tres
  preguntas, cada una de selección múltiple; se puede seleccionar varias personas o
  ninguna:
  1. «¿A cuáles de estas personas les está generando una dificultad concreta que todavía
     no les hayas devuelto el dinero?» → **3** puntos.
  2. «¿Cuáles de estas personas ya te pidieron expresamente que les devuelvas el dinero?»
     → **3** puntos.
  3. «¿Con cuáles de estas personas sentís que seguir demorando la devolución podría
     perjudicar significativamente la relación o su confianza en vos?» → **5** puntos.
  Calcular por persona la **suma** de criterios seleccionados, sin penalizar la falta de
  selección. Ordenar por puntuación **descendente**. Puntaje posible: 0, 3, 5, 6, 8, 11.
  Si varias personas empatan, permitir un **desempate manual opcional**; si el usuario no
  lo hace, los empatados conservan **igual prioridad**. Presentar la sugerencia como
  orientación; nunca mueve fondos ni modifica el préstamo. Ejemplo: Pedro 3+5=8; Juan
  3+5=8; Lucas 3+3=6.

- **S18 · Simulación.** Presentar siempre el **saldo pendiente actual**, el **importe de
  pago propuesto** y la **variación de saldo proyectada**. Mostrar meses restantes, meses
  ahorrados e intereses ahorrados **únicamente cuando los datos disponibles y las
  condiciones permitan una estimación razonable**. Cuando un indicador no puede
  calcularse, expresar «**No se puede calcular con la información disponible**» o
  equivalente; **no representar ausencia de información con cero**. Simular no registra
  movimiento.

- **S19 · Progreso sin cifras engañosas.** Los números deben responder a una definición de
  saldo coherente y no mezclar monedas nominalmente. Si no se puede obtener una fecha
  realista, ocultar la falsa precisión.

- **S20 · Calendario.** Vencimientos y cuotas de préstamos, vencimientos de tarjetas y
  gastos recurrentes. **No es la fuente de autoridad del saldo de cada préstamo.** Si
  permite efectuar un pago de préstamo, debe usar el mismo registro y las mismas
  correcciones que «Debo», **evitando pagos duplicados**.

- **S21 · Pareja.** Sólo **balance derivado de gastos compartidos** y **préstamos
  explícitos entre integrantes**, separados, sin fusionar ni compensar. Estar conectado
  como Pareja **no habilita acceso automático al resto de préstamos privados**.

- **S22 · Sin notificaciones nuevas.** La decisión de estados automáticos **no autoriza
  por sí misma nuevas notificaciones externas al módulo**. Conservar la integración con el
  motor general de avisos existente.

- **S23 · i18n.** Toda la mensajería via i18n. Español, inglés y portugués en esta entrega.
  Ningún texto funcional nuevo exclusivamente en español.

- **S24 · Correspondencia de identificadores.** Un pago disparado desde el Calendario debe
  afectar **exactamente** el préstamo y la cuota correctos. Si no puede verificarse esa
  correspondencia, la operación **no debe permitir registrar el pago**.

## Tasks

| ID | Tarea | Specs | Ruta | Estado |
|---|---|---|---|---|
| T1 | Introspección read-only del esquema desplegado | S14, S15, S25 | inline | bloqueada (SOLICITUD A) |
| T2 | Migraciones no destructivas + tablas nuevas | S6, S7, S15 | TBD | pendiente (T1) |
| T3 | Lectura: resumen, listado y detalle | S1, S3, S7 | TBD | pendiente (T2) |
| T4 | Alta de préstamo nuevo e histórico | S4, S5, S6, S12 | TBD | pendiente (T2) |
| T5 | Edición de condiciones | S11 | TBD | pendiente (T4) |
| T6 | Registro de pago y cobro, multimoneda | S9, S10, S15 | TBD | pendiente (T2) |
| T7 | Sobrepago con confirmación de intereses | S10 | TBD | pendiente (T6) |
| T8 | Corrección de operaciones | S11 | TBD | pendiente (T6) |
| T9 | Estados derivados y saldado automático | S7 | TBD | pendiente (T6) |
| T10 | Eliminación lógica del historial | S8 | TBD | pendiente (T9) |
| T11 | Plan de Ataque sólo préstamos «Debo» | S2, S16 | TBD | pendiente (T3) |
| T12 | Desempates deterministas Matemática/Emocional | S16 | TBD | pendiente (T11) |
| T13 | Cuestionario de Vínculos y puntuación | S17 | TBD | pendiente (T11) |
| T14 | Simulación honesta | S18 | TBD | pendiente (T2) |
| T15 | Progreso sin porcentaje engañoso | S19 | TBD | pendiente (T11) |
| T16 | Categorías e ingresos: migración y bootstrap | S12, S13, S14 | TBD | pendiente (T1) |
| T17 | Integración con presupuesto y reportes | S12 | TBD | pendiente (T16) |
| T18 | Calendario: ids explícitos y cronograma | S20, S24 | TBD | pendiente (T6) |
| T19 | Cuarentena fuera de Saneamiento sin romper accesos | S1 | TBD | pendiente (T3) |
| T20 | Navegación `/prestamos` y compatibilidad | S1 | TBD | pendiente (T3) |
| T21 | Pareja: balance y préstamos explícitos | S21 | TBD | pendiente (T3) |
| T22 | Avisos existentes: compatibilidad | S22 | TBD | pendiente (T9) |
| T23 | i18n es/en/pt | S23 | TBD | pendiente (todas) |
| T24 | Pruebas: RED/GREEN por S# y AC-01..AC-20 | todas | TBD | pendiente (todas) |

## Log

**L1 — pedido original del dueño (verbatim):**
> <<<<<<<<<<<<Vamos a reconstruir el módulo de préstamos y saneamiento En lugar de saneamiento, tienes el PR con todas las indicaciones en la siguiente carpeta: 'C:\temp\Antigravity\ORD Capital v2\Personal\docs\deudas\Prestamos-Saneamiento' . <<<<Hazme todas las preguntas necesarias. Si encuentras contradicciones o puntos que no entiendes cómo resolver para la implementación de esta tarea, tengo a mi agente especialista dispuesto a responder todas tus dudas.

**L2:** «los otros prd de la misma carpeta te aportaran datos sobre el estado actual del sistema. No los confundas con el pr que te dice lo nuevo, como debe quedar»

**L3:** «tienes que cambiar la rama, crea una nueva» → rama `feat/prestamos-saneamiento-rebuild` desde `origin/produccion`.

**L4 — decisiones del responsable del producto sobre las 29 preguntas:**
- P1 Evolución conservadora de `p_prestamos` + estructuras nuevas. No eliminar ni sustituir tablas sin análisis de compatibilidad y migración.
- P2 Cuotas con fechas reales cuando el préstamo se registró bajo esa modalidad; vencimiento único y devolución libre sin cuotas inventadas. Determinar `p_cuotas_detalle` vs tabla propia, considerando que las cuotas de tarjetas son otro concepto.
- P3 Aceptada estructura específica de pagos y cobros vinculada con `p_caja`, con edición directa, desglose de intereses, equivalencias multimoneda, trazabilidad y reversión coherente. Diseño de tablas = responsabilidad técnica.
- P4 Ambos importes conservados en la operación, también al crear un préstamo nuevo si la moneda difiere. Nunca conversiones supuestas.
- P5 Eliminación lógica del préstamo saldado; no aparece en historial visible, no vuelve a computarse como pendiente, movimientos de billetera íntegros con referencias válidas. Sin eliminaciones físicas que rompan integridad.
- P6 No se conoce ni se supone el volumen de producción: verificarlo con consulta autorizada de sólo lectura. Si hay registros, preservarlos. No reconstruir cronogramas históricos inventando cuotas.
- P7 Buscar el archivo de esquema en los worktrees y ubicaciones existentes; si no está, documentar su ausencia. No tomar los espejos SQL como prueba del esquema desplegado.
- P8 Solicitud única y acotada para introspección de sólo lectura. Verificar tipos de moneda, claves foráneas, contratos RPC, políticas de acceso y diferencias entre `Personal` y `Personal-3`.
- P9 Pagos aplicados al saldo total. Calcular el importe vencido comparando obligaciones exigibles acumuladas y pagos aplicables acumulados, contemplando saldos iniciales, históricos, intereses y pagos anticipados, sin atribuir a ORD operaciones anteriores inexistentes.
- P10 Usar los siete días del mecanismo existente. No crear notificaciones nuevas.
- P11 Distinguir tasa 0 % real de tasa desconocida. Para Matemática ambas valen cero; para estimar intereses no son equivalentes. Conservar la diferencia sin reinterpretar datos históricos ambiguos.
- P12–P13 Matemática y Emocional con orden determinista y estable, sin nueva preferencia funcional artificial. En Vínculos personales antes que institucionales; sólo los empates del cuestionario tienen desempate manual aprobado. No volver a consultar por ordenamientos técnicos secundarios.
- P14 Simulación adaptada a datos confiables: saldo actual, pago propuesto, saldo proyectado. Meses o intereses ahorrados sólo con información suficiente sobre condiciones, amortización y efectos del adelanto. Una TNA y una cuota fija no garantizan cálculo fiable. No reutilizar la fórmula antigua si produce ahorros ficticios.
- P15 Eliminar la fecha inventada de seis meses. Fecha pactada cuando exista; proyección sólo si está justificada. No confundir fecha contractual con estimación por adelantar pagos.
- P16 No presentar pagos históricos inferidos como operaciones de ORD. Diferenciar «Pagado registrado en ORD» y «Saldo pendiente». Si un porcentaje no representa fielmente el avance, mostrar importes absolutos.
- P17 No asumir que todo excedente es interés. Si el usuario confirma intereses efectivamente cobrados, registrarlos dentro del cobro sin segundo ingreso. Si no puede identificarse el excedente, no incorporarlo silenciosamente al saldo.
- P18 Préstamo nuevo con fondos reales exige billetera; el efectivo se registra con billetera de efectivo. Préstamo histórico no recrea movimientos y no exige billetera.
- P19 «Deudas» y «Préstamos otorgados» son categorías de egreso; integrar con presupuesto según reglas existentes. No convertirlas en operaciones fuera de presupuesto ni asumir tipo de cupo de Base Cero. Proponer integración sin doble descuento.
- P20 Categoría definitiva exactamente «Deudas». Investigar registros de «Pago de Deudas» y preparar migración segura conservando referencias de movimientos reales. No fusionar ni reescribir producción sin aprobación.
- P21 Nombres aprobados: «Ingreso x préstamo recibido», «Deudas», «Préstamos otorgados», «Cobro de préstamos». Verificar su existencia real en el entorno desplegado, sin inferirla de los archivos locales. No crear duplicados.
- P22 Intereses cobrados identificados en la propia operación de cobro, sin ingresos adicionales; fuente «Cobro de préstamos».
- P23 No agregar notificaciones nuevas. Conservar la integración con el motor general de avisos, revisando compatibilidad y evitando duplicaciones. No eliminar mecanismos anteriores automáticamente.
- P24 Objetivo final conserva las cinco secciones. Implementación por etapas: modelo y operaciones, luego Saneamiento e integraciones. La división en etapas no modifica el alcance.
- P25 Pareja: sólo balances de gastos compartidos y préstamos explícitos, separados y con privacidad. Reutilizar datos reales existentes; no simular saldos.
- P26 No eliminar todavía RPC aparentemente sin uso. Identificar dependencias, llamadas indirectas y políticas. Proponer cuáles se reutilizan, cuáles se reemplazan y cuáles quedan obsoletas después de migrar.
- P27 Navegación objetivo `/prestamos` con secciones internas. Proponer rutas coherentes conservando compatibilidad con enlaces existentes. Cuarentena sale de Saneamiento sin romper acceso independiente, navegación ni enlaces profundos.
- P28 Primero plan técnico y cambios SQL para revisión, no ejecutados. Separar diseño, migraciones, verificación, pruebas y despliegue. Cambios potencialmente destructivos requieren autorización explícita. Backup y estrategia de recuperación obligatorios.
- P29 Español, inglés y portugués en esta entrega.
- Hallazgo Calendario: investigar prioritariamente la confusión `cuota_id`/`prestamo_id`. No alcanza con implementar el cronograma: corregir la correspondencia real de identificadores y demostrar con pruebas que nunca afecta otro préstamo. Si no puede verificarse, la operación no debe permitir registrar el pago.
- Hallazgo worktrees: comparar componentes, contratos y migraciones entre `Personal` y `Personal-3` antes de modificar nada. Documentar divergencias materiales sin mezclar versiones.

**L5 — autorizaciones de implementación:**
- Supabase: **AUTORIZADO** consultar estructura real (tablas, columnas, relaciones, permisos, RPC, datos). No basarse en espejos ni documentos antiguos. Tablas nuevas con prefijo del módulo (`p_prestamos_*`).
- Documentación: versionar el esquema en Git y que esté en los tres worktrees. Verificar `.gitignore` con `git ls-files` y `git check-ignore -v`, no por suposición. Regularizar el versionado sin subir credenciales. Contrastar contratos reales de todas las RPC del módulo contra las tablas desplegadas.
- Arquitectura de tablas: delegada al criterio técnico. Estructura limpia, bien relacionada, sin proliferación. No forzar reutilización de una tabla inapropiada. Documentar las razones.
- Ingresos/egresos: los movimientos son ingresos o egresos **ordinarios** y afectan el presupuesto. Recibir → «Ingreso x préstamo recibido»; devolver → «Deudas»; otorgar → «Préstamos otorgados»; cobrar → «Cobro de préstamos». La categoría de egreso se crea automáticamente la primera vez. **Clave interna estable + traducciones es/en/pt** siguiendo el sistema de categorías de ORD. Sin duplicados. Contabilizar una sola vez, sin descuentos duplicados en billeteras ni presupuestos.
- Cobro superior al saldo: **APROBADO** con confirmación; excedente como intereses cobrados, dentro de la misma operación de ingreso; si cancela, no se registra.
- Etapas: **APROBADO** entregar por etapas; alcance final mantiene las cinco secciones.
- Datos existentes: el módulo **no tiene datos reales en producción**. Comprobarlo igualmente. No alterar datos de tarjetas, billeteras, presupuestos ni otros módulos.
- Migraciones: **AUTORIZADO** implementar cambios de tablas y RPC. Condiciones: respaldo verificable y procedimiento de recuperación previos; integridad de otros módulos; evitar migraciones destructivas innecesarias; verificar dependencias antes de modificar funciones compartidas; pruebas de coherencia entre pagos, billeteras, préstamos, presupuesto y calendario; documentar exactamente qué se cambió; informar antes de ejecutar algo irreversible o ante datos reales inesperados.
- Vínculos: el cuestionario se hace al pedir la sugerencia, no en el alta. Las puntuaciones **no** son clasificaciones permanentes que reemplacen una evaluación posterior.
- Simulación: ni una cuota ni una tasa conocidas garantizan estimación confiable. Mostrar resultados solo si el modelo de amortización y las condiciones reales lo sostienen.
- Commit de documentación: autorizado **local, sin push**.

## Estado verificado del esquema desplegado

Introspección read-only contra el proyecto `bjszdmheddcxjdhcvibi`, 2026-11-18.
Scripts: `scripts/prestamos/introspect-schema.mjs` y `introspect-deps.mjs`.

**El dump `start_info/tablas todas.md` está desactualizado.** No estaba versionado, nunca lo estuvo, lo excluía `.gitignore:32`. Le faltan `p_caja.moneda`, `p_caja.valor_local`, `p_caja.moneda_local`, `p_caja.tasa_snapshot`, `p_caja.parent_pago_caja_id`, `p_cuotas_detalle.moneda`, `p_ingresos.activo` y otras. El esquema real es la fuente.

Hechos duros:

1. `p_prestamos.moneda_iso` es **`character(3)`**, no `char(1)`. `'ARS'` cabe. Datos de moneda sanos.
2. `p_prestamos` tiene **0 filas**. No hay datos que migrar.
3. `p_cuotas_detalle` tiene 757 filas, **0 con `prestamo_id`**. Las 757 son de tarjetas.
4. `p_prestamos_tipo_flujo_check` ya admite `'debo'` **y** `'me_deben'`. No hay que migrar la restricción.
5. `p_prestamos_estado_check` admite `activo, archivado, pagado, refinanciado, pendiente, parcial, cancelado`. **`'pagado'` ya existe**: se usa como «Saldado». Falta agregar `'eliminado'`.
6. `p_caja_tipo_check` admite `income, expense, transfer, adjustment, opening, pago_tarjeta`. Vocabulario real en datos: los seis, sin valores sueltos.
7. `p_estructuras_egresos.tipo_cupo` CHECK: `need, want, tithe, investment, saving`.
8. La categoría `Deudas` (need) **ya existe**, 1 fila, 1 usuario. **`Pago de Deudas` no existe en ningún usuario**: nunca se creó porque nunca hubo un pago de deuda. La migración de «Pago de Deudas» es innecesaria.
9. Existen categorías de usuario `Prestamos` (need) y fuente de ingreso `Prestamo`: texto libre de un usuario. **No tocarlas.**
10. **«Ingreso x préstamo recibido» y «Cobro de préstamos» no existen.** La afirmación del PRD de que la primera ya existía es falsa en el entorno desplegado.
11. RLS: todas las tablas del módulo tienen `allow_security_definer_access` (postgres, true) y `deny_direct_anon_access` (anon, false). Todo acceso pasa por RPC `SECURITY DEFINER` (las 16 verificadas lo son). Las tablas nuevas necesitan el mismo par de políticas.
12. `p_cuotas_detalle.prestamo_id` tiene FK a `p_prestamos` **ON DELETE CASCADE**, y `p_caja.estructura_egreso_id` FK **ON DELETE CASCADE** (borrar una categoría borraría sus movimientos). Nunca borrar categorías.
13. `p_prestamos.p_caja_id` tiene FK a `p_caja` **ON DELETE CASCADE**: campo minado. Hoy siempre NULL porque nadie lo escribe, pero borrar un `p_caja` arrastraría el préstamo. No usarlo; evaluar `ON DELETE SET NULL`.
14. **Triggers de `p_caja`**: el saldo de billetera lo mueve `tr_actualizar_saldo_p_caja_integral` (`fn_actualizar_saldo_billetera_integral`), y `trg_p_caja_snapshot_moneda` congela moneda local. **Ninguna RPC debe tocar `p_billeteras.saldo_actual`**: el doble descuento se evita insertando solo el `p_caja`.
15. `p_estructuras_egresos` tiene 5 triggers, entre ellos `tr_asignar_color_subcuenta_nueva` (AFTER INSERT asigna color) y `tr_bloquear_categoria_inversion`. `p_prestamos` y `p_cuotas_detalle` **no tienen triggers**.
16. **54 funciones desplegadas** referencian `p_prestamos`, `p_cuotas_detalle` o `p_config_bola_nieve`. Incluye `fn_borrar_datos_usuario`, `fn_clonar_usuario_admin`, los tres `fn_exportar_*` y once reportes (patrimonio, escudo, BCG, timeline, score, safe-to-spend, punto de equilibrio, radar, simulador, saldo a asignar). Ese es el radio de impacto real.
17. **Los dos defectos están confirmados en el cuerpo desplegado**: `fn_registrar_pago_extra_deuda` contiene `GREATEST(0, saldo_actual - p_monto)` (pos 1501), `ILIKE '%deuda%'` (442) y `'Pago de Deudas'` (791), y **no contiene `NOT FOUND`**. `fn_reporte_calendario_financiero` contiene `'prestamo_' ||` (960). Ambos vivos.
18. `fn_editar_movimiento_caja` tiene **3 overloads** desplegados.
19. **Dos sistemas de clave de categoría incompatibles coexisten.** El vivo: `p_estructuras_egresos.nombre_cuenta` = clave en inglés (`cat_food_home`, `cat_housing`) + `tipo_cupo` en inglés + traducciones en `src/locales/{es,en,pt}.ts` + allowlist en `src/lib/catalogRegistry.ts`. El dormido: `p_categorias_plantilla` (9 filas) usa claves y cupos **en español** (`cat_alimentos_hogar`, `necesidad`, `deseo`) y `p_categorias_traduccion` (6 filas, solo 3 claves). Ningún código lee las dormidas, y su `tipo_cupo` violaría el CHECK si se conectara. **Se adopta el sistema vivo.**
20. `p_ingresos` no tiene mecanismo de clave: `nombre` es texto libre. El único intento (`savings_yield_income_name`) no existe en ninguna locale y se renderiza crudo.

## Decisiones técnicas (revisadas contra el esquema real)

- **D1** · Extender `p_prestamos` con `saldo_al_ingreso numeric NOT NULL DEFAULT 0`, `modalidad text NOT NULL DEFAULT 'libre'`, `condicion_interes text NOT NULL DEFAULT 'desconocido'`, `interes_total_acordado numeric NULL`, `tasa_informada boolean NOT NULL DEFAULT false`, `puntos_vinculo smallint NULL`, `eliminado_at timestamptz NULL`. Sin backfill: 0 filas.
- **D2** · Tabla propia `p_prestamos_cuotas`. `p_cuotas_detalle` no tiene capital ni interés por cuota, y sus 757 filas son de tarjetas.
- **D3** · Tabla propia `p_prestamos_pagos`, con los dos importes de S15, desglose de intereses, excedente y estado de anulación.
- **D4** · `saldo_al_ingreso` separa «pagado en ORD» de «pendiente» sin inferir pagos previos.
- **D5** · `tasa_informada` en vez de volver nullable `tasa_anual_tna`.
- **D6** · `estado` guarda solo ciclo de vida; «al día / próximo / vencido» se derivan al leer. «Saldado» = `'pagado'`, ya en el CHECK. Se agrega `'eliminado'`.
- **D7** · `exigible_vencido = GREATEST(0, Σ cuotas con vencimiento ≤ hoy − Σ pagos activos)`.
- **D8** · Simulación solo desde el cronograma real. Se elimina `TNA/1200`.
- **D9** · Desempates deterministas con `prestamo_id ASC` como último criterio.
- **D10** · Calendario con `prestamo_id` y `cuota_id` explícitos; el frontend deja de parsear `evento_id`; la RPC de pago gana `IF NOT FOUND THEN RAISE` **antes** de insertar el `p_caja`.
- **D11** · Presupuesto: `p_caja.tipo='expense'`/`'income'` + categoría, sin flag nuevo, sin `'adjustment'`. El movimiento de billetera lo produce el trigger, nunca la RPC.
- **D12** · Claves i18n en inglés: `cat_debt_payment` y `cat_loans_granted`; ingresos `loan_received_income_name` y `loan_collection_income_name`. Altas en `es/en/pt` y en `SYSTEM_CATALOG_NAMES`. No se usan las tablas dormidas.
- **D13** · Navegación `/prestamos/*` con `/saneamiento` como redirect.

## Radio de impacto a verificar antes de tocar funciones compartidas

54 funciones desplegadas + 9 triggers de `p_caja` + 5 de `p_estructuras_egresos`. Obligatorios: `fn_borrar_datos_usuario`, `fn_clonar_usuario_admin`, `fn_exportar_backup_maestro`, `fn_exportar_datos_usuario_rango`, `fn_exportar_pasaporte_financiero`, `fn_t_limpiar_dependencias_caja`, `fn_editar_movimiento_caja` (3 overloads), `fn_eliminar_movimiento_caja`, y los once reportes que leen `p_prestamos`.

