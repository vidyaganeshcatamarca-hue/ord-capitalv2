// locales/language.ts
// ============================================
// Language resolution — pure logic, ZERO imports.
//
// The Node test runner imports this module directly with its type stripping
// (`import { ... } from '../../src/locales/language.ts'`). It cannot resolve
// Vite aliases (`@/...`) nor `.js`-to-`.ts` rewrites, so this file must stay
// free of every import. Keep React, the DOM and Supabase out of here.

/** Languages with a shipped dictionary. Adding a language = one string here + its `xx.ts`. */
export const SUPPORTED = ['es', 'en'] as const

export type Lang = (typeof SUPPORTED)[number]

// Spanish stays the fallback and the default on purpose: switching this to
// 'en' would silently change the language of every user who never picked one,
// which is a product decision, not a technical one. The user picks English in
// Settings → Region and format; the choice is persisted in localStorage and
// in `p_config_region.idioma_default`.
export const DEFAULT_LANG: Lang = 'es'

/** Narrows an arbitrary runtime value to a shipped language code. */
export function isSupported(lang: string | null | undefined): lang is Lang {
  return typeof lang === 'string' && (SUPPORTED as readonly string[]).includes(lang)
}

/**
 * Splits a BCP-47 tag into its language and region subtags.
 * Accepts the `_` separator that some platforms report (`es_PY`).
 * Region is the first two-letter alphabetic subtag, so script subtags
 * (`zh-Hant-TW`) and numeric regions (`es-419`) are skipped.
 */
export function normalizeLocale(tag: string): { language: string; region: string | null } {
  const normalized = String(tag ?? '').trim().replace(/_/g, '-')
  if (!normalized) return { language: '', region: null }

  const parts = normalized.split('-').filter(Boolean)
  const language = (parts[0] ?? '').toLowerCase()

  let region: string | null = null
  for (const part of parts.slice(1)) {
    if (/^[a-z]{2}$/i.test(part)) {
      region = part.toUpperCase()
      break
    }
  }

  return { language, region }
}

/**
 * Normalizes `navigator.languages` / `navigator.language` (or the raw value of
 * either) into an ordered, duplicate-free list of tags. The browser's
 * preference order is the signal, so it is never sorted.
 */
export function parseDeviceLocales(input: unknown): string[] {
  const raw: unknown[] = Array.isArray(input) ? input : [input]

  const seen = new Set<string>()
  const locales: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const tag = entry.trim().replace(/_/g, '-')
    if (!tag) continue
    const fingerprint = tag.toLowerCase()
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    locales.push(tag)
  }

  return locales
}

/**
 * Region of the first locale that carries one. Device locale only — no IP,
 * no GPS, no third parties (design D4).
 */
export function resolveRegionFromLocale(deviceLocales: readonly string[]): string | null {
  for (const tag of deviceLocales ?? []) {
    const { region } = normalizeLocale(tag)
    if (region) return region
  }
  return null
}

export type LanguageSource = 'stored' | 'device' | 'country' | 'default'

/**
 * Strict precedence: persisted preference > device locale > language suggested
 * by the chosen country > DEFAULT_LANG. The stored preference must keep
 * winning: resolving from the device on every boot would silently overwrite
 * what the user picked.
 */
export function resolveLanguage(input: {
  stored?: string | null
  deviceLocales?: readonly string[]
  countrySuggested?: string | null
}): { lang: Lang; source: LanguageSource } {
  const stored = typeof input?.stored === 'string' ? input.stored.trim().toLowerCase() : null
  if (isSupported(stored)) return { lang: stored, source: 'stored' }

  for (const tag of input?.deviceLocales ?? []) {
    const { language } = normalizeLocale(tag)
    if (isSupported(language)) return { lang: language, source: 'device' }
  }

  const suggested =
    typeof input?.countrySuggested === 'string' ? input.countrySuggested.trim().toLowerCase() : null
  if (isSupported(suggested)) return { lang: suggested, source: 'country' }

  return { lang: DEFAULT_LANG, source: 'default' }
}

/**
 * Languages to try, in order, for a lookup. This is the single seam where a
 * secondary dictionary gets inserted once `en.ts` exists.
 */
export function fallbackChain(lang: string): Lang[] {
  const chain: Lang[] = []
  if (isSupported(lang)) chain.push(lang)
  if (!chain.includes(DEFAULT_LANG)) chain.push(DEFAULT_LANG)
  return chain
}
