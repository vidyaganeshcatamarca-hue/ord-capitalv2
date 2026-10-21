# Feature: i18n-pt-br — Portugués de Brasil como tercer idioma

Estado: **IMPLEMENTACIÓN AUTORIZADA** (dueño, 2026-10-20). Rama: `feat/i18n-pt-br`
(desde `feat/i18n-ingles` @ `4d54e31`). Todo local: **cero push, cero deploy, cero SQL**.

Continuación de `odd/tasks/i18n-segundo-idioma-en.md` (el inglés ya está entregado y
committeado; esta feature **no lo modifica**).

## Specs

### S1 — Portugués de Brasil, un solo idioma
> "1. pt-BR solo  2. Brasil  3. generaliza."

- Se agrega **un** idioma: **portugués de Brasil**.
- **Brasil** es el mercado objetivo. No se agrega `pt-PT` en esta entrega.
- **Generalizar**: el pipeline de traducción y los tests pasan a trabajar con **N
  idiomas**, no con `es → en` hardcodeado.

### S2 — El código del idioma es `pt`; la región sale del país
Decisión de diseño (verificada en el código, no asumida):

- `p_paises.idioma_sugerido` es **`char(2)`** → solo 2 letras.
- `Lang` es el tipo derivado de `SUPPORTED`, y `tests/i18n/language-resolver.test.js`
  exige `/^[a-z]{2}$/`.
- `p_config_region.idioma_default` es `text` sin CHECK → admite `'pt'`.

Por lo tanto el **idioma se persiste como `'pt'`**, y el **locale regional se
compone del país del usuario**:

```
buildLocale('pt', 'BR') = 'pt-BR'   -> R$ 1.234,50  |  10 de outubro de 2026
buildLocale('pt', 'AO') = 'pt-AO'
buildLocale('pt', 'PT') = 'pt-PT'   -> (futuro: el mismo 'pt' con pais PT)
```

Esto es exactamente el mecanismo que ya usa el español (`es` + `AR` → `es-AR`).
Un usuario de Portugal futuro elige el mismo idioma `'pt'` y, por su país, obtiene
el locale `pt-PT` sin que el diccionario tenga que cambiar.

### S3 — Sin cambios en la maquinaria
Todo lo siguiente ya soporta `pt` sin tocar nada:

| Pieza | Por qué no hay que tocarlo |
|---|---|
| `buildLocale` | regex `{2,3}`: `pt` es válida; compone la región del país |
| `normalizeLocale` / `resolveLanguage` | genéricos |
| `isSupported` / `fallbackChain` | genéricos; `fallbackChain('pt')` → `['pt', 'es']` |
| Los 28 formatters migrados | ya leen el locale activo |
| `Intl.DisplayNames` | `of('pt')` → "português" |
| `p_config_region.idioma_default` | `text` sin CHECK |

### S4 — El pipeline se generaliza a N idiomas
`scratch/i18n-manifest.mjs`, `scratch/i18n-chunks.mjs` y `scratch/i18n-assemble.mjs`
hoy tienen `es` y `en` escritos a mano. Pasan a recibir el idioma destino por
argumento, y el **idioma de origen** sigue siendo `es` (el diccionario maestro).

### S5 — Los tests se generalizan a N idiomas
`tests/i18n/en-dictionary-parity.test.js` está hardcodeado a `es`/`en`. Pasa a
iterar sobre `SUPPORTED`, así que agregar un idioma no obliga a tocar el test.

### S6 — La refutación usa `bug-fixer` como uno de los revisores
> "usa bug-fixer como uno de los refuter."

Dos revisores independientes sobre las claves dudosas:
- **`jd-judge-a`** (revisor adversarial, como en el inglés).
- **`bug-fixer`** (revisor de fiabilidad, como pidió el dueño).

## Decisión de mercado: por qué `pt` (Brasil) y no dos idiomas

El 24% del vocabulario de la app diverge entre los dos mercados, y en palabras de
uso cotidiano:

| Español | 🇧🇷 Brasil | 🇵🇹 Portugal |
|---|---|---|
| movimiento | movimentação | movimento |
| cuota | **parcela** | **prestação** |
| gasto | gasto | despesa |
| sueldo | **salário** | **vencimento** |
| alquiler | **aluguel** | **renda** |
| retiro | **saque** | **levantamento** |
| factura | conta de luz | fatura |
| celular | celular | **telemóvel** |

Razón para Brasil: `BR` está `soportado = true` con `BRL` (2 decimales, `R$`), y
**8 de los 9 países lusófonos** del catálogo comparten el portugués de Brasil
(BR, AO, CV, GW, MZ, ST, TL). Cuando se quiera Portugal, el 76% del vocabulario ya
está escrito: es un delta, no una traducción desde cero.

## Glosario (portugués de Brasil, registro financiero)

Registro: **portugués financiero de Brasil**, claro y natural, no literal.
Sin voseo (el portugués de Brasil no lo usa). Segunda persona `você`.
Sin calcos del español ni del inglés.

| Español | Português (BR) | Nota |
|---|---|---|
| billetera | carteira | nunca "bolsa" |
| cuenta | conta | |
| movimiento | transação | o "movimentação" no: "transação" |
| egreso / ingreso | despesa / receita | |
| saldo | saldo | |
| monto | valor | o "quantia" |
| rubro / subrubro | categoria / subcategoria | |
| presupuesto | orçamento | |
| sobre | envelope | o "envelope de reserva" |
| ahorro | poupança | |
| inversión | investimento | |
| tarjeta | cartão | `cartão de crédito` |
| cuota | **parcela** | NO "cota" |
| resumen de tarjeta | extrato do cartão | o "resumo do cartão" |
| conciliación / conciliar | conciliação / conciliar | |
| pendiente de aprobación | pendente de aprovação | o "quarentena" |
| saneamiento | saneamento | |
| supervivencia | sobrevivência | |
| escudo de tiempo | escudo de tempo | |
| licuadora | liquidificador | módulo de inflação |
| hormigas | formigas | gasto pequeno e recorrente |
| podadora | podadeira | |
| ROI Emocional | ROI Emocional | mantém "ROI" |
| día ancla | dia âncora | |
| base cero | base zero | |
| modo libertad | modo livre | |
| plazo fijo | renda fixa | |
| cedear | CEDEAR | não se traduz |
| fuente de ingreso | fonte de renda | |
| origen / destino | origem / destino | |
| teléfono / celular | celular | |
| sueldo | **salário** | |
| alquiler | **aluguel** | |
| factura | **conta** (de luz) | "fatura" quando é documento |
| retiro | **saque** | |

**Nunca traduzir**: ARS, USD, EUR, BRL (códigos de moeda); "War Room" (nome do
módulo); emoji; placeholders (`{monto}`, `{dias}`, …) — **byte a byte**.

## Tasks

| ID | Specs | Tarea | Ruta | Commit |
|----|-------|-------|------|--------|
| T1 | S4, S5 | Generalizar el pipeline y el test de paridad a N idiomas | `scratch/i18n-*.mjs`, `tests/i18n/*-parity.test.js` | — |
| T2 | S3 | Cableado: `SUPPORTED = ['es','en','pt']`, `dictionaries = { es, en, pt }`, `DEFAULT_LANG` sigue `'es'` | `src/locales/language.ts`, `src/locales/i18n.ts` | — |
| T3 | S1, S2 | `src/locales/pt.ts`: diccionario portugués de Brasil (2288 keys, 10 secciones) | `src/locales/pt.ts` | — |
| T4 | S3 | Verificar que el locale `pt-BR` se compone del país y que el selector muestra las 3 opciones | `src/pages/Configuracion/RegionFormatoPage.tsx` | — |
| T5 | S6 | Refutación con `jd-judge-a` + `bug-fixer` sobre las claves dudosas + aplicar el acuerdo | `src/locales/pt.ts` | — |
| T6 | — | Verificación: `tsc`, suite, `check-i18n`, build | — | — |

## Archivos que toca esta entrega

**NUEVO**
- `src/locales/pt.ts`
- `scratch/i18n-manifest.mjs`, `scratch/i18n-chunks.mjs`, `scratch/i18n-assemble.mjs` (parametrizados)
- `scratch/pt-brief.md`

**MODIFICADO**
- `src/locales/language.ts` — `SUPPORTED`
- `src/locales/i18n.ts` — `dictionaries`
- `tests/i18n/en-dictionary-parity.test.js` → generalized a N idiomas (o renombrado)
- `tests/i18n/language-resolver.test.js` — asserts de `SUPPORTED`
- `tests/i18n/language-dictionary-coverage.test.js` — sin cambios (ya itera `SUPPORTED`)
- `.gitignore` — allowlist de los tests nuevos
- `odd/tasks/i18n-pt-br.md` — este documento

**NO TOCADO**
- `src/locales/es.ts`, `src/locales/en.ts` — **los diccionarios existentes no se tocan**
- `funcionesSQL/**`, `temp_sql/**`, `supabase/**` — **cero SQL**
- Los 37 archivos migrados en la feature del inglés — ya soportan `pt` sin cambios

## Log

- **L1** (pedido original, verbatim): "Evalua la posibilidad de agregar el idioma
  portugues para brasil y portugal."
- **L2** (decisiones del dueño, 2026-10-20): "1. pt-BR solo / 2. Brasil / 3. generaliza."
  + "usa bug-fixer como uno de los refuter."
- **L3** (investigación, read-only, antes de la autorización): el terreno técnico
  soporta `pt` sin cambios de maquinaria. `idioma_sugerido` es `char(2)`;
  `idioma_default` es `text` sin CHECK; `BR` y `PT` ya están `soportado = true`
  con `idioma_sugerido = 'pt'`; `buildLocale` compone la región desde el país;
  el test de `SUPPORTED` exige 2 letras. El coste real es la traducción (2288
  keys) y el pipeline, que hay que parametrizar.
- **L4** (hallazgo, 2026-10-20): la collación fija en `'es'` de
  `src/lib/categorySorting.ts` **no produce diferencia observable** con un
  vocabulario en inglés o portugués (probado con palabras acentuadas y con
  acentos en medio de la lista). No se toca.
- **L5** (hallazgo, 2026-10-20): el índice de búsqueda de países
  (`src/lib/countryCatalog.ts:155-156`) indexa solo `es` y `en`. Con `pt` added,
  un usuario que busca "portugues" no encuentra el país. **Riesgo bajo**:
  `Intl.DisplayNames` devuelve "Brasil" y "Portugal" en los tres idiomas, así que
  los nombres ya indexados coinciden. Queda anotado como deuda menor.
- **L6** (hallazgo, 2026-10-21): el maestro `es.ts` no tiene una key propia para
  el placeholder de confirmacion del borrado de DATOS. `ConfiguracionBorradoCard`
  exige escribir `BORRAR DATOS` (`DELETE_DATA_CONFIRMATION_TEXT`) pero pinta
  `t('privacidad_delete_placeholder')`, que en español dice "Escribe ELIMINAR".
  El input hace `toUpperCase()`, así que el placeholder no depende del idioma.
  **Preexistente**: el inglés copió el mismo desajuste. No es parte de esta
  entrega; queda anotado como deuda visible.
- **L7** (hallazgo, 2026-10-21): el **inglés está partido** en el concepto
  "subcuenta": `unit_subaccounts_singular` dice "subcategory" pero
  `subcat_form_title_edit` dice "Subaccount". El español dice "Subcuenta" en las
  7 keys. El portugués heredó la partición ("Subcategoria" x20 vs "Subconta"
  x6). Cuando la referencia está rota, el término se decide desde el español y
  el modelo de datos, no desde el inglés.
- **L8** (hallazgo, 2026-10-21): `src/lib/bcgUtils.ts` es la fuente de verdad
  del vocabulario del BCG: cada cuadrante tiene su emoji
  (`bcg_dog: { emoji: '🐕' }`). El "Perro" del español es el cuadrante DOG del
  framework, o sea "Cão" en portugués de Brasil. El subagente que tradujo el
  chunk `bcg` llegó a la misma conclusión verificando el emoji.
- **L9** (hallazgo, 2026-10-21): "Buzón de Deseos" NO es terminología: es el
  nombre por defecto de un buzón que el usuario puede renombrar
  (`reto.buzon_nombre ?? t('mailbox')` en `src/components/bcg/BCGHormigas.tsx:201`).
  Se traduce como nombre propio, no como término de glosario.
- **L10** (hallazgo, 2026-10-21): los marcadores de "sobrante" del test de
  paridad no pueden ser palabras que el portugués de Brasil también usa
  (`celular`, `nenhum`, `extrato`, `cota`): el test hace match por palabra
  completa, así que un término válido haría fallar el test. Los marcadores de
  `pt` quedan reducidos a términos inequívocamente ajenos o de Portugal.
- **L11** (hallazgo, 2026-10-21): la lista de marcadores del español **no se
  puede aplicar a todos los idiomas**. Sus entradas son palabras funcionales
  que el portugués de Brasil también usa (`agrega`, `falta`, `usa`, `menos`,
  `concilia`, `carga`, `guarda`, `busca`): marcaron 48 valores portugueses
  correctos. Cada idioma lleva ahora sus propios marcadores, y el inglés
  conserva la lista completa del español más sus propios typos.
- **L12** (hallazgo, 2026-10-21): el voseo español sobrevive pegado al
  pronombre enclítico ("revisá-las"), y el test de paridad **no puede
  detectarlo**: matchea por palabra completa y "revisá-las" es una sola
  palabra. El defecto real era de GÉNERO (el español dice "revisarlos", por
  "los documentos legales"). Corregido.
- **L13** (hallazgo, 2026-10-21, arbitraje de la ronda 2): el revisor B
  reportó "Contas principais" para \`config_ie_summary_cats_parent_created\`
  porque así dice el español. **El español es el que está mal**: el código
  renderiza \`result.parentsCreated\` y \`result.subsCreated\`, y el inglés
  dice "Parent categories" / "Subcategories". La traducción portuguesa sigue
  al inglés, que es lo correcto.
- **L14** (hallazgo, 2026-10-21, arbitraje de la ronda 2): el revisor B
  propuso "Saldo transportado" para el carryover. El código lo renderiza
  siempre con signo negativo (\`-{fmt(arrastre)}\`), así que "Saldo negativo"
  es correcto y "transportado" perdería el signo.
- **L15** (hallazgo, 2026-10-21, arbitraje de la ronda 2): el revisor B
  reportó "Buzo de Desejos" (sin tilde). El archivo real tiene "Buzão"
  (5 ocurrencias, 0 sin tilde): el reporte leyó mal el archivo.
- **L16** (hallazgo, 2026-10-21, ronda 2, aplicado): el ticket/recibo estaba
  partido en dos palabras para un mismo concepto. El español dice "Ticket" en
  5 keys y el inglés lo unificó como "Receipt". Se unifica en
  **"comprovante"** (6 keys, el término financiero de Brasil y el que ya
  usaban las keys de OCR). Y el nombre de la sección de carga queda como
  **"Lançamento"** en las 4 keys de `reports` más \`settings_entry_load_registry\`.
- **L17** (hallazgo, 2026-10-21, ronda 2, aplicado): la jerarquía de categorías
  se unifica como **"Subcategoria"** (38 keys, 0 "Subconta"). La evidencia es
  el modelo de datos: la RPC es \`fn_crear_subcuenta_egreso\` con \`p_padre_id\`
  y \`AddCategoryModal.tsx\` la llama "Campos para Subcategoría (Subcuenta
  Hija)". "Subconta" en portugués es una palabra real (subcuenta bancaria) y
  además el español mezcló los dos nombres.
- **L18** (hallazgo, 2026-10-21, ronda 2, aplicado): "cupo" tiene DOS
  significados en la app — el TIPO de categoría (Necesidad/Deseo/Ahorro) y el
  LÍMITE presupuestario. El tipo pasa a **"tipo de alocação"** (la palabra
  "cota" está prohibida por el glosario y "limite" colisionaba con el otro
  significado); el límite sigue siendo "Limite".
- **L19** (hallazgo, 2026-10-21, ronda 2, aplicado): el vocabulario de ingreso
  sigue las DOS entradas separadas del glosario: **"fonte de renda"** para la
  entidad nombrada y **"receita"** para el flujo de ingreso. Una unificación
  previa a "fonte de receita" contradecía el brief y se revirtió.
- **L20** (hallazgo, 2026-10-21, ronda 2, aplicado): un único hallazgo de
  género, no de voseo: el español dice "revisarlos" (los documentos legales) y
  el portugués decía "revisá-las", que apuntaba a "alterações".
- **L21** (hallazgo, 2026-10-21): el revisor \`jd-judge-a\` no entregó informe
  (123 turnos sin cerrar; se canceló y su trabajo se cubrió con los
  detectores de \`scratch/\` y con el arbitraje documentado en
  \`scratch/pt-arbitration.md\`). El revisor \`bug-fixer\` entregó 22 hallazgos:
  7 se aplicaron, 3 se descartaron por falta de evidencia del repositorio, y
  el resto eran observaciones menores de registro o longitud.
