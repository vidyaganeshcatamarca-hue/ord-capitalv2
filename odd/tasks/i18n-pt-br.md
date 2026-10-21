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
