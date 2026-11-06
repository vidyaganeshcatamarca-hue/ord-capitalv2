# Tarjetas — validación conversada y plan de corrección

**Documento de traspaso.** Contiene todo lo necesario para retomar el trabajo sin la
conversación original. Si esta sesión se compactó, **empezá por acá**.

- **Objeto:** módulo Tarjetas de ORD Capital (worktree `Personal-2`).
- **Origen del trabajo:** `docs/varias/ORD_Capital_Tarjetas_Consolidado_Para_Correccion_2026-10-30.md`.
- **Contrato de referencia:** `docs/varias/prd-tarjetas.md` (PRD funcional del módulo).
- **Evidencias de la auditoría original:** `C:/Users/Vidya Ganesh/.pi/agent/bug-explorer/evidence/personal-10c0981d01be/bx-full-tarjetas-20261030-c/reports/report.md` y sus `shot-*.png`.

## Cómo se trabaja este documento

1. **Un problema por vez.** No se presentan listas de defectos con preguntas acumuladas.
2. **Nada se afirma sin comprobarlo.** Cada hallazgo arranca como hipótesis. Estados posibles:
   CONFIRMADO EN EJECUCIÓN · RESPALDADO POR CÓDIGO SIN REPRODUCCIÓN · CONTRADICHO POR LAS
   PRUEBAS · NO CONFIRMADO · DECISIÓN DE PRODUCTO · DESCARTADO.
3. **No se modifica nada durante la validación.** El dueño decidió: *"revisamos todo hasta el
   final, y luego corregimos todo junto"*.
4. **La decisión funcional es del dueño.** Si el comportamiento depende de una regla no
   aprobada, no es un defecto: es una decisión.
5. **Las observaciones del dueño son evidencia.** Cuando contradicen un informe, se investiga
   la discrepancia; no se da por cierto el informe.
6. **Nunca decir "verifiqué la interfaz" si solo se leyó código.**

## Entorno de prueba (cuenta sandbox)

- **Cuenta:** `arieldere75@gmail.com` (Google). Moneda local **GBP**, cotización USD **0,7492**.
- **Login con ego-browser:** ir a `https://www.ordcapital.app/auth` → botón "Comenzar" →
  "Continuar con Google" → la fila de la cuenta es `div[data-email="arieldere75@gmail.com"]`
  (no es un `<a>`). Esperar a que aparezca en `localStorage` una clave que termine en
  `-auth-token`; de ahí se toma `access_token` para llamar a las RPC por REST.
- **Los refs de `ego_open` no resuelven en llamadas posteriores.** Usar selectores CSS o
  `div[data-email=...]`. Al cerrar el task space se pierde la sesión de Supabase.
- **Llamadas RPC desde script:** `POST {VITE_SUPABASE_URL}/rest/v1/rpc/{fn}` con headers
  `apikey` (VITE_SUPABASE_ANON_KEY) y `Authorization: Bearer {access_token}`. Ambas claves se
  leen de `.env.local` del worktree.
- **Lectura de funciones desplegadas:** `POST https://api.supabase.com/v1/projects/{ref}/database/query`
  con `Authorization: Bearer {ACCESS_TOKEN}` y
  `{"query":"select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='...'"}`.
  Es la única forma confiable: **los espejos `funcionesSQL/` no están versionados y pueden
  estar atrasados** (viven solo en el worktree `Personal`; `Personal-2` tiene 3 archivos).

### Estado base de la cuenta (usar para verificar limpieza)

| Dato | Valor |
|---|---|
| Tarjeta | id **821**, "Ttt", cierre **5**, vencimiento **10** |
| Cuotas pendientes | 3: **500** y **25** con vencimiento 2026-11-10; **25** con vencimiento 2026-12-10 |
| Deuda total | **550** |
| Saldo a favor | **200** |
| Billetera 1358 | GBP, saldo **1.279,91** (es la que se usa para pagar) |
| Otras billeteras | 1359 GBP 630 · 1375 ARS 150.372,26 · 1376 BRL 18.702,52 |
| Comparativa | **0 filas** |
| Archivadas | **0** |
| Categoría para altas de prueba | `estructura_egreso_id = 4272` |

### Reglas de limpieza

- Deshacer un pago: `fn_eliminar_pago_tarjeta_grupo({ p_pago_caja_id })`.
- Deshacer una compra: `fn_eliminar_movimiento_caja({ p_caja_id })`.
- Deshacer una carga de cuotas históricas: `fn_eliminar_carga_cuotas_historicas({ p_carga_id })`.
- **Siempre** verificar al final los seis valores de la tabla de arriba. Todas las pruebas
  hechas hasta ahora se revirtieron y se verificaron.

## Decisiones tomadas (comportamiento aprobado)

| # | Qué | Decisión aprobada |
|---|---|---|
| 1 | **TC-01** La Comparativa suma dólares como si fueran moneda local | Convertir la parte en dólares a moneda local con la cotización y mostrar **un único importe** por ciclo. El importe debe llevar la **moneda real** del usuario (hoy dice "ARS" a mano). Sin cotización: avisar que no se puede calcular, **no inventar**. |
| 2 | **TC-02a** La deuda total del bloque superior suma monedas sin convertir | Mostrar el **total convertido** como número grande y, **debajo y más chico**, la porción en dólares. Sin cotización: el grande muestra solo la parte en moneda local y la línea chica avisa la porción sin convertir. |
| 3 | **TC-02b** Moneda sin cotización: el mapa devuelve 1:1 | Cuando falte la cotización, la **ventana de pago pide el valor del dólar** que cobró el banco y calcula con ese número. Mismo criterio (avisar, no inventar) para "Disponible" y "% utilizado". El reporte de tarjetas debe devolver **NULL**, no 1.00. |
| 4 | **TC-03b** El pago desde la pantalla no liquida cuotas ni refinancia | El comportamiento correcto es el que hoy funciona **sin** objetivo: marcar pagadas las cuotas del resumen, consumir el saldo a favor y **crear la cuota refinanciada** por el faltante. |
| 5 | **TC-04** El mensaje de tendencia ±20 % no aparece | **No se implementa.** Decisión de diseño: la Comparativa queda como está. Hay que actualizar el PRD (R-CM-02) o la próxima auditoría lo reportará como defecto. |
| 6 | **TC-05** La cantidad de cuotas acepta decimales y los trunca | **Rechazar** el decimal con un mensaje que pida un número entero. |
| 7 | **TC-06** El botón Confirmar se bloquea sin explicar | Mostrar **el motivo debajo del botón** cuando está bloqueado (patrón que ya usa "Cargar movimiento"). |
| 8 | **TC-07** La leyenda promete 12 ciclos y el cálculo topa en 6 | **Subir el tope del cálculo a 12.** Las barras siguen siendo 6. Los porcentajes de abajo **van a cambiar** en tarjetas con más de 6 meses de historia. |
| 9 | **TC-08** El rechazo de archivado muestra el código interno | Texto: **"No podés archivar esta tarjeta porque tiene cuotas o compromisos pendientes. Terminá de pagarlos y volvé a intentar."** Traducir a los tres idiomas. |
| 10 | **TC-09** La confirmación de archivado muestra código | **Un solo texto** para los dos lugares donde se archiva: **«¿Archivar "X"? Va a salir de tu lista, pero no se borra nada: podés volver a activarla cuando quieras desde «Ver archivadas».»** Traducir a los tres idiomas. |
| 11 | **P-01** Porcentajes con punto e importes con coma | Respetar el **separador decimal configurado** y dejar **un solo decimal**. |
| 12 | **P-02** El importe precargado trae decimales de más | **Redondear** la precarga a los decimales configurados de la moneda. |
| 13 | **P-03** El orden ignora los dólares cuando falta cotización | El orden usa **solo los pesos** cuando falta la cotización, y la regla **queda escrita** en la especificación. |
| 14 | **G-01** Cuatro textos fijos en español | Traducir los **tres visibles** ("Editar", "+ Agregar Tarjeta", "Activar") y **recuperar el cartel "cuotas liquidadas"**, arreglando el contador que hoy da siempre 0. |
| 15 | **G-02** Una tarjeta archivada sigue apareciendo en la Comparativa | **Sacarlas**: la Comparativa filtra las archivadas, igual que la lista. |
| 16 | **G-04** El historial de pagos se separa por nombre y se corta en 50 sobre el total | **El historial se pide por tarjeta**: la consulta recibe la tarjeta, devuelve solo ese historial y el tope de 50 se aplica **por tarjeta**, no al total. La pantalla deja de filtrar por nombre. |
| 17 | **G-03** La cotización arranca en 1 antes de la primera carga | **A**: alinear el valor inicial con su propio comentario ("sin cotización"), sin tocar los `?? 1` de la ventana de pago (esos son TC-02b). |
| 18 | **G-05** El aviso de "no hay archivadas" es inalcanzable | **B → DESCARTADO.** No es un defecto: nada se rompe y nadie se queda sin reactivar. Se deja la rama muerta. |
| 19 | **Y-01** El aviso de atraso usa los dias del futuro | **Se elimina el cartel de atraso del detalle.** El recuadro "Proximo Vencimiento" vuelve a mostrar siempre "Dia X (N dias)". El resumen impago se informa una sola vez, arriba de la pestana, donde ya estan el total, el monto a pagar, el saldo a favor y el boton de pago. Sin cambios en Supabase. |
| 20 | **Y-02** El aviso dice "1 cuotas cargadas" | **A**: singular y plural con el patron que la app ya usa (`cards_active_one` / `cards_active_other`), en los tres idiomas. Nada de "cuota(s)": el verbo tambien concuerda. |
| 21 | **Y-05** Error al adelantar una cuota futura | **DESCARTADO.** No es un defecto: la validacion desplegada, ejecutada con los mismos valores que mande, **no falla**. El error fue del agente. De paso queda aclarado que **si existe** el camino para saldar cuotas futuras desde la pantalla (`p_cuotas_adelantar`, lista de seleccion en `TarjetasPage.tsx:2695`), asi que la preocupacion de G-02 ("no se puede archivar una tarjeta con cuotas futuras") **no es real**. |
| 22 | **X-01..X-09** Nueve calculos suman cuotas sin moneda | **Se corrigen las cuatro vivas**: X-01 alertas del Inicio, X-02 calendario financiero (Calendario + Saneamiento), X-06 radar de asfixia (Supervivencia) y X-07 serie de ciclos (barras de la Comparativa). Mismo patron que la decision 1. **Las cinco muertas** (X-03, X-04, X-05, X-08, X-09) no las llama nadie: quedan como deuda tecnica, no se tocan. |
| 23 | **Umbral 50.000 del calendario** | **Se elimina**: no puede haber un umbral de importe generico en una app global. Falta definir con que se reemplaza el estado `criticidad`, que hoy alimenta un punto de color (`CalendarioFinanciero.tsx:174`) y un contador de "eventos criticos" (`CalendarioWidget.tsx:12`). |

## Estado por hallazgo

### Cerrados

| ID | Título | Estado | Cómo se comprobó |
|---|---|---|---|
| TC-01 | La Comparativa suma USD como si fuera moneda local | CONFIRMADO EN EJECUCIÓN | Una cuota de US$ 100 venciendo en el ciclo comparado: la alerta de resumen mostró **74,92 GBP** y la Comparativa **100,0 ARS** en la misma pantalla. |
| TC-02a | La deuda total suma monedas sin convertir | VALIDADO | Lectura del cálculo desplegado: `SUM(monto_cuota)` sin distinguir moneda. El informe lo describió mal ("inventa un cambio 1:1"): no convierte nada. |
| TC-02b | Sin cotización el mapa devuelve 1:1 | RESPALDADO POR CÓDIGO | `COALESCE(...,1.00)` en el mapa desplegado, contra `NULL` en `fn_obtener_cotizacion_usd`. El dueño corrigió al agente: **no es un caso raro**, la app es global. |
| TC-03b | El pago no liquida ni refinancia | CONFIRMADO EN EJECUCIÓN | A/B: pagar 100 **con** objetivo → la cuenta baja, las 3 cuotas siguen pendientes y el saldo a favor sube 200→300. Pagar los mismos 100 **sin** objetivo → 2 cuotas pagadas + cuota refinanciada de **225**. Discriminador: pedir objetivo "anterior" sin cuotas vencidas **sí** se rechaza con `error_resumen_sin_cuotas_pendientes`, así que el parámetro llega y la validación de la ventana funciona. |
| TC-04 | El mensaje de tendencia no aparece | CONFIRMADO EN EJECUCIÓN → **descartado por diseño** | Tarjeta con 1.000 en el ciclo anterior y 790 en el actual: el servidor devolvió `mensaje_key = alert_card_savings` y la pantalla no mostró ninguna frase. |
| TC-05 | Cuotas fraccionarias | CONFIRMADO EN EJECUCIÓN | Se escribió `1.5` en cantidad: el campo lo aceptó, el aviso dijo "1 cuotas cargadas" y se creó **una** cuota. `parseInt` recorta en silencio. |
| TC-06 | Botón Confirmar bloqueado sin explicación | CONFIRMADO EN EJECUCIÓN | Al abrir "Pagar Resumen": importe precargado 325, cuenta en "Seleccioná la cuenta...", botón deshabilitado y ningún texto. La otra mitad del informe (saldo insuficiente sin mensaje) fue **CONTRADICHA POR LAS PRUEBAS**: la app sí avisa y además borra lo escrito. |
| TC-07 | Leyenda 12 vs tope 6 | RESPALDADO POR CÓDIGO | `WHERE i < LEAST(COALESCE(p_ciclos,6),6) - 1` en la función desplegada. |
| TC-08 | El rechazo de archivado muestra el código | CONFIRMADO EN EJECUCIÓN | El aviso mostró `error_card_has_commitments`. La tarjeta quedó activa con su deuda: la protección funciona. |
| TC-09 | La confirmación de archivado muestra código | CONFIRMADO EN EJECUCIÓN | El cuerpo del cartel dice literalmente `t("card_archive_confirm_pending", { name: targetCard?.nombre_tarjeta })`. |
| P-01 | Porcentajes con punto e importes con coma | RESPALDADO POR CÓDIGO | Los porcentajes se escriben con `.toFixed(1)`, sin pasar por el formateador. En la cuenta sandbox el separador configurado es el punto, así que el contraste no se ve ahí. |
| P-02 | Precarga con decimales de más | RESPALDADO POR CÓDIGO | El importe se copia con `toString()`, sin redondear. No se reprodujo: el saldo a favor de la cuenta sandbox es 200,00 exacto. |
| P-03 | Orden ignora los dólares sin cotización | RESPALDADO POR CÓDIGO | `const cot = cotizacionUsd ?? 0` en el orden de la lista. |
| G-01 | Cuatro textos fijos en español | CONFIRMADO (los cuatro existen) | El dueño dijo "no es cierto, veo el historial en inglés". **Tenías razón en lo que viste**: el texto "cuotas liquidadas" está tapado por el defecto del contador (ver abajo). Los otros tres solo aparecen en estados concretos: tooltip del lápiz, pantalla sin tarjetas, y bloque de archivadas desplegado. |
| G-02 | Archivada sigue en la Comparativa | RESPALDADO POR CÓDIGO | La consulta desplegada **no filtra `activa`**. No se pudo fotografiar: archivar exige saldar hasta la última cuota futura y la ventana de pago no llega a la de diciembre. |

### Cerrado en la segunda tanda

| ID | Título | Estado | Cómo se comprobó |
|---|---|---|---|
| G-04 | Historial de pagos separado por nombre y cortado en 50 sobre el total | RESPALDADO POR CÓDIGO | `fn_reporte_historial_pagos_tarjetas` **no recibe tarjeta**: devuelve todos los pagos del usuario con `LIMIT 50` global; el front separa con `h.tarjeta_nombre === card.nombre_tarjeta`. **Dos efectos:** (a) dos tarjetas homónimas mezclan historial; (b) el tope de 50 es global, así que los pagos viejos desaparecen en silencio del historial de su tarjeta. El nombre sale de `t.nombre_tarjeta` (join por `tarjeta_id`), así que **renombrar no rompe el historial**. No se reprodujo: haría falta >50 pagos o una tarjeta homónima (irreversible, no se pueden borrar tarjetas). Ese mismo reporte devuelve `COALESCE(c.moneda,'ARS')` → otra etiqueta fija (Y-03). |

### X-01..X-09 — verificacion de las nueve (hecha 2026-10-31)

Metodo: inventario desde la base (`pg_get_functiondef` ilike `p_cuotas_detalle`), no desde la lista del informe. **18 funciones** suman cuotas sin nombrar la moneda; 9 son las del informe y el resto son operativas o versiones viejas.

**Hallazgo principal: 5 de las 9 no las llama nadie.** Ni el front ni ninguna otra funcion SQL.

| # | Funcion | Pantalla que la usa | Suma sin moneda | Estado |
|---|---|---|---|---|
| X-01 | fn_reporte_alertas_home | **HomePage** | `SUM(cd.monto_cuota) AS monto` | VIVA |
| X-02 | fn_reporte_calendario_financiero | **CalendarioFinanciero + SaneamientoPage** | `cd.monto_cuota AS monto`, 2 SUM y umbral `> 50000` | VIVA |
| X-06 | fn_reporte_radar_asfixia | **SupervivenciaPage** | `SUM(ct.monto_cuota + cd.monto_cuota) AS egreso_t` | VIVA |
| X-07 | fn_reporte_serie_tarjetas | **TarjetasPage** (serie de ciclos de la Comparativa) | `SUM(cd.monto_cuota)` por ciclo | VIVA |
| X-03 | fn_reporte_limite_seguro_deuda | **NADIE** | 2 SUM | MUERTA |
| X-04 | fn_reporte_plan_ataque_deudas | **NADIE** | `d_saldo` por tarjeta + HAVING | MUERTA |
| X-05 | fn_reporte_punto_equilibrio | **NADIE** | v_pago_minimo_deudas + SUM por mes | MUERTA |
| X-08 | fn_reporte_simulador_impacto | **NADIE** | SUM cuotas futuras + cuota simulada | MUERTA |
| X-09 | fn_reporte_timeline_proyeccion | **NADIE** | 3 SUM (tarjetas, prestamos, comprometido) | MUERTA |

Matices comprobados:
- **`p_compromisos_tarjeta` NO tiene columna `moneda`** (103 filas). Las sumas de esa tabla no pueden mezclar monedas: solo la parte de `p_cuotas_detalle` mezcla. Varias de las nueve suman las dos.
- **Umbral hardcodeado en escala ARS**: `fn_reporte_calendario_financiero` marca `'critico'` con `cd.monto_cuota > 50000`. Para un usuario en GBP eso no se enciende nunca. Defecto propio, independiente de la moneda de las cuotas.
- **La Comparativa tiene DOS defectos de moneda, no uno**: las filas (TC-01, `fn_reporte_comparativa_tarjetas`) y **la serie de ciclos** (`fn_reporte_serie_tarjetas`, X-07). Corregir TC-01 no arregla las barras.
- **El sentido del error depende del pais**: con moneda local ARS (1 USD ~ 1000 ARS) una cuota de US$ 100 se suma como 100 y la deuda queda **subestimada casi por completo**; con GBP (0,7492) queda **sobrestimada ~33 %**. La direccion peligrosa es la primera: la app te dice que debes menos.
- El arreglo de las vivas es el mismo patron de la decision 1 (separar por moneda, convertir con la cotizacion, y sin cotizacion avisar). Las muertas se pueden borrar o dejar sin tocar.

### Pendientes de presentar al dueño (empezar por acá)

| ID | Título | Estado | Notas |
|---|---|---|---|
| **TC-03a** | La cuota refinanciada mostraría `{total}` en la posición | NO CONFIRMADO | Hoy es inalcanzable porque TC-03b impide que se cree cualquier cuota refinanciada. **Re-verificar después de corregir TC-03b**: puede haber desaparecido o puede reaparecer. |
| **G-03** | La cotización arranca en 1 antes de la primera carga | SIN EFECTO VISIBLE | `useState<number \| null>(1)` en `:231` con el comentario "NADA se inventa con tasa 1" al lado. **No es alcanzable en pantalla**: el único consumidor que puede dibujarse antes de cargar son las alertas, y están vacías hasta que llegan los datos, que entran en el mismo lote que la cotización. Los `?? 1` que sí están vivos son los de la ventana de pago (`:640,645,647,650,708,1930,2041,2117`) y pertenecen a TC-02b (decisión 3). |
| **G-05** | Rama inalcanzable en el bloque de archivadas | CONFIRMADO POR LECTURA | El mensaje de "no hay archivadas" vive dentro de un bloque que solo se dibuja si hay archivadas. |
| **Y-03** | Etiquetas de moneda local que dicen "ARS" a mano | CONFIRMADO POR LECTURA | Incluye "Pagado ARS: {monto}" y "{monto} ARS a favor" en la ventana de pago, además del `?? 'ARS'` de la Comparativa. **Se cubre con el arreglo de TC-01 / TC-02a.** |
| **Y-04** | El contador de "cuotas liquidadas" siempre da 0 | CONFIRMADO POR LECTURA | El historial cuenta cuotas con `cd.p_caja_id = c.p_caja_id AND pagado`, pero la liquidación **conserva el `p_caja_id` de la compra** (cambio del 2026-09-15). Por eso el cartel nunca aparece. **Se arregla como parte de G-01.** |
| **X-01..X-09** | Alrededor de nueve cálculos más suman cuotas de tarjeta sin distinguir moneda | NO CONFIRMADO (ninguno verificado) | Detectados listando las funciones que leen `p_cuotas_detalle`: alertas de Home, calendario financiero, límite seguro de deuda, plan de ataque de deudas, punto de equilibrio, radar de asfixia, simulador de impacto, timeline de proyección, serie de tarjetas. **Solo está comprobado que no mencionan la moneda**, que es la condición que produjo TC-01. El dueño pidió sumarlos al proyecto. |

## Hechos técnicos comprobados (no repetir la investigación)

- **`fn_reporte_comparativa_tarjetas`** (desplegada): el `RETURNS TABLE` **no tiene `moneda`**;
  hace `SUM(cd.monto_cuota)` sin agrupar por moneda; **no filtra `t.activa`**; tampoco filtra
  `pagado` (cuenta cuotas ya pagadas: es "uso", decisión de diseño).
- **`fn_reporte_mapa_tarjetas`** (desplegada): `cotizacion_usd = COALESCE((select valor_por_usd ...), 1.00)`;
  separa el consumo por moneda (`SUM(CASE WHEN cd.moneda = v_moneda_local ...)` y `... = 'USD'`)
  y los combina con la cotización para `un_pago_disponible`.
- **`fn_obtener_cotizacion_usd`**: devuelve **NULL** cuando no hay fila en `p_divisas`. De ahí la
  contradicción con el mapa.
- **`fn_obtener_saldo_pasivo_tarjetas`**: `COALESCE(SUM(cd.monto_cuota),0)` sin moneda. Su único
  consumidor es la pantalla de Tarjetas.
- **`fn_registrar_gasto_tarjeta` tiene DOS sobrecargas**: una de 6 parámetros (vieja, sin
  moneda) y una de 10 con `p_es_usd`. Solo la de 10 maneja dólares: con `p_es_usd = true` pone
  `moneda = 'USD'` y guarda el **monto nativo en dólares**. Eso es diseño correcto y **no se toca**.
- **`fn_liquidar_ciclo_tarjeta_multi`** (una sola sobrecarga, 9 parámetros): tiene el bloque de
  refinanciación intacto (`IF v_refinanciado_ars > 0 THEN INSERT ... p_cuotas_detalle ...`) y las
  condiciones de ventana con `p_cuotas_desde` / `p_cuotas_hasta`. El `UPDATE` de la cuota solo
  pone `pagado = true` (**conserva el `p_caja_id` original**, por eso Y-04).
- **`fn_registrar_pago_tarjeta_multi`** (9 parámetros): calcula `v_prox_venc` con **`CURRENT_DATE`**
  (no con `p_fecha_pago`), arma la ventana del objetivo, valida que haya al menos una cuota
  pendiente en ella (si no, `error_resumen_sin_cuotas_pendientes`), crea las filas de `p_caja` y
  llama a `fn_liquidar_ciclo_tarjeta_multi(p_tarjeta_id, v_user_id, p_fecha_pago, v_primer_caja_id,
  v_pagos_aplicados, v_cotizacion_usd, 0, v_objetivo_desde, v_objetivo_hasta)`.
  **Con la ventana seteada la liquidación no encuentra las cuotas; sin ventana, sí.** La línea
  exacta que falla **no está identificada**: leerla de punta a punta no alcanzó. Al corregir hay
  que instrumentar contra el escenario ya armado.
- **`fn_registrar_pago_tarjeta_multi` acepta `p_cotizacion_usd` y lo respeta si no es NULL, pero
  la pantalla nunca se lo manda.** Por eso la decisión 3 no requiere cambios de base para el
  valor manual: es agregar el campo y pasarlo.
- **`fn_reporte_serie_tarjetas`**: `WHERE i < LEAST(COALESCE(p_ciclos,6),6) - 1` → tope duro 6.
- **`fn_reporte_historial_pagos_tarjetas`**: `cuotas_liquidadas` cuenta
  `cd.p_caja_id = c.p_caja_id AND pagado = true` → siempre 0 (ver Y-04).
- **Front (`src/pages/Tarjetas/TarjetasPage.tsx`)**:
  - `:314` pide `p_ciclos: 12`; `:1507-1516` corta a 6 barras y promedia sobre "disponibles".
  - `:348` `const cantidad = parseInt(legacyCantidad)` (TC-05).
  - `:498` precarga con `faltaArs.toString()` (P-02).
  - `:542` `const cot = cotizacionUsd ?? 0` (P-03).
  - `:906` `title="Editar"`, `:1107` "cuotas liquidadas", `:1433` "+ Agregar Tarjeta",
    `:1469` "Activar" (G-01).
  - `:1056` `t('cards_installment_due', { position, total: c.total_cuotas, date })` (TC-03a).
  - `:1283` y `:1679` los dos `message={\`t("card_archive_confirm_*", …)\`}` (TC-09).
  - `:1518` `const isSaving = c.variacion_porcentual < -20` (umbral recalculado; sin efecto al
    descartarse TC-04).
  - `:1570-1577` `fmtMoneda(c.gasto_mes_*, (c.moneda ?? 'ARS'))` (TC-01 / Y-03).
  - `:1930` `cotizacionUsdModal = Number(targetCard?.cotizacion_usd ?? 1)` (TC-02b).
  - `:2132` `submitDisabled = formSubmitting || lineasInvalidas || !submitEnabled || overBudget`
    (TC-06: sin texto que lo explique).
  - `:2367` y `:2522` el `onBlur` que borra el importe y avisa `error_wallet_saldo_excedido`.
  - `:231` `useState<number | null>(1)` para la cotización (G-03).
  - `:411-416` historial filtrado por `h.tarjeta_nombre === card.nombre_tarjeta` (G-04).
  - `:496` `setPagoObjetivo(origen)` y `:507` `setShowPagarModal(true)`: **el objetivo se fija
    siempre** y es el único lugar que abre la ventana de pago → **todo pago desde la pantalla
    pasa por el camino roto de TC-03b**.
- **Diccionarios**: `alert_card_overuse|savings|stable` **no existen** en `es/en/pt`.
  `card_trend_overuse|savings|stable` existen y están sin uso. `error_card_has_commitments`
  **no existe** en ningún diccionario. `cards_installment_due` (es.ts:237) contiene `{total}`.
  `card_trend_*` y `card_archive_confirm_*` viven en `es.ts` alrededor de las líneas 2253-2283.
- **Paridad de diccionarios:** `tests/i18n/dictionary-parity.test.js` exige **las mismas claves
  y los mismos placeholders** en los tres idiomas. Toda clave nueva va en los tres.
- **Alcance de los cambios:** `fn_obtener_saldo_pasivo_tarjetas`, `un_pago_disponible`,
  `un_pago_consumido_*`, `cuotas_disponible` y `cotizacion_usd` se leen **solo** en la pantalla
  de Tarjetas. Nada fuera de esa pantalla se ve afectado.
- **`funcionesSQL/` y `docs/` están gitignoreados** y los espejos pueden contener dos o tres
  cuerpos concatenados de la misma función: prueban qué se escribió, **no qué corre**.

## Evidencias guardadas

| Archivo | Qué muestra |
|---|---|
| `C:\temp\tc01-comparativa-2.png` | La misma pantalla con **74,92 GBP** en la alerta y **100,0 ARS** en la Comparativa (TC-01) |
| `C:\temp\tc01-comparativa-sandbox.png` | Vista completa de esa comparativa |
| `C:\temp\tc04-comparativa-sin-mensaje.png` | Comparativa con "21.0%" y sin ninguna frase de tendencia |
| `C:\temp\tc05-cantidad-decimal.png` | El aviso "1 cuotas cargadas" y la única cuota creada a partir de `1.5` |
| `C:\temp\tc06-sin-explicacion.png` | Pagar Resumen con el botón deshabilitado y sin explicación |
| `C:\temp\tc09-confirmacion-literal.png` | El cartel de confirmación con el `t("...")` literal |
| `C:\temp\tc08-error-crudo.png` | El aviso `error_card_has_commitments` |

## Plan de corrección (no iniciado)

**Nada está autorizado para implementar todavía.** El dueño pidió revisar todo primero.

1. **Cambios de frontend (sin tocar la base):** TC-05, TC-06, TC-08, TC-09, P-01, P-02 y los
   tres textos de G-01.
2. **Cambios en Supabase (requieren autorización explícita y el SQL mostrado antes de ejecutar,
   por las reglas 0 y 1 del proyecto):** TC-01 (devolver y usar la moneda), TC-02a (convertir el
   total), TC-02b (mapa devuelve NULL), TC-03b (camino del pago), TC-07 (tope 12), Y-04 (contador
   del historial) y G-02 (filtrar archivadas).
3. **Actualizar el PRD** para que la próxima auditoría no reporte como defecto lo que ahora es
   decisión aprobada: **A-03 / F-05** (deuda total), **R-CM-02** (mensaje de tendencia: no se
   muestra) y **R-LM-06** (orden sin cotización: solo pesos).
4. **Re-verificar TC-03a** después de corregir TC-03b.
5. **Estrategia de pruebas:** los siete escenarios de esta validación ya están descriptos y se
   pueden convertir en pruebas dirigidas. Ramas: **nunca** commitear en `main` ni en `produccion`.

## Log de la conversación (citas literales del dueño)

- **L1:** informe consolidado de Bug Explorer; trabajar sobre el módulo tarjetas.
- **L2:** *"tc-01 / no veo el error, revisa minusiosamente… Revisa tu la UI directamente"*.
- **L3:** el agente reprodujo TC-01 en vivo → confirmado en ejecución.
- **L4:** *"que las cuotas se guarden en dolares esta bien, es diseño. Que el monto se mezcle dolar y
  moneda local esta mal, es bug. debe convertirse a moneda local me parece. Elegimos B."*
- **L5:** *"tc-01 cerrado"*.
- **L6 (TC-02a):** *"Estas sumando peras con manzanas, no podes sumar moneda local con dolares, ya lo
  hablamos antes. Hay que convertir o mostrar la deuda en moneda local, y mas pequeño la deuda en
  dolares. Esta segunda opcion es mas limpia."*
- **L7 (TC-02b):** *"no es probabilidad baja de aparecer. La app es global, y puede haber un pais que
  no tengamos cotizacion. Elijo la opcion 2."*
- **L8:** *"esos posibles errores conviene que los abordemos ahora que los tenemos detectados.
  Sumalos a este proyecto. estoy de acuerdo con tu propuesta, adelante, continuemos"*.
- **L9 (prioridad):** *"revisamos todo hasta el final, y luego corregimos todo junto. vas guardando tus
  deciciones? usa engram"*.
- **L10 (TC-04):** *"no quiero el mensaje en pantalla, asi como esta esta bien. decicion de diseño"*.
- **L11 (TC-05):** *"A."*
- **L12 (TC-06):** *"A."*
- **L13 (TC-07):** *"B"*
- **L14 (TC-08):** *"usa la primera, y traducir a los diccionarios"*.
- **L15 (TC-09):** *"texto unico"*.
- **L16 (P-01):** *"corrige los porcentajes asi: respetas el delimitador decimal regional de
  configuraciones, pero dejas solo un decimal"*.
- **L17 (P-02):** *"A"*.
- **L18 (P-03):** *"A"*.
- **L19 (G-01):** *"traducimos los tres textos y recuperamos el cartel"*.
- **L20 (G-02):** *"A. las sacamos."*
- **L21 (G-04):** *"A"*
- **L22 (G-03):** *"A"*
- **L23 (G-05):** *"B"*
- **L24 (Y-01 primera propuesta):** *"Corregimos el error mostrando solo el cartel 'Tarjeta Vencida', sin la cantidad de dias"*
- **L25 (Y-01):** *"entonces cambio de opinion, pero antes explicame bien por que aparece ahi un cartel de la tarjeta vencida cuando ya se informo en otro lugar que tenemos una cuota de tarjeta vencida, por que lo volvemos a poner ahi?"* -> se compararon las dos condiciones: el cartel del detalle es un subconjunto del de arriba, y encima mas debil (umbral "antes de hoy" vs "antes del dia 1 del mes del proximo vencimiento). Redundante.
- **L26 (Y-01 final):** *"A"* (sacar el cartel del detalle)
- **L27 (Y-02):** *"A"*
- **L28 (Y-05):** el agente reporta que su propio error de llamada genero el fallo; no hay defecto. Y se aclara que la pantalla **si** permite adelantar cuotas futuras.
- **L29 (X + umbral):** *"corrige las 4. Sobre el umbral debes quitarlo porque no podemos tener un umbral generico en una app global."*
