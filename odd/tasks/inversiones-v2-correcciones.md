# Inversiones v2 — correcciones del dueño tras probar producción (2026-10-22)

Segunda tanda sobre el módulo de Inversiones, después de que el dueño probó
producción (`https://personal.workcapital.com.ar`) en su teléfono. Cierra
hallazgos de lectura y de cálculo, no rediseños.

## Specs

- **S11** (subtítulos por moneda alineados, L1, verbatim): "En la tarjeta
  principal aparece el valor total. Después, abajo de mi cartera aparecen los
  valores de las diferentes monedas. Me gustaría alinear a la derecha. Así
  quedan todos los valores en la misma columna. Es decir, en este caso en
  particular, dólares debería quedar 200 abajo de 805, que es el valor total
  de la cartera."
- **S12** (proxy dólar es el default y debe contar como configurado, L1,
  verbatim): "dijimos que la configuración por defecto es tomando el dólar ...
  Todos los usuarios deberían aparecer con eso ya configurado. Por lo tanto el
  cartel no tendría sentido. Lo que me parece que está sucediendo es que esa
  configuración cuando se elige guiada por el dólar no la está tomando en
  cuenta."
- **S13** (donut más chico y tabla legible, L1, verbatim): "el donut está
  demasiado grande ... Quisiera que esta pantalla achiques el donut para que no
  exista scroll en esta pantalla ... que para dos inversiones no haya scroll,
  para más inversiones sí. Lo que tienes que cambiar solamente es el tamaño del
  donut. Otra cuestión aquí es el campo valor, no se entiende bien qué es lo que
  dice ... no se sabe si es porcentaje, explícame ese valor, cómo lo calculas."
- **S14** (el país no se elige, L1, verbatim): "el país es el país que ya está
  configurado en regional y que determina la moneda local. Así que el país no
  debe aparecer y no debe ser seleccionable ni cambiable."
- **S15** (liquidación solo a billeteras de la misma moneda, L1, verbatim): "una
  liquidación total o parcial solo puede ir a billeteras de la misma moneda. Me
  pareció ver algún error en alguna prueba que hice de que me haya permitido
  liquidar a una billetera de una moneda diferente. Solo se liquida y se
  muestran las billeteras de la misma moneda de la inversión."
- **S16** (un retiro parcial no es una pérdida, L1, verbatim): "Cuando yo hago
  una liquidación parcial, el valor actual aparece con, en este ejemplo,
  200.000 menos que el capital original. En valor actual debería decir, cuando
  se ha aplicado un retiro parcial, debería decir que es a causa de un retiro
  parcial para diferenciarlo de una pérdida real de la inversión. No queda claro
  esto. Y el rendimiento nominal ... lo está tomando aparentemente como una
  pérdida, cuando en realidad lo que ha habido es un retiro. Lo cual no es
  pérdida."
- **S17** (la inflación tiene que ser explicable, L1, verbatim): "Dime cómo
  calcula la inflación en el tiempo."

## Diagnóstico (verificado en producción, 2026-10-22)

| # | Causa raíz | Evidencia |
|---|---|---|
| S11 | `.rendimiento-real-moneda-line` es `inline-flex` a la izquierda; el total va a la derecha en otra fila | `RendimientoRealWidget.css:71-92` |
| S12/S17 | `fn_configurar_inflacion` **congela** `inflacion_acumulada_6m/12m` en el momento de guardar. Para `proxy_dolar` usa la variación del mes en curso y la eleva a la 6ª potencia. Si ese mes no tiene dato, guarda **0** y `inflacion_disponible` queda `false` **para siempre** → el cartel de "Configurá tu fuente" no se va nunca | `p_config_inflacion` de los usuarios 1 y 198: `fuente_inflacion='proxy_dolar'` con `inflacion_acumulada_6m=0` y `12m=0` |
| S13 | `.distribucion-table { min-width: 520px }` + `overflow-x: auto` → en un teléfono la tabla siempre scrollea y corta la columna Valor y la de Porcentaje. El donut es `size=220` | `DistribucionView.css:74-81` |
| S14 | `ConfigInflacionView` tiene un `<select>` de país, y además `const PAISES = []` (array vacío): la config guardada de país nunca se aplica, se pisa con el país regional | `ConfigInflacionView.tsx:57` y `:107` |
| S15 | El front filtra (`billeterasMismaMoneda`), pero **`fn_liquidar_inversion` no valida nada**: acepta cualquier `p_billetera_destino_id` | `82_deploy_inversiones_puesta_punto.sql:495-590` |
| S16 | `rendimiento_nominal` compara `valor_actual_teorico` contra `monto_invertido_original` e **ignora `monto_liquidado`**. Un rescate de 200.000 sobre 500.000 se muestra como −40%. Pasa en el detalle **y** en la lista de la cartera | `86_inversiones_saldo_e_inflacion_manual.sql:243` y `82_deploy_inversiones_puesta_punto.sql:143-158` |
| S16b | `.detalle-actions` es `sticky` con degradado `rgba(13,17,23,0)` (oscuro hardcodeado) y el contenido no reserva espacio: la barra tapa la tarjeta de rendimiento real | `DetalleInversionView.css:383-395` |

## Contrato del backend nuevo

`fn_inflacion_vigente(p_user_id bigint) RETURNS jsonb` — helper **interno**
(`REVOKE EXECUTE FROM PUBLIC, anon, authenticated`), se calcula **en tiempo de
lectura**, nunca se congela:

```json
{ "fuente": "proxy_dolar|manual|desactivado",
  "pais": "AR", "moneda_local": "ARS",
  "disponible": true,
  "motivo": "ok|desactivado|sin_datos|manual_sin_valor",
  "inflacion_6m": 12.34, "inflacion_12m": null,
  "ventana_6m_meses": 3.1, "ventana_12m_meses": null }
```

Reglas:
1. `fuente = COALESCE(config.fuente_inflacion, 'proxy_dolar')` → **sin fila
   guardada, el default es proxy_dolar** (S12).
2. `pais = COALESCE(NULLIF(config.pais,''), p_config_region.pais_codigo)`;
   `moneda_local` sale de `p_paises.moneda_local` (fallback
   `p_config_region.moneda_default`, fallback `'ARS'`).
3. `desactivado` → `disponible=false`, `motivo='desactivado'`.
4. `manual` con `p_inflacion_manual_anual_pct > 0` → `6m =
   (POWER(1+anual/100,0.5)-1)*100`, `12m = anual`; si no hay valor →
   `motivo='manual_sin_valor'`.
5. `proxy_dolar` → variación **acumulada real** de `p_cotizaciones_historico`
   para `moneda_local`: `hoy/base - 1`, con `base` el último dato de hace 6
   (y 12) meses. Si no hay dato de hace 6 meses, se usa **el más viejo
   disponible** y se informa la ventana real en `ventana_6m_meses`. El
   histórico actual llega a ~3 meses para ARS, así que una ventana de 6/12
   meses es imposible hoy: se informa la que hay.
6. Si no hay ningún dato de cotización → `motivo='sin_datos'` y
   `disponible=false`. **La UI no debe pedir "configurar"**: eso ya está
   configurado (S12), simplemente todavía no hay datos.
7. Fallback de compatibilidad: si el cálculo da `null` y la fila guardada tiene
   `inflacion_acumulada_6m > 0`, se usa ese valor.

Funciones a parchear con `CREATE OR REPLACE` (**sin `DROP FUNCTION`**: los
tipos de retorno no cambian):

- `fn_reporte_rendimiento_vs_inflacion()` → usa el helper.
- `fn_reporte_detalle_inversion(bigint)` → usa el helper **y** agrega
  `monto_liquidado`; `rendimiento_nominal` = `((valor_actual + monto_liquidado)
  - monto_invertido_original) / monto_invertido_original * 100`.
- `fn_reporte_historial_inversiones()` → mismo arreglo del nominal.
- `fn_obtener_config_inflacion()` → agrega `disponible`, `motivo`,
  `ventana_6m_meses`, `ventana_12m_meses`; `inflacion_6m/12m` en vivo.
- `fn_liquidar_inversion(bigint, numeric, bigint)` → **valida que
  `p_billeteras.moneda` de la billetera destino sea igual a la moneda de la
  inversión**; si no, `RAISE EXCEPTION '{"key": "error_wallet_currency_mismatch",
  "params": {}}'`.

## Tasks

| ID | Specs | Tarea | Ruta | Commit |
|---|---|---|---|---|
| T16 | S11 | Front: los subtotales por moneda se alinean a la derecha, en la misma columna que el total | inline | — |
| T17 | S12, S17 | SQL: `fn_inflacion_vigente` + parche de las 5 funciones (inflación en vivo, default proxy_dolar, nominal con retiro parcial, validación de moneda al liquidar) | worker | — |
| T18 | S14 | Front: se quita el selector de país; el país y la moneda local son los de la configuración regional; se informa cómo se calcula y la ventana usada | inline | — |
| T19 | S12 | Front: el cartel de "configurá tu fuente" solo aparece cuando de verdad no hay datos, con un mensaje distinto | inline | — |
| T20 | S13 | Front: donut más chico; la tabla del gráfico entra en el teléfono sin scroll horizontal y los encabezados dicen qué es cada columna | inline | — |
| T21 | S15 | Front + SQL: solo billeteras de la misma moneda al liquidar, garantizado también en el backend | inline | — |
| T22 | S16 | Front + SQL: retiro parcial visible en el detalle (monto retirado) y nominal calculado sobre el total; la barra de acciones no tapa las tarjetas | inline | — |
| T23 | S11-S16 | i18n: keys nuevas en `es.ts`, `en.ts` y `pt.ts` en paridad | inline | — |
| T24 | S2 | Verificación: tests de las dos causas SQL y de la UI; chequeo en navegador móvil | inline | — |

## Log

- **L1** (2026-10-22, verbatim, seis puntos): "1. En la tarjeta principal aparece
  el valor total ... Me gustaría alinear a la derecha. Así quedan todos los
  valores en la misma columna ... También tenemos un problema con el mensaje de
  configurar tu fuente de inflación Ya que dijimos que la configuración por
  defecto es tomando el dólar ... Todos los usuarios deberían aparecer con eso
  ya configurado ... 2. Pantalla de gráfico, el donut está demasiado grande ...
  achiques el donut para que no exista scroll en esta pantalla ... 3. En la
  pantalla de inflación aparece el país ... Eso está mal como concepto ... el
  país no debe aparecer y no debe ser seleccionable ni cambiable. La fuente de
  inflación, cuando es proxy dólar, hay algún inconveniente que no queda fijada
  ... Dime cómo calcula la inflación en el tiempo. 4. Cuando voy a liquidar una
  inversión, quiero que verifiques que se cumpla que una liquidación total o
  parcial solo puede ir a billeteras de la misma moneda ... 5. Esta pantalla es
  el detalle de una inversión ... Cuando yo hago una liquidación parcial, el
  valor actual aparece con ... 200.000 menos que el capital original ...
  debería decir que es a causa de un retiro parcial ... Y el rendimiento
  nominal ... lo está tomando aparentemente como una pérdida, cuando en
  realidad lo que ha habido es un retiro ... 6. Para la pantalla del donut, si
  necesitas usar el acceso web de Ego Browser, lo haces."
