// Split the manifest into per-section chunks a translator can consume and
// write back as a single TS module.
//
//   node scripts/i18n/chunks.mjs
//
// Output: scratch/en-input/<section>[-<n>].json
// Each chunk is { "section": "...", "entries": { key: { es, ph } } }.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// The target language of this run. The SOURCE dictionary is always Spanish:
// it is the master one, and every other language is a mirror of it.
//
//   node scripts/i18n/chunks.mjs [target]
const TARGET_LANG = process.argv[2] ?? 'en'

const manifest = JSON.parse(
  readFileSync(`scratch/i18n-manifest-${TARGET_LANG}.json`, 'utf-8')
)
const OUT_DIR = path.resolve(`scratch/${TARGET_LANG}-input`)
mkdirSync(OUT_DIR, { recursive: true })

/** Max keys per chunk. Big enough to be worth a writer, small enough to be reliable. */
const MAX_KEYS = 220

let totalChunks = 0
for (const [section, entries] of Object.entries(manifest)) {
  const keys = Object.keys(entries)
  const chunkCount = Math.max(1, Math.ceil(keys.length / MAX_KEYS))
  for (let i = 0; i < chunkCount; i++) {
    const slice = keys.slice(i * MAX_KEYS, (i + 1) * MAX_KEYS)
    const name = chunkCount === 1 ? section : `${section}-${i + 1}`
    const payload = {
      section,
      part: chunkCount === 1 ? 1 : i + 1,
      parts: chunkCount,
      entries: Object.fromEntries(slice.map((k) => [k, entries[k]])),
    }
    writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(payload, null, 2), 'utf-8')
    totalChunks++
    console.log(`${name}.json — ${slice.length} keys`)
  }
}
console.log(`\n${totalChunks} chunks written to ${OUT_DIR}`)
