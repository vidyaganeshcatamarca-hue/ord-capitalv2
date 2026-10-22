// A throwaway copy of the translation toolchain, for tests that mutate it.
//
// Why: the toolchain commands read and write the real `src/locales/*.ts`
// and `i18n/ledger.json`. A test that wants to see what happens when a key
// changes has to change one. If it does that in the repo, the test races
// every other test that reads the same files, and it leaves the working
// copy dirty if it fails halfway.
//
// The sandbox solves both: the commands run with the sandbox as their
// working directory (they all resolve their paths from `process.cwd()`), and
// the copy is thrown away when the test ends.
//
//   const sandbox = createSandbox()
//   try {
//     const out = runIn(sandbox, 'ledger.mjs', ['check'])
//   } finally {
//     sandbox.cleanup()
//   }
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = path.resolve(process.cwd())
const SCRIPTS = path.join(REPO, 'scripts/i18n')

/**
 * Creates a sandbox: a copy of the dictionaries, of the ledger, and an empty
 * scratch directory.
 */
export function createSandbox() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'i18n-sandbox-'))
  mkdirSync(path.join(root, 'src/locales'), { recursive: true })
  mkdirSync(path.join(root, 'i18n'), { recursive: true })
  mkdirSync(path.join(root, 'scratch'), { recursive: true })

  for (const file of readdirSync(path.join(REPO, 'src/locales'))) {
    if (!file.endsWith('.ts')) continue
    copyFileSync(
      path.join(REPO, 'src/locales', file),
      path.join(root, 'src/locales', file)
    )
  }

  try {
    copyFileSync(
      path.join(REPO, 'i18n/ledger.json'),
      path.join(root, 'i18n/ledger.json')
    )
  } catch {
    // No ledger yet: the sandbox simply has none, and `ledger build` makes
    // one.
  }

  return {
    root,
    /** The path of a file inside the sandbox. */
    path: (...parts) => path.join(root, ...parts),
    /** Runs a toolchain command with the sandbox as its working directory. */
    run: (script, args = []) =>
      execFileSync('node', [path.join(SCRIPTS, script), ...args], {
        cwd: root,
        encoding: 'utf-8',
      }),
    /** Reads a locale dictionary from the sandbox, as a module. */
    load: async (lang) => {
      const url = pathToFileURL(path.join(root, 'src/locales', `${lang}.ts`)).href
      return import(`${url}?bust=${Date.now()}`)
    },
    /** Reads a locale dictionary as text. */
    read: (lang) => readFileSync(path.join(root, 'src/locales', `${lang}.ts`), 'utf-8'),
    /** Writes a locale dictionary as text. */
    write: (lang, content) =>
      writeFileSync(path.join(root, 'src/locales', `${lang}.ts`), content, 'utf-8'),
    /** Throws the sandbox away. */
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
