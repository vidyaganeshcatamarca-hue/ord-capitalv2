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
| `scripts/i18n/ledger.mjs` | What changed since the last translation, and the record of it |
| `scripts/i18n/delta.mjs` | The keys a language still owes |
| `scripts/i18n/apply-delta.mjs` | Apply a translated delta to the dictionary |
| `scripts/i18n/assemble.mjs` | Build `src/locales/<lang>.ts` from the translated chunks (a NEW language only) |
| `scripts/i18n/lib/dictionary.mjs` | The one reader and the one writer for a dictionary |
| `scripts/i18n/chunks.mjs` | Split the work into chunks for the translators |
| `scripts/i18n/manifest.mjs` | Extract the Spanish into a JSON manifest, and verify a dictionary against it |
| `scripts/i18n/uncertain.mjs` | Collect the keys the translators flagged as doubtful |
| `scripts/i18n/apply-fixes.mjs` | Apply the agreed corrections of a refutation round |
| `scripts/check-i18n.mjs` | The older gate: keys called but not defined, hardcoded Spanish, dead keys |
| `.agents/skills/i18n-update/SKILL.md` | The procedure an agent follows to run the whole cycle |

## The daily loop

When the copy in `src/locales/es.ts` changes — a text edited, a key added, a
key removed:

```bash
# 1. see what changed, for every language
npm run i18n:ledger -- check

# 2. for each language, produce the work: ONLY the keys that language owes
npm run i18n:delta -- en
npm run i18n:delta -- pt

# 3. translate the chunks in scratch/en-delta-output/ (and pt-delta-output/)
#    same format the translators already use:
#    { section, part, parts, entries: { key: { es, ph } } }

# 4. apply the translation to the dictionary
npm run i18n:apply-delta -- en
npm run i18n:apply-delta -- pt

# 5. record the new state
npm run i18n:ledger -- build
```

Step 2 is the point of the whole toolchain: it never hands a translator the
whole dictionary, only the keys that are new or that the Spanish moved under.

Step 4 applies the delta **on top of** the dictionary, not over it: the keys
that did not change are untouched, and the keys the Spanish dropped are taken
out. It checks the placeholders of every translation against the Spanish and
refuses to write anything if a check fails.

### The order matters

`ledger build` records the current Spanish as the base of every translation.
Building it **before** translating would erase the record of what still needs
work, and the change would never reach the other languages. That is why the
build refuses to run while a language owes keys, and why the order above
puts it last.

If a change was decided NOT to be translated, the build is forced with
`npm run i18n:ledger -- build --force`.

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

Plus a fifth, on the other side: **extra**, a key the translation still
carries and the Spanish no longer has. It is the leftover of a key that was
removed, and the update takes it out.

A key is **drifted** when the placeholders differ: the Spanish says
`{monto}` and the translation says `{valor}`. In the app that renders as a
literal `{valor}`, so it is never a "close enough".

## One reader, one writer

A dictionary file stores its values ESCAPED, because that is what a TS string
literal needs: `"Archivar \"{nombre}\"?"`. The app renders the value
UNESCAPED: `Archivar "{nombre}"?`.

Reading the file without undoing the escape, and writing it back with the
escape applied again, doubles the backslashes — and a quote turns into a
visible backslash on screen. The rule is one line: **read UNESCAPED, write
ESCAPED**.

`scripts/i18n/lib/dictionary.mjs` is the only place that does it. Every
script that touches a dictionary goes through it, so the reading and the
writing cannot disagree.

The writer also keeps the line ending of the file it replaces. The
repository stores LF and checks out with CRLF, so a writer that always
emitted LF left every dictionary looking modified to Git, with a diff that
showed nothing.

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
4. Translate the whole dictionary with the bootstrap pipeline:
   `chunks.mjs` → translate → `assemble.mjs`. A new language is the one case
   where the whole dictionary is the work; the incremental cycle is for the
   changes afterwards.
5. Run `npm run i18n:ledger -- build` to record it.

`tests/i18n/dictionary-parity.test.js` iterates `SUPPORTED`, so it picks the
new language up on its own.

## Running the cycle from an instruction

The whole cycle is a skill: `.agents/skills/i18n-update/SKILL.md`. An agent
that reads it and follows it detects the change, translates only what
changed, validates it, applies it and reports what is left.

The tests of the cycle run against a sandbox, a throwaway copy of the
dictionaries and the ledger: `tests/i18n/support/sandbox.mjs`. The commands
write to the files they read, so running them against the repo would make
the tests race each other and leave the working copy dirty.
