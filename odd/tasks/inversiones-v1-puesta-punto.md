# Feature: Inversiones v1 — puesta a punto para estreno

Evaluación completa del módulo (frontend + backend desplegado en Supabase) cerrada el
2026-10-16: la v1 está construida y desplegada, sin estrenar por el dueño, con bugs
conocidos. El dueño autorizó la puesta a punto de bugs primero. Rama de trabajo:
`pi/inversiones-v1-puesta-punto` (a crear desde `feat/pin-huella`, que es el trunk de
hecho; origin/main está 537 commits atrás).

## Specs

- **S1** (pedido original): "Revises la documentación del módulo de inversiones, el
  código desarrollado y podamos evaluar en qué etapa está, qué hace falta para su
  implementación, si es que no está implementado y nada, un panorama completo, usa la
  skill brainstorming para asegurarte de que lo implementado está completo o para
  detectar si están faltando algún servicio, yo todavía no lo he probado en la app, pero
  segur amente le faltan cosas, investiga y presentame preguntas para que nos quedemos de
  acuerdo a ver cómo seguimos con este tema."
- **S2** (ruta autorizada, L2, verbatim): "puesta a punto de bugs primero. Ten en cuenta
  el desarrollo de monedas, segunda y tercera moneda, ahora dolar no esta fijo como
  segunda moneda, puede cambiar, puede no estar. Monedas nada hardcodeado, tenemos
  moneda local, segunda y tercera" — restricción transversal: cero monedas hardcodeadas
  en el módulo; usar p_config_region.moneda_default + fn_valor_a_moneda_local (pivote
  p_divisas.valor_por_usd), como el hero del Home (fn_reporte_patrimonio_neto).
- **S3** (patrimonio del módulo, L2, verbatim): "un total en la moneda local + un
  subtotal por monedas".
- **S4** (tipo de activo, L2, verbatim): "No, alcanza PF/variable" — NO migrar la columna
  tipo_activo en esta etapa; los reportes siguen derivando plazo_fijo/variable; los 5
  tipos del formulario quedan cosméticos.
- **S5** (patrimonio global, L2, verbatim): "No, solo en el módulo" —
  fn_reporte_patrimonio_neto NO se toca; las inversiones no cuentan en el hero del Home.
- **S6** (bugs a cerrar, hallazgos de la evaluación L3):
  1. `fn_crear_inversion` no setea `ultima_conciliacion` → PF recién creada muestra
     semáforo rojo ("desactualizada, 0 días").
  2. `fn_crear_inversion` escribe `valor_mercado_actual = p_monto` siempre → el devengo
     automático de PF (fórmula TNA×días/365 de los reportes) nunca aplica. PF queda
     congelada en 0% hasta actualización manual.
  3. `fn_reporte_cartera_inversiones` no filtra por estado (las liquidadas aparecen en
     Cartera duplicadas contra Historial) y no devuelve `monto_liquidado` que el front
     espera (el rescate parcial calcula saldo restante con 0).
  4. `fn_reporte_historial_inversiones` no devuelve `moneda` → el track record formatea
     todo como ARS.
  5. `fn_liquidar_inversion` re-acredita el capital original completo aunque haya habido
     rescates parciales (monto_liquidado) → saldo de billetera inflado (doble conteo).
  6. 15+ keys i18n del backend inexistentes en es.ts → toasts con keys crudas
     (error_investment_already_liquidated, success_inflation_configured,
     error_investment_value_negative, etc.).
  7. El historial del detalle muestra los `detalle` crudos en inglés
     ('investment_prefix: Bitcoin', 'liquidation_gain: GGAL') sin traducir.
  8. ConfigInflacionView no precarga la config actual (no existe RPC de lectura);
     siempre muestra AR/proxy_dolar.
  9. `fn_reporte_patrimonio_inversiones` suma monedas mezcladas con
     `p_cotizacion_usd=1` hardcodeado desde el front (total "USD" falso);
     `fn_reporte_rendimiento_vs_inflacion` y `fn_reporte_distribucion_activos` también
     agregan monedas mezcladas.
- **S7** (categoría de Inversiones intocable, 2026-10-20, L6, verbatim): "Debe tener en
  cuenta que esa categoría que se crea no debe ser accesible desde el menú de
  categorías. No se le puede cambiar el nombre, es una categoría del sistema y no
  puede tener subcategorías. Tampoco se puede hacer una transacción manual a esa
  categoría de inversiones. Solo se accede a través de las operaciones del módulo de
  inversión. Deberíamos bloquear todo acceso por fuera de este módulo a esa
  categoría."
- **S8** (UX del módulo en móvil, 2026-10-20, L6, a partir de capturas del dueño): el
  módulo completo no entra en pantalla (header, pestañas y estado vacío se salen por
  la derecha); el botón "Ver Inversiones" de Supervivencia llevaba a billeteras; en
  Actividad Reciente aparece la key cruda `investment_prefix`.
- **S9** (acciones de los modales siempre accesibles, 2026-10-20, L7, medido con
  EgoLite en modo celular real — Pixel 7, 412x915): en los tres modales del módulo
  (Nueva Inversión, Actualizar Valor, Liquidar) las acciones están al FINAL del
  scroll dentro de la card (`max-height: 90vh; overflow-y: auto`), así que el botón
  "Guardar" queda fuera de la pantalla hasta que el usuario scrollea dentro del
  modal. Medido en "Nueva Inversión": card `scrollHeight` 867 vs `clientHeight` 822
  (45px de scroll), botón Guardar en `top: 895 / bottom: 940` con viewport de 915 →
  25px debajo del fold; recién tras scrollear queda en `bottom: 895`, pegado al
  borde inferior. Con el teclado abierto (el modal tiene inputs) el botón es
  inalcanzable. Requisito: las acciones quedan fijas al pie del modal, siempre
  visibles, y solo los campos scrollean.

## Tasks

| ID | Specs | Tarea | Ruta | Commit |
|----|-------|-------|------|--------|
| T1 | S6.1, S6.2 | SQL: `fn_crear_inversion` setea `ultima_conciliacion = CURRENT_DATE` y deja `valor_mercado_actual` NULL para plazo fijo (devengo vivo); variable sigue naciendo en capital | inline | `38de600` |
| T2 | S6.3, S6.4 | SQL: cartera solo `activas` + columna `monto_liquidado`; historial con columna `moneda` | inline | `821f217` |
| T3 | S3, S2, S6.9 | SQL: `fn_reporte_patrimonio_inversiones` → jsonb `{moneda_local, total_moneda_local, totales_por_moneda}` (solo activas, conversión por pivote); `fn_reporte_rendimiento_vs_inflacion` y `fn_reporte_distribucion_activos` agregan convertido a moneda local | inline | `432c13e` |
| T4 | S6.5 | SQL: `fn_liquidar_inversion` acredita solo lo no rescatado (`p_monto_total_retirado - monto_liquidado`), sin re-acreditar capital; labels capital/ganancia/pérdida sobre saldos restantes | inline | `a510ee5` |
| T5 | S6.8 | SQL: nueva `fn_obtener_config_inflacion` (GET país+fuente del usuario) | inline | `fcdf40e` |
| T6 | S3, S2, S6.9 | Front: `RendimientoRealWidget` consume el contrato nuevo: total en moneda local + una línea por moneda con saldo ≠ 0 (patrón hero Home); fuera la fila USD hardcodeada | inline | `ff02727` |
| T7 | S6.6, S6.7 | Front: 18 keys i18n en `src/locales/es.ts` (sección inversiones) + resolver de labels `key: valor` (`src/lib/inversionesLabels.ts`) cableado en `translateDetalle` (billetera, Home, detalle) | inline | `5412071` |
| T8 | S6.8 | Front: `ConfigInflacionView` precarga país+fuente vía T5; el pill refleja la fuente real (o "sin configurar") | inline | `549f709` |
| T9 | S2 | Verificación: test de contrato front↔SQL (9 tests, con mutación probada), postcheck de deploy, checklist de estreno manual para el dueño | inline | `86aad03` |
| T10 | S8 | Front: la página y el header del módulo entran en la pantalla del teléfono; Supervivencia enlaza a `/inversiones`; en modo claro el header deja de ser negro; las cuatro pestañas entran en una línea; "Distribución" pasa a llamarse "Gráfico"; el ejemplo del nombre del activo pasa a ser texto de ayuda debajo del campo | inline | `ab6d82e`, `4efffb2` |
| T11 | S7 | Categoría de Inversiones intocable: filtro en Categorías, triggers en backend (no renombrar, no borrar, no subcategorías, no movimientos manuales) y key/unicidad propias | inline | `e7ca268`, `f86b234` |
| T12 | S9 | Front: en los tres modales del módulo, las acciones (Cancelar/Guardar) quedan fijas al pie y siempre visibles; solo los campos scrollean dentro del modal | inline | `8d5cf56` |
| T13 | S10 | Pendiente: contraste AA de los acentos del módulo en modo claro. Los textos de acento van sobre un fondo del mismo color al 12% (`--mint-dim`, `--amber-dim`, `--coral-dim`) y el color de texto es ese mismo acento: el contraste queda entre 3.16 y 3.76 (AA pide 4.5). Medido: badge "Plazo Fijo" 3.32, badge "Variable" 3.16, botón "Actualizar Valor" 3.32, botón "Liquidar" 3.76, CTA "Configurá tu fuente de inflación" 3.64. En modo oscuro todos pasan (4.88 / 7.81). Plan: tokens de tinta por tema (`--mint-ink`, `--amber-ink`, `--coral-ink`) y sustitución mecánica de `color: var(--mint)` → `color: var(--mint-ink, var(--mint))` en los CSS del módulo (la tinta solo mejora el contraste: nunca lo baja) | pendiente | — |
| T14 | S9 | Pendiente: refinamientos que pidió el verificador independiente sobre T12. (a) `max-height: 90vh` → agregar `90dvh`: con el teclado abierto la barra fija queda detrás del teclado; el repo ya usa `dvh` en `AddMovementModal.css:26` y `VoiceRecorderModal.css:24`. (b) `env(safe-area-inset-bottom)` sin fallback `, 0px`: si `env()` es inválido se cae todo el `padding` de la barra. (c) el `border-top` de la barra no es full-bleed (queda dentro del padding de 20px de la card). (d) falta `-webkit-overflow-scrolling: touch` en el scroller nuevo. (e) el test no cubre que todos los campos sigan dentro del form ni que los ids sean únicos | pendiente | — |
| T15 | S10 | Pendiente: confirmar el hover de la pestaña activa. En una medición la pestaña activa apareció con texto claro sobre fondo verde (ratio 2.43): `hover` tiene especificidad (0,2,0) y le gana a `--active` (0,1,0), así que al tocar la pestaña en el teléfono el texto volvería a `--text`. No se reprodujo con hover real (`page.hover` no aplica `:hover` bajo emulación; falta medir con `mouse.move`) | pendiente | — |

## Checklist de estreno (para el dueño, después del deploy)

El módulo **nunca fue probado en la app**. Este es el recorrido a mano, en orden, con
lo que hay que mirar. Si algo falla, es un hallazgo nuevo: anotarlo y pasarlo.

**Antes de empezar**: deploy con autorización → `node temp_sql/82_deploy_real.mjs`
→ después `node temp_sql/82_postcheck.mjs` (debe imprimir 8 ✓ y salir con 0).
El front y el SQL salen **en la misma ventana** (T3 cambió el contrato del patrimonio).

1. **Header**: el número grande es tu moneda local; debajo, una línea por cada moneda
   con saldo (0 = sin línea; negativa = aparece). Si tu país no es Argentina, el número
   NO debe salir en pesos.
2. **Nueva inversión** → Plazo Fijo con TNA: al crearla, el semáforo debe verse
   **verde** ("Actualizado"), no rojo. El valor actual debe ser mayor al capital
   (devenga por TNA) y crecer al día siguiente.
3. **Nueva inversión** → Cripto (variable): nace en capital, sin TNA, y no puede
   llevar TNA (el backend lo rechaza: "Los activos variables no pueden tener tasa fija").
4. **Cartera**: la inversión liquidada NO debe seguir apareciendo acá (solo en Historial).
5. **Actualizar Valor**: cambiar el valor → el semáforo vuelve a verde, el rendimiento
   nominal se recalcula y el detalle muestra el valor nuevo.
6. **Liquidar (total)**: el saldo de la billetera **suma exactamente** lo que retiraste
   (ni más ni menos). Repetir la liquidación debe ser imposible.
7. **Rescate parcial**: retirar una parte → la tarjeta muestra el saldo restante
   (no el valor completo). Liquidar después: la billetera suma **solo** la parte que
   faltaba, no el capital entero (este era el doble conteo).
8. **Historial**: las inversiones liquidadas aparecen con su moneda real (si liquidaste
   en USD, los montos se muestran en USD, no en la moneda por defecto).
9. **Distribución**: el donut y la tabla suman el total de la cartera, en tu moneda local.
10. **Tab Inflación**: al abrirlo, el país y la fuente muestran **lo que guardaste**
    (no AR/proxy_dolar de fábrica). Guardar y reabrir: sigue igual. El pill dice
    "Sin configurar" si nunca guardaste.
11. **Movimientos**: en la billetera y en el detalle de la inversión, el movimiento dice
    "Inversión: Bitcoin", "Ganancia por liquidación: GGAL" — nunca la key cruda.
12. **Toasts**: ningún error debe mostrar una key tipo `error_investment_...`; sale el
    texto en español.


**Deploy**: T1–T5 son SQL contra producción → UN deploy real con autorización explícita
del dueño (convención temp_sql, scripts numerados + dump de verificación). El front
(T6–T8) se mergea después del deploy.

> **⏸️ PAUSADO por el dueño (2026-10-20, L4).** Estado al pausar: T1–T4 commiteadas
> (SQL redactado y versionado en `temp_sql/82_deploy_inversiones_puesta_punto.sql`),
> **NADA desplegado en producción** — el SQL nunca corrió contra la base viva.
> Reanudar por T5 (`fn_obtener_config_inflacion`) y seguir con T6–T8 (frontend).
> OJO AL REANUDAR: T3 cambió el contrato de `fn_reporte_patrimonio_inversiones`
> (jsonb, sin `p_cotizacion_usd`) → el frontend viejo rompe; desplegar SQL y
> frontend juntos. La rama `pi/inversiones-v1-puesta-punto` ya está creada desde
> `feat/pin-huella`; no falta crearla.

## Log

- **L1** (pedido original, verbatim): "Revises la documentación del módulo de
  inversiones, el código desarrollado y podamos evaluar en qué etapa está, qué hace falta
  para su implementación, si es que no está implementado y nada, un panorama completo,
  usa la skill brainstorming para asegurarte de que lo implementado está completo o para
  detectar si están faltando algún servicio, yo todavía no lo he probado en la app, pero
  segur amente le faltan cosas, investiga y presentame preguntas para que nos quedemos de
  acuerdo a ver cómo seguimos con este tema."
- **L2** (decisiones del dueño tras las preguntas de la evaluación, 2026-10-16): ruta
  S2, patrimonio S3, tipo_activo S4, Home S5 — citadas verbatim en Specs.
- **L3** (evidencia de la evaluación, read-only): backend verificado en vivo: 14 RPC de
  inversiones existen y están desplegadas (sondas `temp_sql/81*`, definiciones completas
  en `temp_sql/81_inversiones_rpc_defs.txt`); tablas `p_inversiones` (sin columna
  tipo_activo ni ultima_conciliacion al crear) y `p_config_inflacion`; sin triggers ni
  cron de inversiones; RLS on con policies deny-anon/allow-definer. El SQL del módulo NO
  está versionado en este repo; sin tests del módulo; este doc es su primera
  documentación. Backlog diferido: migración tipo_activo (S4), api_automatica de
  inflación, notificaciones del módulo, filtros activas/liquidadas en UI,
  fn_calcular_rendimiento_plazo_fijo (código muerto), inclusiones en Home (S5).
- **L4** (2026-10-20, pausa del dueño): "arranca la tanda, crea una rama nueva, avisa
  al agente PI1 que estas por tocar es.ts (esta trabajando alli), esta en otra sesion, lo
  haces con engram" → rama `pi/inversiones-v1-puesta-punto` creada desde `feat/pin-huella`;
  aviso a PI1 publicado en Engram (obs #662, pineado) con la lista de archivos que toca
  esta tanda y el protocolo anti-wipe de es.ts. Después: "stop cuando puedas" → cierre de
  sesión con T1–T4 commiteadas (`38de600`, `821f217`, `432c13e`, `a510ee5`) y **sin
  deploy a producción**. Nota de incidente: un heredoc truncó a mitad el append del
  bloque T3 en `temp_sql/82_deploy_inversiones_puesta_punto.sql`; se reparó restaurando
  el archivo desde el commit de T2 (`git show 821f217:...`) y re-agregando T3 con el
  editor de archivos. Lección: para bloques SQL grandes, escribir el fragmento con la
  herramienta de archivos y concatenar con `cat`, nunca heredoc en bash.
- **L5** (2026-10-20, reanudación): el dueño dijo "continua" → se retoma desde T5.
  Se completaron T5–T9 (`fcdf40e` T5, `ff02727` T6, `549f709` T8, `5412071` T7) y se
  preparó T9. Coordinación con PI1 resuelta (obs #663): PI1 crea `en.ts` y NO toca
  `es.ts` → T7 quedó libre; mi `es.ts` quedó con 22 líneas agregadas en la sección
  `inversiones` y nada más. Verificación: 82 tests pasan (9 contrato front↔SQL con
  mutación probada, 9 labels, 10 patrimonio, 18 transfer-titles, 8 hero, 28 i18n),
  `tsc -b` limpio. **Sigue sin deploy** (esperando autorización del dueño).
  Pendiente de T9: post-deploy (`temp_sql/82_postcheck.mjs`) y el checklist manual
  de 12 puntos (ya escrito en el doc).
- **L6** (2026-10-20, con capturas del dueño): tres hallazgos. (1) El botón
  "Ver Inversiones" de Supervivencia navegaba a `/billeteras` → corregido a
  `/inversiones` (T10). (2) "todo el UI de inversiones esta desfasado, no entra en
  pantalla": causa raíz = `.inversiones-page` es un flex item de `#root` (column
  flexbox) y conservaba el `min-width: auto` por defecto, así que su min-content
  (el número grande con `nowrap` + la tira de pestañas) lo empujaba MÁS ANCHO que
  la pantalla, y el clip global de `.page` caía fuera de vista. Segunda causa: la
  página re-declaraba `padding` y pisaba el `.page` global, perdiendo
  `--nav-clearance` y `--safe-top`. Fix: `min-width: 0` + `width: 100%` en la página
  y en cada vista hija, `min-width: 0` + `overflow: hidden` en el header sticky, y
  solo padding horizontal encima del global (T10). (3) La captura de Actividad
  Reciente muestra `Efectivo · investment_prefix: Bitcoin`: es una build sin el
  fix de T7 — `translateDetalle` ya resuelve esa key (verificado en node:
  `investment_prefix: Bitcoin` → `Inversión: Bitcoin`) y llega al usuario al
  publicar la rama. (4) Nueva spec S7: la categoría de Inversiones es intocable
  (T11). Nota de diseño: en el backend se usaron TRIGGERS y no reescritura de
  RPCs — reemitir ~450 líneas de `fn_registrar_movimiento_caja` y compañía es
  una regresión silenciosa esperando; un trigger es aditivo y además cubre voz,
  importación y RPCs futuras. El marker `metadata->>'inversion_id'` es fiable
  porque `fn_registrar_movimiento_caja` NO expone `metadata` como parámetro: el
  cliente no puede forjarlo.- **L7** (2026-10-22, chequeo con EgoLite en modo celular real): el dueño pidió un
  chequeo de la app con el navegador. Se emuló un teléfono real (UA Android Pixel
  7, touch activo, 412x915, `desktopSidebar: false` → la app renderiza la versión
  móvil) sobre el dev server local (`localhost:5173`, rama
  `pi/inversiones-v1-puesta-punto`). Resultado: el módulo de Inversiones está
  **verde** en modo claro y oscuro — contraste del header 18.02 (claro) y 16.02
  (oscuro), texto de ayuda 10.09 y 5.62, header `sticky` sin recorte
  (`scrollHeight == clientHeight`), sin solapamiento con el FAB, las cuatro
  pestañas ("Cartera", "Historial", "Gráfico", "Inflación") en una sola línea y
  alineadas a 12px, y ningún contenido tapado por el bottom nav (zona tapada desde
  848). El botón Guardar de la pestaña Inflación aparece solo si hay cambios y
  queda en `bottom: 748` (zona tapada: 848) ✓. **Un bug encontrado y corregido
  (T12, S9)**: en los tres modales del módulo las acciones estaban al final del
  scroll de la card, así que el botón "Guardar" de "Nueva Inversión" quedaba en
  `bottom: 940` con un viewport de 915 → 25px debajo del fold (el scroll interno
  del modal era de solo 45px); con el teclado abierto era inalcanzable. Fix: la
  card no scrollea, el form es el scroller y las acciones quedan fijas al pie con
  fondo opaco y safe-area; el botón sigue submits el form con `form="..."`.
  Verificado en el mismo perfil móvil: el botón pasa a `bottom: 894`, visible sin
  scrollear, en los tres modales. Commit `8d5cf56` (T12), con 12 tests nuevos en
  `tests/inversiones/modales-acciones-fijas.test.js`. Nota: los 2 tests de
  `appLock` (PIN/huella) que fallan en la suite completa son preexistentes y
  ajenos a Inversiones (verificado con `git stash`).
- **L8** (2026-10-22, cierre de la sesión a pedido del dueño — "stop cuando
  puedas"): se cierra la tanda de chequeo. Estado: commits `8d5cf56` (T12, el
  fix del modal) y `4b2c0fc` (docs). Working tree limpio; los scripts de
  medición de EgoLite y las capturas se borraron (eran artefactos de la sesión).
  El navegador quedó como el dueño lo tenía: tema oscuro y en `/inversiones`.
  Sin deploy del front (lo decide el dueño) y sin tocar los datos de prueba.
  Nota: el review nativo no pudo arrancar en este entorno (`native-status-
  unavailable`, dos intentos, `next_action: stop`): no se creó autoridad ni se
  mutó nada. El plan de riesgo alto se cubrió con auto-verificación (tests,
  `tsc -b`, `vite build`, medición en navegador) + verificador independiente.
- **L9** (2026-10-22, pausa del dueño — "stop por ahora"): el dueñoConfirmó que
  **PI1 ya publicó en produccion** (`https://personal.workcapital.com.ar`, rama
  `feat/i18n-pt-br`, que incluye el merge `138f1e8` de este trabajo). Se abrió
  produccion con EgoLite en modo celular real: la app responde y redirige a
  `/auth`. **La prueba funcional del modulo en produccion quedo pendiente**:
  en el origen de produccion no hay sesion de Supabase (la sesion que uso el
  chequeo anterior vivia en el localStorage de `localhost:5173`), asi que hace
  falta que el dueno inicie sesion en la ventana del navegador o que se le
  pase una sesion de test. Pendiente de la sesion: las 4 pestañas, el header
  sticky, el modal con el boton Guardar fijo (`8d5cf56`), la categoria
  intocable y la configuracion de inflacion manual contra produccion real.
  **Coordinacion con PI1**: respondi sus dos consultas (el SQL ya esta aplicado
  y verificado; la key `cat_investments` no necesita volver al diccionario),
  pero el canal de mensajes entre sesiones **rechaza** el envio de PI2 a PI1
  (`session message was not accepted`, 6 intentos; el inverso, PI1 -> PI2, si
  funciona: PI2 esta en su turno y PI1 en control del usuario). La respuesta
  quedo escrita y pineada en Engram (obs #686, con la decision en #685) y en el
  archivo `temp_sql/89_estado_inversiones.mjs` (read-only) para que la lea
  cuando tenga el control de su sesion.
