# Tarjetas + cuarentena OCR — lote de bugs reportados por el dueño (2026-11-11)

Rama: `fix/tarjetas-lote-bugs-20261111` (base `origin/produccion` 11c5e74). Repo: `C:/temp/Antigravity/ORD Capital v2/Personal`.
Las capturas viven en `%TEMP%/pi-clipboard-*.png`. Cada tarea nombra la suya y **se lee al empezar esa tarea**, nunca en lote.

## Specs

**S1 · Próximo vencimiento el mismo día del vencimiento.** Captura `pi-clipboard-b9496daf-08e6-43f6-bf0a-1cfd17eb63d0.png`.
«Fíjate que en la parte de tarjeta próximo vencimiento, ven cía el día 10, que fue ayer. Esto fue tomada la foto ayer
mismo, o sea que estábamos en el mismo día del vencimiento, pero me calculaba 29 días al próximo vencimiento, cuando en
realidad el próximo vencimiento debería decir hoy .»

**S2 · Nomenclatura de la moneda local en el modal de pago.** Captura `pi-clipboard-9ddbc984-bc74-4a92-a6b6-809d513db865.png`.
«Cuando voy a pagar la tarjeta y tiene pagos en dólares, este modal me permite pagar en dólares si es que tengo una
billetera o en la moneda local. El símbolo de la moneda local está puesto el signo pesos, pero en lugar del signo pesos
debería estar puesta la nomenclatura de la moneda local. El signo pesos debe estar hardcodeado.»

**S3 · Sin billetera en dólares: mensaje propio.** Captura `pi-clipboard-736101a3-0b86-4609-acc1-59655dcfbfe8.png`.
«Cuando quiero pagar la parte de dólares y trato de elegir una billetera en dólares y no tengo, aparece este cartel con
cuenta vacía. Deberíamos tener una verificación de que si no tengo una cuenta en dólares el mensaje sea diferente. O sea,
no tienes una cuenta en dólares, puedes crearla desde el menú cuentas. O sea, el mensaje debería ser, perdón, no tienes una
bill etera en dólares. Punto. Final. Eso debería mostrar. Recuerda agregar en IBI8N en cada diccionario lo que toques en
la traducción. Solamente esto es para esta sección de cuando no está la cuenta en dólares, ¿sí?»

**S4 · Misma billetera para la parte local y la parte en dólares.** Captura `pi-clipboard-39df5a43-1538-46bb-9c4e-6d3c2aa9f760.png`.
«Tengo que pagar la parte en la moneda local y la parte en dólares. Elijo la billetera A para el pago en local y si elijo
la billetera B para el pago en dólares pero en moneda local, no hay ningún problema y me habilita la opción de pagar. Pero
si elijo la misma billetera tanto para el pago local como para el pago en dólares en moneda local, no me habil ita el botón
para poder efectuar el pago y me dice que tengo que elegir una cuenta. Así que hay algún problema ahí cuando coincide en el
pago local y en el pago en dólares la misma billetera.»

**S5 · Tecla «Realizar» en el total del ticket de cuarentena OCR.** Captura `pi-clipboard-33320b6e-cde0-4d8d-8136-86bcf54711ea.png`.
«Este no es del módulo de tarjetas, pero la involucra, esto es en cuarentena OCR, cuando edito un movimiento en la
cuarentena y quiero ingresar en el total del ticket, modificar el valor, se me abre el teclado y la tecla IR no funciona,
ya pasó esto con el valor total de la subcategoría, en donde la reemplazamos a la tecla IR por la tecla realizar, acá debes
hacer lo mismo, debe funcionar en el total del ticket, la tecla realizar como si fuera un OK, una confirmación del valor.»

## Tasks

| ID | Spec | Qué | Ruta | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1 | Días al próximo vencimiento = 0 el mismo día (mostrar «hoy») | por localizar | pendiente |
| T2 | S2 | Nomenclatura de la moneda local en vez de `$` hardcodeado | por localizar | pendiente |
| T3 | S3 | Mensaje «no tenés una billetera en dólares» + clave nueva en es/en/pt | por localizar | pendiente |
| T4 | S4 | Permitir la misma billetera en la parte local y la parte USD en local | por localizar | pendiente |
| T5 | S5 | Tecla «Realizar» confirma el total del ticket en cuarentena OCR | por localizar | pendiente |

## Log

**L1 (2026-11-11, pedido verbatim)** — «no , vamos con otros bugs. Muchos de los que investigaste ya estan corregidos.» +
los 5 puntos transcritos en S1–S5. Rama pedida en el turno anterior: «olvide decirte qeu crees una rama nueva para estos bugs».

**L2 (2026-11-11, evidencia)**
- T1 (S1): dos defectos, no uno. **(a)** `fn_reporte_vencimientos_tarjetas` usa `v_hoy := CURRENT_DATE` (UTC): el 10 a las 23:40 local es el 11 a las 02:40 UTC, así que `dia_hoy` da 11, salta a diciembre y cuenta 29 días en vez de 30. **(b)** el RPC no tiene la regla de «resumen saldado → mes siguiente» que el frontend sí aplica en la lista (`getDiasParaProximoVencimiento(tc, resumenSaldado)`): con la fecha local y sin esa regla, el 10/11 habría dicho «hoy, 0 días» sobre un resumen ya pagado.
- T1, dato que corrige el diagnóstico inicial (consulta de lectura autorizada, 2026-11-11): tarjeta 967 «QA A 11.9», cierre 27, vence 10, GBP, `saldo_a_favor = 0`. `p_pagos_tarjeta_log` muestra que el resumen de noviembre ya estaba saldado **el 02/11**: liquidó 30.000 GBP + 50 USD (cuotas 6806/6808, venc. 10/11) pagando 20.000 GBP y refinanciando 10.000 GBP + 50 USD a cuotas del 10/12 (6847/6848); el 01/11 había hecho lo mismo con la cuota del 10/10 (1.279,91 pagados, 43.720,09 refinanciados a la 6810). Por eso no había bloque «RESUMEN ANTERIOR IMPAGO»: la cubeta anterior estaba vacía, y no por el saldo a favor. Lo pendiente era diciembre: 20.000 + 43.720,09 + 10.000 = **73.720,09 GBP** + 250 USD, que es el «Total a pagar 73,720 GBP» y el «Estimado 73.906,27» de las capturas con cotización 0,7469. Conclusión: el próximo vencimiento **nunca** fue «hoy»; el error real es el día de menos por UTC.
- T2 (S2): `pay_resumen_usd_toggle_pesos: "$"` era el literal; render en `TarjetasPage.tsx`. Ahora usa `localMon` (ISO) y la clave se quitó de es/en/pt. Commit `3510b4a`.
- T3 (S3): `WalletDropdownSelect` acepta `emptyMessage`; sólo la sección USD lo pasa con `pay_usd_no_wallet` («No tenés una billetera en dólares»). La sección local queda igual, como se pidió. Commit `3510b4a`.
- T4 (S4): `lineasInvalidas` comparaba billeteras sobre `allLines` (local + USD). Ahora `billeteraRepetida` se aplica por sección. Commit `3510b4a`.
- T5 (S5): el total del ticket (`OcrTicketCard.tsx`, id `ocr-total-*`) no llevaba el contrato del teclado; ahora esparce `NUMERIC_INPUT_ENTER_PROPS` como cuotas y neto. Commit `c6af87c`.
- Verificación: `npx tsc --noEmit` exit 0 después de cada tanda (jobs 1, 2 y 3) y `scripts/check-i18n.mjs` sin claves rotas nuevas (246 USED-NOT-DEFINED y 913 DEAD-KEY son deuda previa). **Prueba visual NO ejecutada**: la app redirige a `/auth` y no hay sesión iniciada; el script móvil quedó en `C:/Users/Vidya Ganesh/ego/verif-lote-tarjetas-20261111/round-01.mjs`.

**L3 (2026-11-11, T1 aplicado — opción A, autorizada por el dueño)**
- Decisión del dueño: el horario correcto es el del **país configurado**, no el del lugar donde está el dispositivo. Por eso A (país → zona) resuelve.
- Creado `fn_zona_horaria_pais(text)`: ISO 3166-1 alpha-2 → zona IANA, `IMMUTABLE`, 72 países (`p_paises` con `soportado`), fallback `UTC` para NULL/desconocido/minúsculas/espacios. Verificado: AR→Buenos_Aires, GB→London, br→Sao_Paulo, NULL→UTC, XX→UTC.
- Reemplazado `fn_reporte_vencimientos_tarjetas()` (sin cambiar firma, así que `fn_registrar_pago_tarjeta_multi` sigue funcionando). Se generó desde `pg_get_functiondef`, no retipeado: 205 líneas, idénticas salvo tres tramos (declaración de `v_hoy`/`v_dia_hoy`/`v_mes_actual`, asignación desde la zona al conocer `v_user_id`, y la regla de resumen saldado con recorte al último día del mes).
- Emulación del instante de la foto (2026-11-11 02:40 UTC): **zona AR → hoy 10/11, resumen saldado, próximo 10/12, 30 días**; **zona GB → hoy 11/11, próximo 10/12, 29 días** (que es lo correcto para ese país). Es decir: el 29 solo se corrige cuando el país configurado es el que corresponde.
- UI: el widget muestra «Hoy» cuando `dias_para_vencimiento` es 0, con clave `card_due_today` en es/en/pt.
- Espejos: `funcionesSQL/fn_zona_horaria_pais.md` (nuevo, 82 líneas), `funcionesSQL/fn_reporte_vencimientos_tarjetas.md` reemplazado por la definición viva (205 líneas: antes tenía 341 con una copia inexistente en la base) e `start_info/indice de funciones.md` con la entrada 280 y la nota v3.
- Commits: `1e1fd56` (UI «Hoy»), `edea0f8` (espejos + índice), `99a4509` (este documento).

**L4 (2026-11-11, prueba visual con sesión iniciada — Google `vidyaganeshcatamarca@gmail.com`)**
- Se entró con Google en `localhost:5174` con la cuenta del dueño (la UI quedó en inglés: `idioma_default = en`).
- **T1 verificado en pantalla**: Ashram card «Next Due Date · Day 14 (3 days) · Estimated: ARS 188.483» y termómetro «due 11/14/2026»; Galicia gold «Day 25 (14 days)». Ambos coinciden con hoy 11/11 y con el día de vencimiento configurado: el RPC nuevo corre sin excepción contra datos reales.
- **Lo que T1 todavía no prueba**: el caso «Hoy» (necesita un vencimiento igual a la fecha de hoy) y el corrimiento nocturno por UTC (aparece después de las 21:00 locales).
- **T2, T3 y T4 no observables con estos datos**: las dos tarjetas activas del dueño (Ashram, Galicia gold) no tienen cuotas en USD en el resumen actual, así que la sección «Payment in dollars» no se renderiza (`.pay-section--usd` ausente). Se implementaron y compilan, pero la prueba en pantalla requiere una tarjeta con cuotas USD.
- **T5 no observable**: la bandeja de cuarentena está vacía (OCR 0).
- Evidencia: `C:/Users/Vidya Ganesh/ego/verif-lote-tarjetas-20261111/` (round-01 a round-10 y capturas `detalle-tarjeta.png`, `modal-ashram.png`, `modal-galicia.png`, `bandeja.png`) más el `-traza` de consola de cada ronda.
- Nada se envió ni se guardó: los modales se abrieron y se cerraron sin confirmar pagos.

**L5 (2026-11-11, prueba con datos de prueba propios — autorizada por el dueño)**
- Cuenta real: `user_id = 1` (la del login). El 210 que había supuesto era otro usuario: lo delató que la bandeja de cuarentena mostraba los pendientes del 1 (1562 y 1563).
- **T5 verificado**: fila temporal en `p_caja_cuarentena` (id 1566, clonada de un ticket real para que el parser no la descarte) → al abrir el ticket, `input#ocr-total-1566` trae `enterKeyHint="done"` e `inputMode="decimal"`.
- **T2 verificado**: la tarjeta de prueba muestra el toggle con `["US$", "ARS"]`, sin el `$` literal.
- **T3 verificado**: con una cuenta en dólares ya tomada, la segunda línea muestra «You don't have a USD wallet» en la hoja, en vez del cuerpo vacío. **Matiz**: ese texto también aparece cuando la cuenta existe pero ya está usada por otra línea, y ahí decir «no tenés» es impreciso. Requiere decisión: dejar un solo mensaje o separarlo en dos.
- **T4 verificado**: la misma billetera (Mercado Pago) en la sección local y en la línea en dólares pagada en moneda local → `Confirm Payment` **habilitado** y sin aviso de elegir cuenta.
- **Bug nuevo de la app (no del lote)**: el alta de tarjeta por UI está rota. `fn_crear_tarjeta_credito` responde **400 · 42601 · «INSERT has more expressions than target columns»** (capturado interceptando los `fetch` a `/rpc`). Por eso la tarjeta de prueba se creó por SQL. No se corrigió: es RPC y requiere autorización.
- Limpieza verificada: 0 tarjetas QA, 0 cuotas de la tarjeta 982, 0 filas QA en cuarentena; quedan las 2 tarjetas activas y los 2 pendientes de cuarentena previos. Dev server detenido y task space cerrado.
- Evidencia: `round-11` (T5), `round-17` (T2), `round-20` (T4), `round-21` (T3) y capturas en `C:/Users/Vidya Ganesh/ego/verif-lote-tarjetas-20261111/`.

**L6 (2026-11-11, alta de tarjeta arreglada + textos del dueño)**
- `fn_crear_tarjeta_credito`: la lista declaraba 9 columnas y el `VALUES` pasaba 10, con un `0` huérfano antes de la moneda. Se nombró `saldo_a_favor` como décima columna. Verificado desde la UI: 200, toast «Card created successfully», formulario cerrado y tarjeta visible; después borrada (0 tarjetas QA, 2 activas). Espejo e índice en `6012fe0`.
- **Falla de proceso propia, registrada para no repetirla**: el dueño había editado `es.ts` a mano y yo hice `git add src/locales/es.ts`, así que sus dos cambios (`card_cmp_usd_line` y `pay_resumen_real_label`) entraron callados en `3510b4a` mientras `en.ts` y `pt.ts` conservaban la traducción vieja. El chequeo de paridad (claves y placeholders) no lo detecta: sólo se ve con `git show <commit> -- src/locales/es.ts` y separando los hunks propios de los ajenos. **Regla:** antes de `git add` sobre un archivo de diccionarios, revisar si el dueño tiene ediciones sin commitear y, si las tiene, commitearlas aparte y retraducirlas en el mismo work unit.
- Traducciones corregidas: `card_cmp_usd_line` (en `Dollars: previous cycle …`, pt `Dólares: ciclo anterior …`), `pay_resumen_real_label` (en `Enter the real payment amount`, pt `Informe o valor real do pagamento`) y la hermana `card_cmp_usd_line_unconverted` alineada en los tres idiomas.
