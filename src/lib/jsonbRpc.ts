// lib/jsonbRpc.ts
// ============================================
// Decoding of jsonb-returning RPC results — pure logic, ZERO imports.
//
// The Node test runner imports this module directly with its type stripping
// (`import { ... } from '../../src/lib/jsonbRpc.ts'`). Keep React, the DOM and
// Supabase out of here.
//
// Why this exists: functions that RETURN jsonb (fn_obtener_monedas_extra,
// fn_configurar_monedas_extra) reach the front in DIFFERENT shapes depending
// on the PostgREST/supabase-js path:
//   * a string-array value as-is:              ["USD", "CHF"]
//   * an object keyed by the function name:    {"fn_...": ["USD"]}
//   * a one-row array wrapping that object:    [{"fn_...": ["USD"]}]
//   * a one-row array with a client alias:     [{"extras": ["USD"]}]
// The previous parsers assumed the wrapper: a plain array entered as data[0]
// ('USD', a string) and decoded to [] or nothing — the owner configured an
// extra, persistence wrote it, and the block STILL showed 'Sin moneda'
// (verified live: user 198 row reads ["CHF"]; the front said []).

function normalize(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim().toUpperCase()
  return s === '' ? null : s
}

/**
 * Decodes a jsonb-returning RPC response into a string[] (normalized,
 * deduped), or null when the shape is unusable — never an invented list.
 *
 * @param data    the raw `data` from rpc()
 * @param key     the function name to unwrap the possible wrapper with
 */
export function parseJsonbStringArray(
  data: unknown,
  key?: string
): string[] | null {
  const unwrapObject = (obj: unknown): unknown => {
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return null
    const bag = obj as Record<string, unknown>
    if (key && key in bag) return bag[key]
    // No known key: accept the single-value object (client alias) only when
    // it holds exactly one property that is an array — otherwise refuse.
    const values = Object.values(bag)
    if (values.length === 1 && Array.isArray(values[0])) return values[0]
    return null
  }

  let list: unknown = null
  if (Array.isArray(data)) {
    if (data.length === 0) return []
    const first = data[0]
    if (first != null && typeof first === 'object' && !Array.isArray(first)) {
      // A row-object wrapper (possibly with an alias key).
      list = unwrapObject(first)
    } else {
      // The value itself IS the array (bare jsonb).
      list = data
    }
  } else if (data != null && typeof data === 'object') {
    list = unwrapObject(data)
  }

  if (!Array.isArray(list)) return null

  const out: string[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const code = typeof item === 'string' ? normalize(item) : null
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}