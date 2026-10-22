---
name: i18n-translate
description: "Trigger: translate a language from scratch, add a new language, traducir un idioma nuevo, traducir la base completa, empezando un idioma desde cero, bulk translation of the whole dictionary, refutar traducciones, arbitrar términos. Traduce el diccionario COMPLETO de un idioma, con traducción por chunks, refutación por dos revisores independientes y arbitraje con evidencia del repositorio."
license: Apache-2.0
metadata:
  author: vidyaganesh-catamarca-hue
  version: "1.0"
---

# I18N Translate — traducir un idioma entero, desde cero

Traducir la base completa de ORD Capital Personal a un idioma nuevo, con el
proceso que ya se probó con inglés y portugués de Brasil.

## Activation Contract

Levantá esta skill cuando te pidan:
- traducir la app a un idioma nuevo, entero, desde cero
- empezar un idioma que todavía no existe
- rehacer un idioma completo porque cambió mucho
- refutar traducciones o arbitrar términos dudosos

**NO** la levantes para los cambios posteriores. Si el idioma ya existe y lo
que cambió son keys sueltas, la skill es **`i18n-update`**: esa hace el
update incremental. Esta es la del idioma nuevo, la que traduce todo.

Las dos se complementan: esta deja el idioma completo y registrado; la otra
mantiene al día lo que se toca después.

## Los dos flujos

| | `i18n-translate` (esta) | `i18n-update` |
|---|---|---|
| Cuándo | el idioma no existe | el idioma ya existe |
| Trabajo | las ~2300 keys | solo las keys que cambiaron |
| Herramienta | `chunks.mjs` → `assemble.mjs` | `delta.mjs` → `apply-delta.mjs` |
| Refutación | sí, obligatoria | no hace falta |

## El terreno

`src/locales/es.ts` es el **maestro** (2291 keys, 10 secciones). Todo otro
diccionario es su **espejo**: mismas keys, mismos placeholders, en el mismo
orden.

| Archivo | Qué es |
|---|---|
| `src/locales/es.ts` | el maestro. Nunca se traduce, nunca se toca en este flujo |
| `src/locales/<lang>.ts` | el espejo del idioma nuevo |
| `src/locales/language.ts` | `SUPPORTED`: los idiomas que se envían |
| `src/locales/i18n.ts` | el `import` y el mapa `dictionaries` |
| `i18n/ledger.json` | el registro: qué español se tradujo en cada key |
| `scripts/i18n/` | las herramientas (abajo) |

### Las herramientas

```bash
node scripts/i18n/manifest.mjs extract <lang>   # -> scratch/i18n-manifest-<lang>.json
node scripts/i18n/chunks.mjs <lang>              # -> scratch/<lang>-input/*.json
node scripts/i18n/assemble.mjs <lang>            # -> src/locales/<lang>.ts
node scripts/i18n/uncertain.mjs <lang>           # -> scratch/<lang>-uncertain.json
node scripts/i18n/apply-fixes.mjs <lang>          # aplica las correcciones acordadas
npm run i18n:status                              # cuánto está traducido cada idioma
npm run i18n:ledger -- build                     # registra el estado
```

## El pipeline

### 0. Preflight

Antes de traducir una sola palabra:

- **El idioma no existe todavía.** Si ya existe, esta no es la skill: es
  `i18n-update`.
- **La rama no es `main` ni `produccion`.** Nunca se commitea en esas. Si
  estás en una, creá la rama de la feature y pasala en el prompt de cada
  subagente: los subagentes tienen que **rechazar** el commit si el prompt
  los deja en `main` o `produccion`, y reportar el bloqueo.
- **`src/locales/es.ts` no se toca.** Es el maestro.
- **La base de datos aguanta el código.** `idioma_sugerido` es `char(2)` y
  `idioma_default` es `text` sin CHECK: cualquier código de dos letras entra.
  No hace falta migración.
- **El plan de trabajo está escrito.** Un `odd/tasks/<feature>.md` con las
  specs, el glosario y el registro de las decisiones. Es lo que leen los
  subagentes.

### 1. Extraer el maestro

```bash
node scripts/i18n/manifest.mjs extract <lang>
```

Produce `scratch/i18n-manifest-<lang>.json`: cada key con su texto español y
la lista de sus placeholders.

### 2. Partir el trabajo

```bash
node scripts/i18n/chunks.mjs <lang>
```

Produce `scratch/<lang>-input/*.json`, un chunk por sección (una sección se
parte en varios si pasa de 220 keys). Los nombres salen de las secciones del
maestro: `errors.json`, `war_room.json`, `inversiones-2.json`.

**Por qué partir:** 2291 keys en un solo prompt es una calidad que no se
sostiene. Con chunks, cada traductor ve un pedazo acotado y el assembler
después lo vuelve a unir.

### 3. Escribir el brief

`scratch/<lang>-brief.md` es lo que recibe cada traductor. **No es opcional.**
Sin el brief, cada traductor inventa su propio registro y el resultado
consiste en 16 traducciones de estilos distintos.

El brief dice: qué es la app, el formato de entrada y de salida, la regla de
los placeholders, el registro (formalidad), el glosario, las notas por
sección y las reglas de ejecución. La plantilla está en
`references/translator-brief.md`.

### 4. Traducir

Un subagente por chunk, en paralelo, cada uno con su brief.

Cada uno escribe **un solo archivo**: `scratch/<lang>-output/<mismo nombre>.json`.

El subagente **no puede**:

- correr `tsc`, `npm run build`, `vitest`, `jest` ni `npm test` (eso lo corre
  el orquestador: es lento y gasta tokens del usuario)
- editar `src/locales/es.ts` ni `src/locales/<lang>.ts`
- escribir documentación
- tocar ningún archivo fuera de `scratch/<lang>-output/`

El prompt del subagente **tiene que** incluir el bloque:

```
## Allowed edit surfaces
scratch/<lang>-output/<chunk>.json
```

Es lo que el harness exige para acotar las escrituras. Sin ese bloque, el
lanzamiento se rechaza.

**Sobre los subagentes que se traban:** si un traductor pasa de ~90 turnos
sin escribir, no lo esperes. Cortalo y traducí ese chunk a mano. Es preferible
un chunk humano a un chunk que nunca llega.

### 5. Ensamblar

```bash
node scripts/i18n/assemble.mjs <lang>
```

El assembler valida **antes** de escribir: mismas keys, mismo orden, mismos
placeholders, ningún valor vacío. Si un chunk no pasa, no escribe nada y dice
por qué.

### 6. Cablear el idioma

1. `src/locales/language.ts`: agregá el código a `SUPPORTED`.
2. `src/locales/i18n.ts`: el `import * as <lang> from './<lang>.js'` y la
   entrada en el mapa `dictionaries`.

`tests/i18n/dictionary-parity.test.js` itera `SUPPORTED`, así que toma el
idioma nuevo solo.

### 7. Juntar las dudas

```bash
node scripts/i18n/uncertain.mjs <lang>
```

Produce `scratch/<lang>-uncertain.json`: la lista acotada de keys que los
traductores marcaron como dudosas. Los refutores trabajan sobre esa lista,
no sobre las 2291 keys.

### 8. Refutar

**Dos revisores independientes, en paralelo, ciegos entre ellos.** Cada uno
hace su propia revisión desde cero. El punto no es tener dos opiniones: es
que dos personas que miran lo mismo desde distinto lugar encuentran cosas
distintas.

El rol del refutador está en `references/refuter-brief.md`. Lo esencial:

- Es **adversarial**: busca fallos, no valida. Si no encuentra nada, tiene que
  sospechar que no miró suficiente.
- Es **read-only**: reporta, no edita.
- Reporta por hallazgo: key exacta, español, traducción actual, su propuesta,
  por qué, y gravedad (CRÍTICO / ALTO / MEDIO).

Los dos refutadores trabajan en paralelo y **no se les dice qué encontró el
otro**. Si un revisor sabe lo que encontró el otro, deja de buscar. La
independencia es el punto: dos personas que miran lo mismo desde distinto
lugar encuentran cosas distintas, y por eso el trabajo se reparte.

**Si un revisor no entrega informe, no lo esperes indefinidamente.** Cancelalo
y cubrí su mitad con detectores propios: consistencia de términos, divergencia
entre secciones, formas del mismo término, marcadores de español residual,
voseo, y valores candidatos. La cobertura no se negocia aunque el revisor
falle.

### 9. Arbitrar

El orquestador arbitra, y **arbitra con evidencia del repositorio**, no con
opinión. La evidencia que manda:

| Fuente | Qué resuelve |
|---|---|
| Cuántas keys usan el término | el que aparece en 100 keys es el correcto; el de 3 es el error |
| El modelo de datos (nombres de RPC, columnas) | qué concepto es en realidad |
| El código que lo renderiza | el signo y el formato (un valor que siempre se renderiza con menos es "saldo negativo", no "saldo transportado") |
| El idioma que YA se entregó | el precedente, cuando es consistente |

**Cuando el idioma ya entregado está partido, el español y el modelo de datos
deciden.** El inglés fue la referencia inconsistente para "Subcuenta" /
"Subaccount": mandaron las 7 keys del español y la RPC
`fn_crear_subcuenta_egreso`.

**Registrá cada arbitraje**: qué se propuso, qué evidencia lo sostiene
(counts, archivo, código) y qué se decidió. En el Log del task file, no en tu
cabeza. Sin eso, la próxima persona repite el debate.

**Si el revisor leyó mal el archivo, descartalo y decilo.** Un revisor
reportó "Buzo de Deseos" sin tilde: el archivo tiene "Buzão" 5 veces.

### 10. Aplicar las correcciones

Las correcciones acordadas van en `scratch/fixes-<lang>.mjs`, y:

```bash
node scripts/i18n/apply-fixes.mjs <lang>
```

Una corrección que cambie los placeholders de su key es **rechazada**.

### 11. Registrar

```bash
npm run i18n:ledger -- build
```

**Va AL FINAL.** El build graba el español actual como la base de cada
traducción: hacerlo antes de traducir borraría la señal de lo que falta, y el
cambio se perdería en silencio. El build ahora se niega a correr con trabajo
pendiente.

### 12. Verificar

```bash
node --test tests/i18n/dictionary-parity.test.js          # la puerta real
node --test tests/i18n/language-dictionary-coverage.test.js
npm run i18n:status                                        # 100%
npm run i18n:ledger -- check                              # 0 pendiente
npx tsc --noEmit
npm run build
node scripts/check-i18n.mjs                                # el MISMO conteo que el baseline
```

**El test de paridad es la puerta.** Compara los tres diccionarios contra el
maestro: mismas keys, mismos placeholders en el mismo orden, ningún valor
vacío, ninguna palabra en español colada, y el traductor real devolviendo el
valor correcto.

`check-i18n` tiene una deuda vieja (keys llamadas pero no definidas, keys
muertas). Lo que importa es que el conteo **no haya cambiado** respecto del
baseline: si subió, algo nuevo quedó sin traducir.

### 13. Detectar español residual

Cada idioma necesita **sus propios** marcadores de español residual, en
`tests/i18n/dictionary-parity.test.js`. No se pueden compartir: una palabra
que es español residual en inglés es una palabra **válida** en portugués.

En portugués de Brasil, estas son válidas y dan falsos positivos si las
marcás: `celular`, `nenhum`, `extrato`, `cota`.

### 14. Commitear

Commits de unidad de trabajo, Conventional Commits, con los tests y la
documentación al lado del comportamiento. **Nunca** `Co-Authored-By` ni
atribución de IA. **Nunca** en `main` ni `produccion`. El push y el PR son
decisiones del dueño.

## Cómo se llama todo

El **código de idioma** son dos letras minúsculas, ISO 639-1: `en`, `pt`,
`de`, `fr`. Se persiste tal cual (`char(2)` en la base).

**El idioma NO lleva la región.** `pt` no es `pt-BR` guardado: la región sale
del país del usuario, con `buildLocale(lang, countryCode)`. Un usuario de
Portugal con idioma `pt` recibe el diccionario de Brasil con locale `pt-PT`:
es una deuda visible, y es aceptable. Fijar `en-US` o `pt-BR` global rompe el
formato de moneda de los demás países.

| Qué | Cómo se llama |
|---|---|
| el diccionario | `src/locales/<lang>.ts` |
| el manifiesto | `scratch/i18n-manifest-<lang>.json` |
| los chunks de entrada | `scratch/<lang>-input/<seccion>[-<n>].json` |
| los chunks traducidos | `scratch/<lang>-output/<mismo nombre>.json` |
| el brief | `scratch/<lang>-brief.md` |
| el informe de dudas | `scratch/<lang>-uncertain.json` |
| las correcciones | `scratch/fixes-<lang>.mjs` |
| el código en `SUPPORTED` | `src/locales/language.ts` |
| el cableado | `src/locales/i18n.ts` |

**Las secciones y las keys no se renombran.** Vienen del maestro y se
respetan tal cual. Las keys con punto (`'home.step1.title'`) son nombres
literales: se conservan exactamente y solo se traduce el valor.

**El nombre de un idioma es una decisión del dueño.** Si hay más de una
variante regional (portugués de Brasil y de Portugal), se **elige una** y se
sirve. Dos diccionarios para la misma lengua es el error que más caro sale.

## El formato de un chunk

Entrada y salida tienen **la misma forma**. Lo único que cambia es el string
en `es`:

```json
{
  "section": "errors",
  "part": 1,
  "parts": 1,
  "entries": {
    "error_field_required": { "es": "El campo {field} es obligatorio.", "ph": ["field"] }
  }
}
```

La salida de la misma key:

```json
{
  "section": "errors",
  "part": 1,
  "parts": 1,
  "entries": {
    "error_field_required": { "es": "The {field} field is required.", "ph": ["field"] }
  }
}
```

- Las keys: **exactamente** las mismas, en el mismo orden. Ni una más, ni una
  menos, ni reordenadas.
- `ph`: **exactamente** igual. No se agrega, no se saca, no se reordena.
- `es`: el español reemplazado por la traducción.
- JSON válido. Sin coma final, sin comentarios.

## La regla del placeholder

Es lo que más rompe, y lo que más caro sale.

`{nombre}` se reemplaza en el render. Un placeholder renombrado, perdido,
duplicado o reordenado deja un `{monto}` literal en pantalla, o peor: imprime
el número en el lugar equivocado.

**El nombre sobrevive byte a byte.** La posición en la frase puede cambiar
(el orden de las palabras es otro), el nombre no.

- `{monto}` sigue `{monto}`. No `{amount}`, no `{valor}`, no `{quantia}`.
- El conjunto de placeholders tiene que ser exactamente el array `ph`.
- La cantidad tiene que ser exactamente la misma.

El assembler y el test de paridad verifican los dos: nombre y orden.

## El glosario

Un concepto, un término. En toda la app.

- El término que ya está en 100 keys es el correcto.
- El que aparece en 3 es el error.
- **Dos palabras del español NO son la misma palabra.** "fuente de ingreso" y
  "ingreso" son dos: `fonte de renda` y `receita`. Unificarlas contradice el
  brief.
- Cuando el español mezcla dos nombres para un mismo concepto (el español
  decía "Subcuenta" y "Subrubro" para lo mismo), el modelo de datos decide.

El glosario established está en `references/terminology.md`.

## Lo que los errores cuestan

El detalle completo está en `references/traps.md`. Los que más dolieron:

1. **Un placeholder renombrado.** Bug crítico: sale `{valor}` en pantalla.
2. **Doble escapado.** El diccionario guarda el valor escapado (es lo que
   necesita un literal TS) pero la app lo renderiza sin escapar. Leer sin
   deshacer y escribir aplicando el escape otra vez duplica las barras y
   convierte una comilla en una barra visible. Regla: **leer SIN escapes,
   escribir ESCAPANDO**.
3. **16 chunks, 16 estilos.** Sin brief, cada traductor decide su registro.
4. **Un término unificado de más.** Arreglar la inconsistencia de una
  	key destruyendo la distinción de otra es un retroceso.
5. **Traducción mecánica.** La copy la lee alguien que administra su plata:
   tiene que sonar natural, no traducida.

## Verificación

La puerta real es `tests/i18n/dictionary-parity.test.js`. Si el paridad pasa y
`i18n:status` dice 100%, el idioma está listo.

Los fallos **preexistentes** del repo (no los arregles en este flujo):
`budget-modal-select-action`, `consent-v2-i18n`, `i18n-nested-keys`,
`run_transfer_insufficient_balance` (credenciales de Supabase).

## Referencias

| Archivo | Qué tiene |
|---|---|
| `references/translator-brief.md` | La plantilla del brief que recibe cada traductor |
| `references/refuter-brief.md` | La plantilla del brief que recibe cada refutador |
| `references/terminology.md` | El glosario establecido de inglés y portugués, y cómo armar uno nuevo |
| `references/traps.md` | Los errores acumulados, con la causa y la defensa |
