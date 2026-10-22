---
name: i18n-update
description: "Trigger: update a translation dictionary, translate new or changed keys, refresh the English or Portuguese dictionary after the Spanish changed, sincronizar traducciones, actualizar el diccionario de inglés o portugués. Traduce SOLO lo que cambió, no todo desde cero."
license: Apache-2.0
metadata:
  author: vidyaganeshcatamarca-hue
  version: "1.0"
---

# Actualizar los diccionarios de traducción

Traducir el cambio de un diccionario sin rehacer todo el diccionario.

## Activation Contract

Levantá esta skill cuando te pidan:
- actualizar la traducción al inglés o al portugués
- traducir keys nuevas o textos que cambiaron
- sincronizar los diccionarios después de tocar `src/locales/es.ts`

**NO** la levantes para: traducir una key puntual que se acaba de agregar (eso es editar el diccionario a mano), ni para revisar la calidad de una traducción que ya está.

## El terreno

`src/locales/es.ts` es el **maestro**. Los demás diccionarios son su espejo: mismas keys, mismos placeholders, en el mismo orden.

| | |
|---|---|
| Maestros | `es.ts` (2291 keys, 10 secciones) |
| Espejos | `en.ts`, `pt.ts` |
| Idiomas soportados | `SUPPORTED` en `src/locales/language.ts` |
| Registro | `i18n/ledger.json` — qué español se tradujo en cada key |

**El `ledger.json` es lo que hace posible el update incremental.** Anota, para cada key traducida, el texto español del que salió la traducción. Sin eso, cuando el español cambia, nada te dice que esa traducción quedó vieja: la única forma de saberlo es leer los dos archivos en paralelo y entender español.

## Los tres escenarios

El dueño edita `src/locales/es.ts` a mano. Puede pasar cualquiera de estas tres cosas:

| Escenario | Qué ve el ledger | Qué hay que hacer |
|---|---|---|
| El **texto** de una key cambió | `stale` | Traducir de nuevo |
| Una **key nueva** apareció | `missing` | Traducirla |
| Una key **se borró** (no se usa más) | `extra` | Sacar la traducción |

También hay un cuarto caso, `drifted`: la traducción ya no calza con los placeholders del español (`{monto}` contra `{valor}`). Es un bug: en pantalla saldrían las llaves.

**Esta skill es para los cambios sobre un idioma que YA existe.** Si el idioma no existe todavía, o hay que rehacer uno entero, la skill es **`i18n-translate`**: esa traduce la base completa desde cero, con chunks y refutación.

## El ciclo

```bash
# 1. Ver qué hay que hacer en cada idioma
npm run i18n:ledger -- check

# 2. Generar el trabajo para UN idioma: SOLO las keys que debe
npm run i18n:delta -- pt

# 3. Traducir los chunks de scratch/pt-delta-input/ y escribir el resultado
#    en scratch/pt-delta-output/ (el formato está abajo)

# 4. Aplicar la traducción al diccionario
npm run i18n:apply-delta -- pt

# 5. Registrar el estado nuevo
npm run i18n:ledger -- build
```

**Repetí del paso 2 al 5 para cada idioma.** El inglés y el portugués son independientes: el delta de uno no toca el otro.

### El paso 1 siempre primero

`npm run i18n:ledger -- check` dice el estado de cada idioma. Si dice `stale: 0, missing: 0, extra: 0, drifted: 0`, **no hay nada que hacer** para ese idioma: decilo y seguí.

### El orden importa

El `ledger build` **no puede ir antes**. Graba el español actual como la base de cada traducción, así que si lo corrés antes de traducir, queda registrado que la traducción salió de un texto que nunca se tradujo: el trabajo pendiente desaparece y el cambio nunca llega al otro idioma.

Por eso `build` **se niega a correr** si hay trabajo pendiente, y dice exactamente qué falta. Si decidiste conscientemente no traducir algo, se fuerza con `npm run i18n:ledger -- build --force`.

### El paso 3: el formato del chunk

`scratch/<lang>-delta-input/<seccion>.json` es la entrada:

```json
{
  "section": "errors",
  "part": 1,
  "parts": 1,
  "entries": {
    "onboarding_country_change": {
      "es": "Elegir otro país o región",
      "ph": []
    }
  }
}
```

La salida va en `scratch/<lang>-delta-output/<seccion>.json`, con la **misma forma** y el valor `es` reemplazado por la traducción:

```json
{
  "section": "errors",
  "part": 1,
  "parts": 1,
  "entries": {
    "onboarding_country_change": {
      "es": "Escolher outro país ou região",
      "ph": []
    }
  }
}
```

Reglas de la traducción:
- **El nombre del placeholder no cambia y su orden tampoco.** El array `ph` y los `{...}` del texto tienen que coincidir exactamente. Un nombre cambiado es un bug: en pantalla sale `{valor}` en vez del valor.
- **Los placeholders no se traducen.** `{nombre}` es el mismo nombre en los tres idiomas.
- **La key no cambia.** Es el mismo identificador.

Si el español cambió (key `stale`), el chunk trae la traducción vieja en `previous` cuando el comando la tiene: **mirá si la traducción vieja todavía sirve** antes de reescribirla. Si el sentido no cambió, alcanza con ajustarla.

### El paso 4: qué hace el apply

`apply-delta` aplica el delta **sobre el diccionario existente**. No lo reconstruye: solo toca las keys que el delta pidió, saca las que el español borró, y deja las que nadie tradujo como estaban (y las reporta, para que no se pierdan en silencio).

**Si algo falla, no escribe nada.** El apply se niega a escribir si:
- un placeholder no calza
- una traducción viene vacía
- queda alguna key del español sin traducir en el diccionario

### El paso 5: el registro

`ledger build` relee los dos archivos y anota el español de cada key. **Sin este paso, el ciclo siguiente ve todo como `stale`.** Es el paso que se olvida.

`build` se niega a correr si el idioma todavía debe keys. Es a propósito: si lo corrieras antes de traducir, el trabajo pendiente se perdería en silencio.

## Reglas que no se negocian

1. **Nunca reescribas el diccionario entero.** El update incremental existe para eso: si te pasás y traducís 2000 keys que no cambiaron, perdiste la capacidad de saber qué cambió.
2. **Nunca toques `es.ts` en este flujo.** Es el maestro. Si te piden agregar una key, eso es otra tarea.
3. **Nunca traduzcas un placeholder.** `{monto}`, `{nombre}`, `{count}` son nombres, no palabras.
4. **Un idioma a la vez.** El delta de `pt` no toca `en.ts` ni al revés.
5. **El `ledger build` es el último paso.** Sin él, el ciclo siguiente arranca roto.
6. **Si el delta viene vacío, no hay nada que hacer.** Decilo y salí. No inventes trabajo.

## Terminología

El glosario de cada idioma está en `scratch/<lang>-brief.md` cuando existe. Si no, respetá lo que ya usa el diccionario: **el término que ya está en 100 keys es el correcto**, y el que aparece en 3 es un error.

Palabras que se usan en los tres idiomas y no se traducen: `War Room`, `Safe-to-Spend`, `Burn rate`, `Runway`, `Heatmap`, `Insight`, `BCG`, `IPC`, `CEDEAR`, `TNA`, `Renda Fixa`, `Safe to Spend`.

## Verificación

Después del ciclo:

```bash
node --test tests/i18n/dictionary-parity.test.js      # las keys y los placeholders
node --test tests/i18n/translation-update.test.js     # el ciclo entero
node --test tests/i18n/translation-ledger.test.js     # el registro
npx tsc --noEmit
```

El test de paridad es el que importa: compara los tres diccionarios contra el maestro y falla si una key no calza.

**Los 4 fallos preexistentes** (`budget-modal-select-action`, `consent-v2-i18n`, `i18n-nested-keys`, `run_transfer_insufficient_balance`) no son tuyos. No los arregles en este flujo.

## Diagnóstico

| Síntoma | Causa probable |
|---|---|
| El delta sale vacío y vos esperabas trabajo | El ledger quedó desactualizado: corré `ledger build` (si se niega, hay trabajo pendiente: seguí el ciclo) |
| El ledger dice `changed` | Tradujiste pero no corriste `ledger build` al final |
| El apply dice "sin traducir" | El chunk del delta no tiene la key: el traductor la salteó |
| En pantalla sale `{valor}` en vez del valor | El nombre del placeholder cambió: revisá el `ph` del chunk |
| El apply se niega y no escribe | Un placeholder no calza: el mensaje dice cuál key |
| El delta tiene keys que no esperabas | Quedó un chunk de una corrida anterior en `-delta-output/` |

## Referencia rápida

| Comando | Qué hace |
|---|---|
| `npm run i18n` | El estado de todo, con el ciclo explained |
| `npm run i18n:status` | Cuánto está traducido cada idioma |
| `npm run i18n:ledger -- check` | Qué cambió desde la última traducción |
| `npm run i18n:ledger -- build` | Registrar el estado actual |
| `npm run i18n:delta -- <lang>` | El trabajo pendiente de un idioma |
| `npm run i18n:apply-delta -- <lang>` | Aplicar la traducción al diccionario |
| `npm run i18n:assemble -- <lang>` | Reconstruir el diccionario desde cero (solo para un idioma nuevo) |
