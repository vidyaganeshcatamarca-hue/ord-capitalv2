// src/lib/importExport/parser.ts
// Pure parsing/normalization helpers for the Importar/Exportar wizard.
// Text/rows in -> structured rows out. No DOM, no network, no external deps.
// Erasable-syntax only: this file is imported directly by node --test via
// Node's native TypeScript type stripping (same pattern as tests/voice_codec.test.js).

export type Delimiter = ';' | ',' | '\t'

export interface DelimitedTable {
  headers: string[]
  rows: string[][]
}

export interface MontoPrefs {
  separador_miles: string
  separador_decimal: string
}

export interface MontoResult {
  valor: number | null
  inverted: boolean
}

export interface FechaPrefs {
  formato_fecha: string
}

export type Tipo = 'income' | 'expense'

export type CuentaSep = 'dash' | 'slash' | 'pipe'

export interface CuentaSplit {
  padre: string
  sub: string
}

export interface CuentaSplitError {
  error: true
}

export type CanonicalField =
  | 'fecha'
  | 'tipo'
  | 'monto'
  | 'billetera_origen'
  | 'billetera_destino'
  | 'cuenta'
  | 'detalle'

export interface HeaderGuess {
  mapping: Partial<Record<CanonicalField, number>>
  guessed: boolean[]
}

const DELIMITERS: Delimiter[] = [';', ',', '\t']

// Normalized (lowercase, diacritics stripped) header aliases per canonical field.
const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  fecha: ['fecha', 'date', 'dia', 'fecha_mov'],
  tipo: ['tipo', 'tipo_mov', 'tipo_movimiento'],
  monto: ['monto', 'importe', 'amount', 'valor'],
  // 'billetera de origen/destino' are the exact labels the export writes
  // (config_ie_map_field_billetera_*), so an exported file re-imports with
  // full auto-guess.
  billetera_origen: ['billetera', 'billetera de origen', 'cuenta_origen', 'medio', 'medio_pago'],
  billetera_destino: ['destino', 'billetera destino', 'billetera de destino'],
  cuenta: ['cuenta', 'categoria', 'concepto'],
  detalle: ['detalle', 'descripcion', 'observacion', 'memo'],
}

function isEmptyRecord(record: string[]): boolean {
  return record.every((value) => value.trim() === '')
}

// RFC4180-ish tokenizer: quoted fields with embedded delimiters/newlines,
// escaped quotes ("") and CRLF/LF line endings.
function parseRecords(text: string, delim: Delimiter): string[][] {
  const source = typeof text === 'string' ? text : ''
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const endField = () => {
    record.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    records.push(record)
    record = []
  }

  while (i < source.length) {
    const ch = source[i]
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"' && field === '') {
      inQuotes = true
      i++
      continue
    }
    if (ch === delim) {
      endField()
      i++
      continue
    }
    if (ch === '\r') {
      if (source[i + 1] === '\n') i++
      endRecord()
      i++
      continue
    }
    if (ch === '\n') {
      endRecord()
      i++
      continue
    }
    field += ch
    i++
  }

  if (field !== '' || record.length > 0) endRecord()
  return records
}

function firstRowFieldCount(text: string, delim: Delimiter): number {
  const records = parseRecords(text, delim)
  for (const record of records) {
    if (!isEmptyRecord(record)) return record.length
  }
  return 0
}

// Count occurrences outside quoted spans within the first ~10 physical lines.
// Tie-break: the delimiter producing more fields in the first non-empty row
// wins; if still tied, ';' (es-AR Excel exports) is the default.
export function detectDelimiter(text: string): Delimiter {
  const source = typeof text === 'string' ? text : ''
  const counts: Record<Delimiter, number> = { ';': 0, ',': 0, '\t': 0 }
  let inQuotes = false
  let lines = 0

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '"') {
      if (inQuotes && source[i + 1] === '"') {
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (inQuotes) continue
    if (ch === '\n') {
      lines++
      if (lines >= 10) break
      continue
    }
    if (ch === ';' || ch === ',' || ch === '\t') counts[ch]++
  }

  const best = Math.max(counts[';'], counts[','], counts['\t'])
  const tied = DELIMITERS.filter((d) => counts[d] === best)
  if (tied.length === 1) return tied[0]

  let winner = tied[0]
  let winnerFields = firstRowFieldCount(source, winner)
  for (let k = 1; k < tied.length; k++) {
    const fields = firstRowFieldCount(source, tied[k])
    if (fields > winnerFields) {
      winner = tied[k]
      winnerFields = fields
    }
  }
  return winner
}

export function parseDelimitedText(text: string, delim?: Delimiter): DelimitedTable {
  const delimiter = delim ?? detectDelimiter(text)
  const records = parseRecords(text, delimiter).filter((record) => !isEmptyRecord(record))
  if (records.length === 0) return { headers: [], rows: [] }

  const headers = records[0].map((header) => header.trim())
  const rows = records.slice(1).map((record) => {
    const row = record.slice()
    while (row.length < headers.length) row.push('')
    return row
  })
  return { headers, rows }
}

// Matching key for wallets/categories: trim, collapse whitespace, lowercase,
// strip diacritics.
export function normalizeNombre(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function escapeRegExpChar(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Try one thousands/decimal convention. Returns null when the separator
// structure is inconsistent with that convention.
function tryConvention(body: string, thou: string, dec: string): number | null {
  if (thou !== '' && thou === dec) return null

  const hasThou = thou !== '' && body.includes(thou)
  const hasDec = dec !== '' && body.includes(dec)

  if (hasDec) {
    const first = body.indexOf(dec)
    if (body.indexOf(dec, first + 1) !== -1) return null // more than one decimal mark
    const before = body.slice(0, first)
    const after = body.slice(first + 1)
    if (!/^\d+$/.test(after)) return null
    if (hasThou) {
      if (after.includes(thou)) return null
      const grouped = new RegExp('^\\d{1,3}(?:' + escapeRegExpChar(thou) + '\\d{3})+$')
      if (!grouped.test(before)) return null
    } else if (!/^\d+$/.test(before)) {
      return null
    }
    const digitsBefore = thou !== '' ? before.split(thou).join('') : before
    if (!/^\d+$/.test(digitsBefore)) return null
    return Number(digitsBefore + '.' + after)
  }

  if (hasThou) {
    const grouped = new RegExp('^\\d{1,3}(?:' + escapeRegExpChar(thou) + '\\d{3})+$')
    if (!grouped.test(body)) return null
    return Number(body.split(thou).join(''))
  }

  if (/^\d+$/.test(body)) return Number(body)
  return null
}

// Parse an amount using the user's thousands/decimal prefs first. Falls back to
// the inverted convention; inverted=true only when the inverted reading is the
// only one that succeeds.
export function parseMonto(raw: unknown, prefs?: MontoPrefs): MontoResult {
  const failed: MontoResult = { valor: null, inverted: false }
  if (raw === null || raw === undefined) return failed

  // Strip currency symbols, letters and grouping whitespace; keep digits/signs/seps.
  const cleaned = String(raw).replace(/[^\d.,+\-]/g, '')
  if (cleaned === '') return failed

  let sign = 1
  if (cleaned.startsWith('-') || cleaned.endsWith('-')) sign = -1
  const body = cleaned.replace(/[+-]/g, '')
  if (body === '') return failed

  const thou = prefs?.separador_miles ?? ''

  const dec = prefs?.separador_decimal ?? ''
  const primary = tryConvention(body, thou, dec)
  if (primary !== null) return { valor: primary * sign, inverted: false }

  const inverted = tryConvention(body, dec, thou)
  if (inverted !== null) return { valor: inverted * sign, inverted: true }

  return failed
}

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

function buildIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

// Interpret `raw` with the user's stored formato_fecha (only confirmed real
// value in this repo is 'DD/MM/YYYY'; the token interpreter stays generic so it
// never fabricates an option list).
function parseWithFormat(raw: string, formato: string): string | null {
  if (!formato) return null
  const tokens = formato
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((token) => token !== '')
  const parts = raw.split(/[^0-9]+/).filter((part) => part !== '')
  if (tokens.length === 0 || parts.length !== tokens.length) return null

  let year: number | null = null
  let month: number | null = null
  let day: number | null = null

  for (let i = 0; i < tokens.length; i++) {
    const value = Number.parseInt(parts[i], 10)
    if (!Number.isInteger(value)) return null
    const token = tokens[i]
    if (token === 'YYYY' || token === 'YY') {
      if (year !== null) return null
      if (token === 'YYYY' && (value < 1000 || value > 9999)) return null
      year = token === 'YY' ? 2000 + value : value
    } else if (token === 'DD' || token === 'D') {
      if (day !== null) return null
      day = value
    } else if (token === 'MM' || token === 'M') {
      if (month !== null) return null
      month = value
    } else {
      return null
    }
  }

  if (year === null || month === null || day === null) return null
  return buildIso(year, month, day)
}

export function parseFecha(raw: unknown, prefs?: FechaPrefs): string | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (text === '') return null

  const iso = ISO_DATE.exec(text)
  if (iso) return buildIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const preferred = prefs?.formato_fecha ? parseWithFormat(text, prefs.formato_fecha) : null
  if (preferred) return preferred

  // Fallback: day/month heuristic, resolved by day > 12 or month > 12.
  const parts = text.split(/[^0-9]+/).filter((part) => part !== '')
  if (parts.length !== 3) return null
  const a = Number(parts[0])
  const b = Number(parts[1])
  const c = Number(parts[2])
  if (parts[0].length === 4) return buildIso(a, b, c)
  if (a > 12 && b <= 12) return buildIso(c, b, a)
  if (b > 12 && a <= 12) return buildIso(c, a, b)
  return null
}

const INCOME_WORDS = new Set(['ingreso', 'income', 'credito', 'abono'])
const EXPENSE_WORDS = new Set(['egreso', 'expense', 'gasto', 'debito'])

// Explicit tipo column wins over the amount sign; null when neither resolves.
export function inferTipo(input: { tipoRaw?: unknown; valor?: number | null } = {}): Tipo | null {
  const raw = normalizeNombre(input.tipoRaw)
  if (raw !== '') {
    if (INCOME_WORDS.has(raw)) return 'income'
    if (EXPENSE_WORDS.has(raw)) return 'expense'
  }

  const valor = input.valor
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    if (valor < 0) return 'expense'
    if (valor > 0) return 'income'
  }
  return null
}

// Split "Padre<SEP>Sub" only by the chosen separator. Dash accepts both
// hyphen and en dash. More than two levels or an empty parent is an error.
export function splitCuenta(raw: unknown, sep: CuentaSep): CuentaSplit | CuentaSplitError {
  const text = raw === null || raw === undefined ? '' : String(raw).trim()
  if (text === '') return { error: true }

  let parts: string[]
  if (sep === 'dash') parts = text.split(/[-–]/)
  else if (sep === 'slash') parts = text.split('/')
  else parts = text.split('|')

  const cleaned = parts.map((part) => part.trim())
  if (cleaned.length > 2) return { error: true }
  const padre = cleaned[0] ?? ''
  if (padre === '') return { error: true }
  const sub = cleaned.length === 2 ? cleaned[1] : ''
  return { padre, sub }
}

// Auto-guess canonical fields from header names. Only unambiguous matches are
// assigned; guessed[i] flags each header that was auto-filled by index.
export function guessHeaderMapping(headers: string[]): HeaderGuess {
  const list = Array.isArray(headers) ? headers : []
  const mapping: Partial<Record<CanonicalField, number>> = {}
  const guessed: boolean[] = list.map(() => false)
  const fields = Object.keys(HEADER_ALIASES) as CanonicalField[]

  for (let i = 0; i < list.length; i++) {
    const key = normalizeNombre(list[i])
    if (key === '') continue
    const matches = fields.filter((field) => HEADER_ALIASES[field].includes(key))
    if (matches.length !== 1) continue
    const field = matches[0]
    if (mapping[field] !== undefined) continue
    mapping[field] = i
    guessed[i] = true
  }

  return { mapping, guessed }
}
