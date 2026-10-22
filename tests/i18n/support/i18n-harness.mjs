// Test harness: import the REAL src/locales/i18n.ts in plain Node.
//
// Why this exists: `i18n.ts` imports `@/lib/telemetry`, which pulls
// `@/lib/supabase`, which reads `import.meta.env` — a Vite-only global that
// plain Node does not define. The repo's other option was to pre-compile
// `i18n.ts` with tsc into `tests/lib/locales/` (see
// `tests/i18n/i18n-nested-keys.test.js`), but that artifact is a STALE copy
// from 2026-08-05 and it is why that test currently fails.
//
// This harness resolves the two specifier shapes the source uses (`@/...`
// aliases and relative `./x.js` -> `./x.ts`) and stubs the single Vite-only
// dependency, so the real translator can be exercised: real `t()`, real
// `setLanguage()`, real fallback chain.
//
//   node --test tests/i18n/en-dictionary-parity.test.js

import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const SRC = path.join(ROOT, 'src')

/** Stands in for `@/lib/telemetry`: the translator only needs these two. */
const TELEMETRY_STUB = `
export const TELEMETRY_PRIORITY = { HIGH: 'high', NORMAL: 'normal', LOW: 'low' }
export const telemetry = { track() {} }
`

function tryFile(target) {
  const candidates = [target, `${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      /* unreadable: try the next candidate */
    }
  }
  return null
}

let installed = false

function installHooks() {
  if (installed) return
  installed = true

  registerHooks({
    resolve(specifier, context, nextResolve) {
      // The only Vite-only dependency of the translator. Stubbed so the
      // import never reaches `import.meta.env`.
      if (specifier === '@/lib/telemetry') {
        return { url: `data:text/javascript,${encodeURIComponent(TELEMETRY_STUB)}`, shortCircuit: true }
      }
      if (specifier.startsWith('@/')) {
        const found = tryFile(path.join(SRC, specifier.slice(2)))
        if (found) return { url: pathToFileURL(found).href, shortCircuit: true }
      }
      if (specifier.startsWith('.') && context.parentURL) {
        const parentDir = path.dirname(fileURLToPath(context.parentURL))
        const found = tryFile(path.resolve(parentDir, specifier))
        if (found) return { url: pathToFileURL(found).href, shortCircuit: true }
      }
      if (specifier.endsWith('.js') && context.parentURL) {
        const parentDir = path.dirname(fileURLToPath(context.parentURL))
        const found = tryFile(path.join(parentDir, specifier.replace(/\.js$/, '')))
        if (found) return { url: pathToFileURL(found).href, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    },
  })
}

/**
 * Loads the real translator and returns its public surface.
 * The caller owns the language: `setLanguage` is a module-level singleton.
 */
export async function loadI18n() {
  installHooks()
  const mod = await import(pathToFileURL(path.join(SRC, 'locales', 'i18n.ts')).href)
  return {
    t: mod.t,
    parseError: mod.parseError,
    setLanguage: mod.setLanguage,
    getLanguage: mod.getLanguage,
  }
}

/**
 * Loads a locale dictionary by file name (`es`, `en`) with no alias needs.
 *
 * `bust: true` re-reads the file even if the module was already imported:
 * Node caches `import()` by URL, so without the buster a second load returns
 * the state the file had at the first import. A test that writes to a
 * dictionary needs the file as it is on disk.
 */
export async function loadDictionary(name, { bust = false } = {}) {
  installHooks()
  const url = pathToFileURL(path.join(SRC, 'locales', `${name}.ts`)).href
  const mod = await import(bust ? `${url}?bust=${Date.now()}` : url)
  return mod
}
