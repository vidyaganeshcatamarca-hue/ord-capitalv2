# Translation toolchain

How the Spanish dictionary reaches the other languages, and how to update a
language when the Spanish grows.

## The shape of it

`src/locales/es.ts` is the master. Every other dictionary is its mirror: the
same keys, the same placeholders, in the same order. A key that exists in the
Spanish and not in a translation falls back to Spanish at runtime, so a
language can lag behind without breaking the UI — but the tests catch it.

| File | What it does |
|---|---|
| `src/locales/language.ts` | The list of shipped languages (`SUPPORTED`) |
| `i18n/ledger.json` | For every translated key: the Spanish it was made from, and the translation |
| `scripts/i18n/status.mjs` | How far along every language is |
| `scripts/i18n/ledger.mjs` | What changed since the last translation |
| `scripts/i18n/delta.mjs` | The keys a language still owes |
| `scripts/i18n/assemble.mjs` | Build `src/locales/<lang>.ts` from the translated chunks |
| `scripts/i18n/chunks.mjs` | Split the work into chunks for the translators |
| `scripts/i18n/manifest.mjs` | Extract the Spanish into a JSON manifest, and verify a dictionary against it |
| `scripts/i18n/uncertain.mjs` | Collect the keys the translators flagged as doubtful |
| `scripts/i18n/apply-fixes.mjs` | Apply the agreed corrections of a refutation round |
| `scripts/check-i18n.mjs` | The older gate: keys called but not defined, hardcoded Spanish, dead keys |

## The daily loop

When new copy lands in `src/locales/es.ts`:

```bash
# 1. record the new Spanish as the base the translations are measured against
npm run i18n:ledger -- build

# 2. see what each language still owes
npm run i18n:status

# 3. for each language, produce the work: ONLY the new or stale keys
npm run i18n:delta -- en
npm run i18n:delta -- pt

# 4. translate the chunks in scratch/en-delta-output/ (and pt-delta-output/)
#    same format the translators already use:
#    { section, part, parts, entries: { key: { es, ph } } }

# 5. rebuild the dictionary from the translated chunks
npm run i18n:assemble -- en

# 6. record the new translations
npm run i18n:ledger -- build
```

Step 3 is the point of the whole toolchain: it never hands a translator the
whole dictionary, only the keys that are new or that the Spanish moved under.

## Why the ledger exists

A dictionary file holds only the translation. When the Spanish text of a key
changes, nothing in the target file says the translation is now out of date —
the only way to notice is to read both files side by side and understand
Spanish.

The ledger closes that gap. For every key it stores the Spanish text the
translation was made from:

```json
"errors.onboarding_country_change": {
  "from": "Elegir otro país",
  "to": "Choose another country"
}
```

When the Spanish changes to `"Elegir otro país o región"`, the stored `from`
no longer matches, and the key is reported as **stale**: the translation
exists, but it may no longer say the same thing, so it goes back into the
delta.

It is in version control on purpose. Without it, the next person cannot tell
which translations are current.

## The four states of a key

| State | What it means | What to do |
|---|---|---|
| missing | never translated | translate it |
| stale | the Spanish changed under the translation | translate it again |
| drifted | the placeholders no longer match | translate it again |
| changed | the translation changed since the ledger was written | record the new ledger |

A key is **drifted** when the placeholders differ: the Spanish says
`{monto}` and the translation says `{valor}`. In the app that renders as a
literal `{valor}`, so it is never a "close enough".

## The language code and the region

The language is stored as two letters (`es`, `en`, `pt`) and the region comes
from the country: `buildLocale('pt', 'BR')` gives `pt-BR`, which renders BRL
as `R$ 1.234,50`. A user in Portugal gets the same dictionary with the
`pt-PT` locale, so no second dictionary is needed.

## Adding a language

1. Add the code to `SUPPORTED` in `src/locales/language.ts`.
2. Create `src/locales/<lang>.ts` as a copy of `es.ts` (the fallback keeps the
   app working while the translation is in progress).
3. Wire it in `src/locales/i18n.ts`: add the import and the entry in the
   `dictionaries` map.
4. Translate with the same pipeline: `chunks.mjs` → translate → `assemble.mjs`.
5. Run `npm run i18n:ledger -- build` to record it.

`tests/i18n/dictionary-parity.test.js` iterates `SUPPORTED`, so it picks the
new language up on its own.
