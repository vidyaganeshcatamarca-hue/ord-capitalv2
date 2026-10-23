# Separadores por moneda — dos tandas (2026-10-23)

El dueño detectó que el módulo de Inversiones mostraba la plata con un
separador y los porcentajes con otro. La regla que fijó vale para toda la app.

## Specs

- **S18** (tanda 1, separadores, L1, verbatim): "El módulo debe seguir el
  separador elegido. Tenemos máximo tres monedas, cada moneda debe seguir su
  separador elegido. Y en el módulo de inversiones o cualquier otro, en donde se
  muestren porcentajes, se debe seguir el separador elegido para la moneda local.
  Cuando son valores genéricos, que no aplican a una moneda en particular, el
  separador elegido para la moneda local. Es lo correcto."
- **S19** (tanda 2, decimales por moneda, pendiente, verbatim): "dos tandas, una
  despues de la otra para poder verificar bien".
- **S20** (restricción de proceso, L1, verbatim): "trata de aplicar los cambios
  de la manera que se toque la menor cantidad de código o se ponga en riesgo la
  menor cantidad de código ya escrito".

## Diagnóstico

| Qué | Evidencia |
|---|---|
| El formato **por moneda ya existía** | `fn_obtener_formato_moneda()` devuelve `{ MONEDA: { decimales, separador_miles, separador_decimal } }` desde `p_config_region.monedas_formateo` con herencia de `p_preferencias_usuario`. Lo usaba **solo** la pantalla de configuración. |
| El **dinero** ignoraba la elección | `formatCurrency` usaba `Intl.NumberFormat` y los separadores salían del **locale**, no de la preferencia. 48 llamadas en 26 archivos. |
| Los **porcentajes** también, hasta T26 | cada componente tenía su `formatPercent` con `toFixed(2)` (siempre punto). |
| El dato real del dueño | usuario 198: `separador_decimal='.'`, `separador_miles=','`; `monedas_formateo` con ARS y BRL en `'.'/','` y EUR en `','/'.'`. 76 de 78 usuarios tienen coma. |
| Bug de re-render (destapado al arreglar el formato) | `formatCurrency` lee un valor de módulo: un componente ya montado no se re-renderiza cuando el contexto se hidrata. La cartera quedaba en el default (`GBP 1.737`) mientras el gráfico, montado después, mostraba el formato correcto (`1,500.00 GBP`). |

## Contrato de la tanda 1

1. `FormatContext` suma `currencySeparators: Record<MONEDA, {group?, decimal?}>`
   y `formatRevision` con `subscribeFormatContext()`.
2. `formatCurrency(monto, moneda)`:
   - separadores efectivos: **moneda pedida → moneda local → nada** (Intl decide,
     o sea el comportamiento histórico);
   - se aplican con `formatToParts()` reemplazando **solo** los caracteres de
     `group` y `decimal`: símbolo, posición, espaciado y signo no se rearman;
   - si hay separador de miles configurado, se usa `useGrouping: 'always'`
     (el locale español no agrupa números de 4 dígitos y el separador elegido no
     se veía nunca en esa escala).
3. `formatPercent()` usa el separador de la **moneda local** (valores genéricos).
4. `useNumberFormat` lee `fn_obtener_formato_moneda()` y publica el mapa.
5. `useFormatRevision()` (hook nuevo, `useSyncExternalStore`) se llama en los
   componentes del módulo que formatean dinero, para que converjan cuando el
   contexto llega después del primer render.

## Tasks

| ID | Specs | Tarea | Ruta | Commit |
|---|---|---|---|---|
| T27 | S18, S20 | Contexto + `formatCurrency` con separadores por moneda (sin tocar llamadores) | inline | `(esta tanda)` |
| T28 | S18 | `formatPercent` toma el separador de la moneda local | inline | idem |
| T29 | S18 | `useNumberFormat` publica el mapa de `fn_obtener_formato_moneda()` | inline | idem |
| T30 | S18 | `useFormatRevision` + 8 componentes del módulo suscritos | inline | idem |
| T31 | S18 | Tests: salida idéntica sin config, por moneda, fallback, porcentajes | inline | idem |
| T32 | S19 | Tanda 2: decimales por moneda (pendiente, después de que el dueño verifique) | — | — |

## Log

- **L1** (2026-10-23, verbatim): "1. El módulo debe seguir el separador elegido.
  Tenemos máximo tres monedas, cada moneda debe seguir su separador elegido. Y en
  el módulo de inversiones o cualquier otro, en donde se muestren porcentajes, se
  debe seguir el separador elegido para la moneda local. Cuando son valores
  genéricos, que no aplican a una moneda en particular, el separador elegido para
  la moneda local. Es lo correcto. Ahora, trata de aplicar los cambios de la
  manera que se toque la menor cantidad de código o se ponga en riesgo la menor
  cantidad de código ya escrito. ¿Cuál sería esa forma? Explíqueme."
- **L2** (2026-10-23): el dueño aprobó el plan en dos tandas: "dos tandas, una
  despues de la otra para poder verificar bien".
- **L3** (2026-10-23, cierre de la tanda 1): T27–T31 hechas. El arreglo quedó en
  `src/lib/format.ts` + `src/hooks/useNumberFormat.ts` + el hook nuevo
  `useFormatRevision`, **sin migrar ningún componente a otro formateador**: los
  48 llamadores de `formatCurrency` siguen igual.
  Verificado en EgoLite (perfil celular, esperando hidratación): cartera
  **`1,736.92 GBP`** y **`1.600,00 BRL` al mismo tiempo** (dos monedas, dos
  formatos, cada una el suyo), tarjetas `1.500,00 BRL`, gráfico `1,500.00 GBP` y
  `86.36%`. Suite: **557 pasan**, los 2 de `appLock` (biometría) preexistentes;
  `tsc -b` y `vite build` limpios.
  Dos defectos propios detectados y corregidos durante la tanda: (a) el fallback
  usaba el separador global viejo y rompía el formato del dinero cuando no había
  mapa (lo destapó `tests/i18n/locale-follows-language.test.js`); (b) el
  separador de miles no se aplicaba en números de 4 dígitos por
  `minimumGroupingDigits` del locale español.
  **Pendiente deliberado**: los decimales por moneda (tanda 2, S19). Hoy se
  siguen usando `decimales_moneda_local`/`decimales_segunda_moneda`; el mapa ya
  trae `decimales` pero no se aplica.
