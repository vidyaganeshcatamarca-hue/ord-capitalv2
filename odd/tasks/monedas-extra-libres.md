# Feature: Monedas extra libres (2ª y 3ª moneda a elección) — capacidad N, tarjetas quedan local+USD

Evaluación completa entregada el 2026-10-15/16 (reporte + brainstorming). Implementación autorizada
por el dueño el 2026-10-16 con alcance C1: la moneda extra libre vive en billeteras/transferencias/
patrimonio/voz/inversiones; **el módulo tarjetas no se toca**. Rama de trabajo: `pi/sesion-3`.

> **⏸️ PAUSADO por el dueño (2026-10-16, L8):** las 12 preguntas están resueltas (S12–S23);
> la implementación NO arrancó (ninguna tarea T tocada). Reanudar por T1.

## Specs

- **S1** (pedido original): "quiero que hagas una evaluación completa sobre la factibilidad y
  posibilidad y el costo que requeriría implementar la liberación de la segunda moneda fija en
  dólares para que pueda ser cualquier otra moneda a elección del usuario, y la implementación de
  una tercera moneda también a elección del usuario".
- **S2**: "las tres deberían quedar libres, la local y las otras dos a elección del usuario".
- **S3**: "Siempre, en la visión global, vamos a poner el patrimonio o las conversiones a moneda local".
- **S4**: "mantenemos los pagos individuales, como en el módulo tarjetas o cuando las cuentas de las
  monedas se manejan con la misma divisa. Y no hay intercambio cruzado de pagos. Cuando los hay,
  siempre hay que convertir a moneda local".
- **S5** (definición final): "nos van a quedar tres monedas, la local se elige con el país y la
  segunda y la tercera a elección del usuario dentro de las disponibles".
- **S6** (tarjetas): "tarjetas funciona así o sí [o sea] con moneda local más dólar, ya sea que
  esté dólar o no como moneda segunda o tercera". Consecuencia: las secciones USD de tarjetas
  (cuotas, favor, pagos multi, termómetro) siguen existiendo aunque USD no esté entre las tres
  monedas del usuario; si el usuario no tiene billeteras USD, las secciones USD se pagan desde
  billeteras locales vía conversión (motor actual, sin cambios).
- **S7** (decisión): cotizaciones por **pivote USD** sobre `p_divisas.valor_por_usd`, extendiendo
  el patrón de `fn_valor_a_moneda_local`. Sin tabla de pares N×N.
- **S8** (decisión): modelo de datos por **capacidad N** — lista de monedas extra por usuario
  (default `["USD"]`), nadie migrado. Hoy se habilitan 2; la capacidad ya es N.
- **S9** (decisión): catálogo elegible = **solo monedas cotizadas por el cron** (`p_divisas`,
  ~51). Garantía de tasa disponible.
- **S10** (decisión): usuario cuya moneda local es USD **igual que todos** (elige extras libres).
- **S11** (decisión): validación de moneda en cuentas = **local + extras activas** (reemplaza el
  par local+USD hardcodeado). OCR no existe todavía: queda fuera; heredará la plomería de cuarentena.
- **S12** (A1, 2026-10-16): las extras se administran **solo en Configuración → Región y formato**;
  el onboarding no cambia (país → moneda local).
- **S13** (A2, 2026-10-16): usuario nuevo: 2ª moneda **preseleccionada USD**, 3ª **vacía**
  (extras default `["USD"]`, nadie migrado).
- **S14** (A3, 2026-10-16): quitar o reemplazar una extra con cuentas activas en esa moneda queda
  **bloqueado hasta archivar esas cuentas** (mensaje con el bloqueo explícito).
- **S15** (A4, 2026-10-16): tasa desactualizada → convertir con la **última tasa conocida +
  antigüedad visible** en la UI; NULL solo si nunca hubo tasa (D17 intacto).
- **S16** (A5, 2026-10-16): en transferencias cruzadas, el **monto destino se sugiere
  automáticamente para cualquier par** entre las monedas activas del usuario (pivote USD);
  sin tasa → campo vacío y manual (D17).
- **S17** (A6, 2026-10-16): etiquetas dinámicas en Actividad reciente: "compra/venta de {moneda}"
  (compra de dólares, compra de euros, venta de libras...); misma moneda → "transferencia entre
  cuentas". Reemplaza el CASE fijo de `fn_registrar_movimiento_caja` (hoy
  transfer_compra_dolares/venta_dolares/entre_cuentas).
- **S18** (A7, 2026-10-16): el hero del Home queda **como hoy**: número grande = bucket local,
  y una línea por cada moneda extra con saldo > 0 en su moneda (la línea USD fija se vuelve
  dinámica). Sin total consolidado en el hero.
- **S19** (A8, 2026-10-16): Supervivencia (safe-to-spend, escudo, runway) queda en moneda local,
  con las cuentas en extras convertidas a local al consolidar.
- **S20** (A9, 2026-10-16): ingesta de voz queda **libre** (deploy 73, sin tocar n8n/parser);
  la validación de moneda aplica **al aprobar en cuarentena**: la moneda del movimiento debe
  coincidir con la de la billetera destino (o ser una de las 3 activas); si no, error editable,
  nunca se pierde la fila.
- **S21** (A10, 2026-10-16): el picker de moneda de una inversión nueva ofrece **las monedas
  activas del usuario** (local + extras); la liquidación matchea billeteras de la misma moneda
  (filtro que ya existe en LiquidarInversionModal).
- **S22** (A11, 2026-10-16): decimales **por moneda**: preferencia individual por cada moneda
  activa (ej. ARS 0, USD 2, EUR 2). Migración de preferencias existentes:
  `decimales_moneda_local` → entrada de la moneda local; `decimales_segunda_moneda` → entrada
  USD. Default de una extra nueva: derivado del catálogo (`p_paises.moneda_decimales` del país
  emisor, CLDR del seed WU1), editable por el usuario.
- **S23** (A12, 2026-10-16): la sugerencia de conversión en edición/aprobación de cuarentena es
  **la misma regla que transferencias manuales** (S16 + S15): genérica por pivote, fecha visible,
  sin tasa → manual (D17).
- **S25** (decisión del dueño sobre T5/S20, 2026-10-16): la moneda DECLARADA en cuarentena
  (voz/OCR) queda **metadata muerta**: el motor de aprobación NO la consulta y sigue
  insertando con la **moneda real de la billetera elegida** (sume cabeza la billetera).
  "deja la metadata muerta, no interfiere y no corresponde que hagas nada con ella. Lo que
  manda es billetera y lo que diga el user no importa en el frontend". El patch 76 NO se
  deploya; queda commiteado (fbc1d42) como artefacto de exploración, marcado NO-AUTORIZADO
  para deploy. La clave i18n error_cuarentena_moneda_no_activa queda sin consumidor (sweep
  la reportará como advertencia).
- **S24** (coordinación menu-ajustes, 2026-10-16): T8 integra en la página Región y formato
  (`src/pages/Configuracion/RegionFormatoPage.tsx`), dentro del bloque **Monedas** que la spec
  paralela `odd/tasks/menu-ajustes.md` S18 reservó (obs 600/598): local no configurable (derivada
  del país), 2ª seleccionable, 3ª arranca vacía. La **estructura del menú** pertenece a la feature
  menu-ajustes; la **lógica de selección de monedas** pertenece a esta feature. Punto de
  integración estable aunque el menú se reorganice: T8 NO espera a menu-ajustes.

## Abiertas (se responden módulo a módulo antes de tocar cada módulo)

| # | Módulo | Pregunta | Estado |
|---|---|---|---|
| A1 | Config/UX | Dónde se eligen las extras (Configuración / onboarding / on-the-fly) | ✅ solo Configuración (S12) |
| A2 | Config/UX | Default de extras para usuarios nuevos | ✅ 2ª=USD preseleccionada, 3ª vacía (S13) |
| A3 | Billeteras | Quitar/reemplazar extra con cuentas activas en esa moneda | ✅ bloquear hasta archivar (S14) |
| A4 | Backend | Política de tasa desactualizada (última conocida + fecha / bloquear) | ✅ última conocida + fecha visible (S15) |
| A5 | Cargas | Sugerencia de conversión genérica en transferencias cruzadas | ✅ genérica entre las 3 (S16) |
| A6 | Cargas | Etiquetas "compra/venta de {moneda}" dinámicas | ✅ dinámicas (S17) |
| A7 | Patrimonio | Hero del Home con extras (consolidado vs líneas por moneda) | ✅ como hoy: bucket local + líneas (S18) |
| A8 | Supervivencia | Safe-to-spend queda en local convirtiendo extras | ✅ en local, extras convertidas (S19) |
| A9 | Voz | Voz acepta extras desde día 1 o quedan local+USD hasta estabilizar | ✅ ingest libre, validación al aprobar (S20) |
| A10 | Inversiones | Picker de moneda de inversión: monedas del usuario vs local+USD | ✅ monedas del usuario (S21) |
| A11 | Config | Decimales por moneda extra (preferencia única / CLDR / por moneda) | ✅ preferencia por moneda (S22) |
| A12 | Cuarentena | Sugerencia de conversión en edición/aprobación (misma regla que A5) | ✅ misma regla que transferencias (S23) |

## Tasks

| ID | Módulo | Especificación | Ruta | Commit |
|---|---|---|---|---|
| T1 | Backend datos+RPC | S5,S7,S8,S9,S10,S11,S13,S14,S15,A2,A4: `monedas_extra` en `p_config_region`, RPC de configuración, `fn_obtener_cotizacion(origen,destino)` pivote, validación en `fn_crear_billetera*`, test transaccional 21/21 PASS, **DEPLOYADO 2026-10-16** | worker+fixes inline | **852f6f0** |
| T2 | Billeteras | S2,S5,S8,S10,S11,A3: picker local+extras (monedasExtra.ts + useMonedasExtra + BilleterasPage), texto de error no mentidor, RED→GREEN 8/8, suite 80/80, commit | inline | **8918a1a** |
| T3 | Cargas manuales | S4,S16-S17,A5,A6: sugerencia por par via fn_obtener_cotizacion + hint tasa/fecha; helper fn_titulo_transferencia (12/12 JS + 7/7 SQL), renderer JSON en HomePage, keys legacy USD intactas; **DEPLOYADO 2026-10-16** | worker+inline | — |
| T4 | Patrimonio/Home | S3,S18,S19,A7,A8: hero líneas dinámicas (buildHeroLines + totales_por_moneda del RPC existente) + Supervivencia en moneda local real (9 copias formatMoneyARS extintas); SIN backend | inline | **c511070** |
| T4 | Patrimonio/Home | S3,A7,A8: hero + totales_por_moneda + Supervivencia | inline | — |
| T5 | Voz | S5,A9,S25: **DECIDIDO NO IMPLEMENTAR el gate** (la moneda declarada queda metadata muerta; la pata manda). Ingesta voz ya data-driven (deploy 73) — intacta. Artefacto 76 commiteado sin deploy | inline | fbc1d42 (no deploy) |
| T6 | Inversiones | A10: picker de moneda (pendiente respuesta) | pendiente | — |
| T7 | Cuarentena | A12: sugerencia de conversión en EditarCuarentenaModal | inline | — |
| T8 | Configuración UI | S5,S24,A1,A11: bloque Monedas (S18 menu-ajustes) en Región y formato: selectores 2ª/3ª + decimales por moneda (S22) + i18n | inline | — |
| T9 | Cierre | S1–S11: sweep de literales restantes en funciones tocadas, docs, tests finales | verify | — |

## Log

- **L1** (pedido original, 2026-10-15): verbatim de S1–S4 + "quiero que hagas una evaluación
  completa [...] y presentame un reporte claro [...] y también quiero que me hagas todas las
  preguntas que necesites con brainstorming skill para que podamos ponernos de acuerdo".
- **L2** (evaluación entregada, 2026-10-15/16): factible; núcleo binario en 39 funciones SQL
  (`temp_sql/69_sweep_literales.json`), primitivo genérico ya existe (`fn_valor_a_moneda_local`,
  `totales_por_moneda`), tarjetas = módulo más pesado y de dinero real. Decisiones S7–S11 tomadas
  en brainstorming (pivote USD, capacidad N, catálogo cron, usuario-USD igual, alcance C1
  billeteras-only). Guardado en memoria (obs 593).
- **L3** (autorización, 2026-10-16): "arrancamos, pero Para que vayas desarrollando, quiero que
  volvamos a rechequear preguntas, ya sean de interfaz usuario o de backend, para que vayamos
  seguros tocando módulo a módulo. En definitiva nos van a quedar tres monedas, la local se elige
  con el país y la segunda y la tercera a elección del usuario dentro de las disponibles y
  tarjetas funciona así o sí con moneda local más dólar, ya sea que esté dólar o no como moneda
  segunda o tercera." → S5, S6, y protocolo: pregunta batch por módulo antes de tocarlo.
- **L4** (batch 1 respondido, 2026-10-16): A1 "Solo en Configuración"; A2 "segunda moneda por
  defecto USD y tercera vacia"; A3 "Bloquear hasta archivar"; A4 "Última tasa + fecha visible".
  Registradas como S12–S15.
- **L5** (batch 2 respondido, 2026-10-16): A5 "Genérica entre las 3"; A6 "Dinámicas: compra/venta
  de {moneda}"; A7 **"Como hoy: bucket local + líneas"** (NO consolidado en el hero — el dueño
  eligió mantener el comportamiento actual); A8 "Queda en local, extras convertidas".
  Registradas como S16–S19.
- **L6** (hallazgo, 2026-10-16): la ingesta de voz YA está generalizada (deploy 73:
  `fn_cargar_movimientos_voz` acepta cualquier moneda de `p_divisas`; CHECK de cuarentena acepta
  cualquier ISO de 3 letras). El binario vivo quedó en la APROBACIÓN (`fn_aprobar_cuarentena_v2`)
  y en el CASE fijo de títulos de `fn_registrar_movimiento_caja` (línea ~1564 de
  temp_sql/70_deploy_tmp.sql): local↔USD titulan compra/venta de dólares, cualquier otro par
  cruzado cae en "transfer_entre_cuentas". La columna legado `es_usd` de `p_caja` sigue
  binaria (USD-only) y se mantiene como está.
- **L7** (batch 3 respondido, 2026-10-16): A9 "Ingesta libre + validación al aprobar"; A10
  "Monedas del usuario"; A11 **"Preferencia por moneda"** (el dueño eligió control total pese
  al costo de UI/storage — migrar decimales actuales a por-moneda y derivar defaults del
  catálogo); A12 "Misma regla que transferencias". Registradas como S20–S23. **Las 12
  preguntas están resueltas: se habilita la implementación módulo a módulo.**
- **L8** (stop explícito, 2026-10-16): "stop cuando puedas parar seguimos luego, para antes de
  la proxima pregunta". Pausa por el dueño antes de arrancar T1. Estado al parar: doc completo
  (S1–S23, A1–A12 resueltas), cero código tocado, cero deploys, doc sin commitear.
  Próximo paso al reanudar: T1 (backend datos+RPC) con handoff por referencia a este doc.
- **L9** (verificación T1, 2026-10-16): worker entregó 18/18 PASS (ensayo rollback verde, nada
  persistido). Verificador independiente: **NO-GO** — bloqueador: `array_length(p_monedas,1)`
  solo mira la dimensión 1 (un `text[][]` 2x2 con 4 monedas pasa el límite S5 y el FOREACH las
  itera todas). Concerns: harness exit 0 aunque result=FAIL; default del ALTER no probado
  (el setup escribe antes de leer); secuencias no transaccionales quemadas por el test (restaurar
  con setval antes del RAISE final); lock de carrera creador-vs-configurador (FOR UPDATE fila
  de región); identidad misma-moneda fuera de D17 (declarada intencional: convertir X→X es 1
  por definición, sin tasa). Confirmado en vivo: `fn_configurar_region_usuario` es UPSERT
  (`ON CONFLICT (user_id) DO UPDATE`) → el INSERT de nuestra función es conflict-safe;
  `p_config_region` sin columnas serial. Fixes en curso sobre 74_*.
- **L10** (coordinación menu-ajustes, 2026-10-16): el dueño dirigió a la coordinación del peer
  (obs 600, topic coordination/p3-tercera-moneda): bloque **Monedas** reservado en Región y
  formato (S18 de odd/tasks/menu-ajustes.md, obs 598) con 3 slots alineados a S12/S13/S22.
  Reglas del peer: estructura del menú es suya (S17), lógica de monedas nuestra; toda RPC/campo
  nuevo requiere autorización explícita del dueño (ya dada vía este doc para T1; el deploy
  real queda pendiente de aprobación) y **espejo en funcionesSQL con entrada en el índice** —
  carpeta que vive en el clone Personal, no en Personal-3: agregar al checklist post-deploy
  (coordinar con el peer). Respuesta dejada en Engram (topic coordination/p3-tercera-moneda).
- **L11** (fixes del verificador + re-test, 2026-10-16): TODOS los hallazgos del NO-GO
  corregidos: (1) bloqueador del bypass → `cardinality()` en vez de `array_length(...,1)` y
  regresión 16 con `text[][]` 2×2 (count=4); (2) lock de carrera → `FOR UPDATE` sobre la fila
  de región en `fn_configurar_monedas_extra`; (3) default del ALTER → aserción 1 con INSERT
  fresco (DELETE+INSERT solo user_id; sin FKs entrantes, verificado en vivo); (4) secuencias
  IDENTITY → captura previa + `setval` antes del RAISE final, más remediación de los gaps
  quemados por las corridas anteriores (p_billeteras realineada a 1368 = máx); (5) harness →
  exit 1 cuando result≠PASS; (6) cobertura de las tres funciones sin país → aserciones 15b/15c
  (con desactivación in-txn de billeteras para _iniciales). Descubrimiento del debugging: un
  BEGIN..EXCEPTION en PL/pgSQL es una subtransacción — el handler revierte los cambios
  hechos dentro del bloque, así que el UPDATE de dejar sin país tenia que salir del bloque.
  Sonda transaccional separada confirmó que `_inicial` sin país raises region_not_configured
  con 0 billeteras creadas. Re-test: **21/21 PASS** (result=PASS|fallos=0), estado post-run
  verificado: 0 probes, columna sin deploy, secuencias alineadas. D17 identidad misma-moneda
  documentado en el header de fn_obtener_cotizacion (decisión: es conversión trivial sin
  tasa, no aplica D17).
- **L12** (DEPLOY REAL T1, aprobado por el dueño 2026-10-16): aplicado
  `temp_sql/74_deploy_real.mjs` sobre la base compartida. Verificado post-deploy: columna
  `monedas_extra jsonb NOT NULL DEFAULT '["USD"]'` presente; las 3 funciones nuevas con las
  firmas esperadas y una única firma de `fn_crear_billetera` (sin overloads colgados);
  **74 filas de región leen `["USD"]`** (nadie migrado); EXECUTE para el rol `authenticated`
  confirmado en las 3 funciones. Smoke read-only con claims reales (user 1, ARS):
  `fn_obtener_monedas_extra()` = `['USD']`; cotización ARS→USD = 0.00066 (~1/1515,
  recíproca con `fn_obtener_cotizacion_usd` ≈ 1515); EUR→GBP = 0.8457 por pivote; ZZZ→USD
  = NULL/NULL (D17). Fecha de tasa = 2026-10-16 (cron al día). Commit WU **852f6f0**
  (7 archivos, 1189 líneas: 4 artefactos SQL/mjs + doc + scripts de deploy/smoke).
  Pendiente de cierre: espejo `funcionesSQL` en clone Personal (coordinar con peer de
  Ajustes, mensaje enviado).
- **L13** (coordinación peer, 2026-10-16): el peer respondió (obs 605): (1) los espejos
  `funcionesSQL` los hizo ÉL (obs del topic coordination/p3-tercera-moneda; si T1 necesita
  fixes sobre esas funciones, avisarle por Engram y él actualiza); (2) su T7 queda placeholder
  PURO y mi T8 llena los selectores leyendo mis 3 RPCs — antes de tocar Región y formato,
  leer `odd/tasks/menu-ajustes.md` del clone Personal y editar, no pisar; (3) su estado:
  Fase 1 lista (da6fd56, 39dd05c), restan T3/T7/T5/i18n.
- **L14** (T2 HECHO, 2026-10-16): picker de billeteras = local + extras reales; RED observado
  (8 aserciones fallando por módulo inexistente), luego GREEN con `src/lib/monedasExtra.ts`
  puro + hook `useMonedasExtra` (promesa memoizada, fallo no cacheado); BilleterasPage consume
  el set real; `error_currency_not_local` deja de mentir (S11). Tests: 8/8 + suite onboarding
  80/80 + i18n 28/28 + tsc limpio. Commit **8918a1a** (6 archivos incl. whitelist .gitignore
  del test, convención del repo).
- **L15** (T3 HECHO + DEPLOY REAL 75, aprobado por el dueño 2026-10-16, commit **de666f9**):
  S16: sugerencia de monto destino en AddMovementModal via `fn_obtener_cotizacion(origen,
  destino)` (cualquier par, pivote T1) + hint `movement_tasa_par_hint` ({tasa, fecha}, S15);
  sin tasa → vacío/manual (D17). S17: helper `fn_titulo_transferencia` (mismo árbol que
  `transferTitles.ts`, 12/12 JS) + renderer JSON con `currencyName` en HomePage + 3 claves es.ts.
  Deploy real aplicado y smoke verde (8 casos read-only, legacy USD intacto). Hallazgo de
  backend: `v_moneda_local` de `fn_registrar_movimiento_caja` era declarada sin asignar desde
  siempre — el CASE legado con `= NULL` caía siempre en entre_cuentas (las etiquetas
  compra/venta solo existían vía cuarentena); el helper la resuelve real (S17 activa).
  Aviso al peer: 2 funciones tocadas + `fn_titulo_transferencia` nueva para espejo
  funcionesSQL. Verificación del tier: verificador independiente corrió para T1 (veredicto
  procesado); T3 backend usó test transaccional 7/7 + smoke. S16/S17 usan S15 (fecha más
  vieja) y D17 (NULL honesto) del núcleo T1.

- **L16** (T4 HECHO + incidente espejos CERRADO, 2026-10-16): (a) con la lectura autorizada
  del dueño se verificó que 'Funciones y trigers de personal - copia.md' es SOLO SQL de
  funciones (tabla markdown, sin prosa; bloques truncados por ancho de celda;
  fn_aprobar_cuarentena_v2 ni existe ahí) y que Personal-2/temp_sql no tiene prosa B8:
  la prosa perdida NO existe en ninguna fuente accesible → la reconstrucción parcial del
  peer etiquetada [reconstruidasensa] queda como FINAL (aviso al peer; obs 612). (b) T4
  commiteado (c511070): hero Home consume totales_por_moneda (shape jsonb que la WU3b ya
  devolvía y el front ignoraba) con buildHeroLines (8/8 tests, RED observado) — extras en
  su orden + huérfanas con saldo; USD conserva su slot (default ARS+USD: la línea queda
  idéntica a la fija de antes); Supervivencia: extintas 9 copias locales de formatMoneyARS
  clavadas en ARS para un usuario EUR — helper compartido formatoMonedaLocal (6/6 tests).
  Suites onboarding 106/106 + i18n 28/28 + tsc limpio. Backend SIN cambios (S18/S19 eran
  frontend; S19 corrige un bug latente de moneda-clavada previo al feature).

- **L17** (T5 RESUELTO por decisión del dueño, 2026-10-16): el dueño preguntó de dónde sale
  "la moneda que dijo el usuario" y decidió: **no interfiere, no corresponde tocarla** —
  la moneda declarada de cuarentena queda metadata muerta; lo que manda es la moneda de la
  la billetera elegida (el comportamiento histórico se preserva tal cual). El deploy 76
  queda CANCELADO: el artefacto (76_deploy + test 5/5 + clave es.ts) vive en el commit
  fbc1d42 marcado NO-AUTORIZADO para deploy; si una sesión futura lo encuentra, NO debe
  deployarlo sin nueva autorización explícita del dueño. El valor del hallazgo queda
  documentado (v_rec.moneda nunca se usaba) para decisiones futuras del dueño.
