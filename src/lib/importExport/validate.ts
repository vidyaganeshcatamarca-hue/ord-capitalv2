// src/lib/importExport/validate.ts
// Pure validation/matching layer for the Importar/Exportar wizard (spec §3-4,
// T3b). Turns the mapped table into a per-row workset with machine-key parse
// errors, then collects and matches the wallets/accounts the file references.
// Erasable-syntax only and zero external imports, so node --test can load it
// through Node's native TypeScript type stripping (same pattern as parser.ts).

// Note: relative imports carry the explicit .ts extension so node --test can
// resolve them after type stripping (tsconfig sets allowImportingTsExtensions).
import { CANONICAL_FIELDS } from './schema.ts'
import type {
  CanonicalFieldId,
  FieldMapping,
  ImportTipo,
  ImportUserPrefs,
  SepId,
  TipoSource,
} from './schema.ts'
import { inferTipo, normalizeNombre, parseFecha, parseMonto, splitCuenta } from './parser.ts'

/** Row-level machine error keys surfaced by the reconciliation table and
 * localized through t() at render time. */
export const ROW_ERROR_KEYS = {
  fecha: 'config_ie_error_row_fecha',
  monto: 'config_ie_error_row_monto',
  tipo: 'config_ie_error_row_tipo',
  billetera: 'config_ie_error_row_billetera',
  cuenta: 'config_ie_error_row_cuenta',
  destino: 'config_ie_error_row_destino',
  /** Row uses an account the owner rejected: listed so the user can fix it,
   * but excluded from the import batch and from the hard gate (defect 2). */
  cuenta_rechazada: 'config_ie_error_row_cuenta_rechazada',
} as const

export interface WorksetWallets {
  origen: string
  destino: string
}

export interface WorksetCuenta {
  padre: string
  sub: string
}

/** One canonical row produced by buildWorkset. `fieldErrors` is empty when the
 * row is ready to execute; every entry is a ROW_ERROR_KEYS value. */
export interface WorksetRow {
  fechaISO: string | null
  tipo: ImportTipo | null
  monto: number | null
  wallets: WorksetWallets
  cuenta: WorksetCuenta | null
  detalle: string
  fieldErrors: string[]
}

export interface BuildWorksetInput {
  headers: string[]
  rows: string[][]
  mapping: FieldMapping
  sep: SepId
  tipoSource: TipoSource
  /** Tipo applied to every row when tipoSource === 'fixed' (owner bug 4).
   * Ignored by the column/sign modes and by the tipo column's default. */
  fixedTipo?: ImportTipo
  prefs: ImportUserPrefs
}

/** Movement types that a transfer word in the tipo column resolves to. The
 * parser's inferTipo only speaks income/expense; the transfer enum lives in
 * schema.ts, so validate.ts owns the column-word bridge. */
const TRANSFER_WORDS = new Set(['transferencia', 'transfer', 'traspaso'])

function fieldDef(fieldId: CanonicalFieldId) {
  return CANONICAL_FIELDS.find((field) => field.id === fieldId)
}

/** Required-by-tipo check straight from schema.ts, the single source of truth
 * (no duplicated field lists here). */
function isRequired(fieldId: CanonicalFieldId, tipo: ImportTipo): boolean {
  return fieldDef(fieldId)?.required[tipo] ?? false
}

function rawAt(row: string[], mapping: FieldMapping, fieldId: CanonicalFieldId): string {
  const index = mapping[fieldId]
  if (index === undefined) return ''
  return row[index] ?? ''
}

function resolveTipo(
  tipoRaw: string,
  monto: number | null,
  tipoSource: TipoSource,
  fixedTipo?: ImportTipo
): ImportTipo | null {
  // Fixed mode owns the tipo for every row: the file's tipo column and the
  // amount sign are both irrelevant (owner bug 4).
  if (tipoSource === 'fixed') return fixedTipo ?? null
  if (tipoSource === 'column' && TRANSFER_WORDS.has(normalizeNombre(tipoRaw))) {
    return 'transfer'
  }
  // Explicit column wins over the sign inside inferTipo; sign mode ignores it.
  return tipoSource === 'sign' ? inferTipo({ valor: monto }) : inferTipo({ tipoRaw, valor: monto })
}

/** Validate a single raw row against the user's mapping/prefs. Reused for the
 * inline edit flow, which re-runs just the edited row. */
export function buildRow(
  row: string[],
  mapping: FieldMapping,
  sep: SepId,
  tipoSource: TipoSource,
  prefs: ImportUserPrefs,
  fixedTipo?: ImportTipo
): WorksetRow {
  const fieldErrors: string[] = []

  const fechaISO = parseFecha(rawAt(row, mapping, 'fecha'), prefs)
  if (fechaISO === null) fieldErrors.push(ROW_ERROR_KEYS.fecha)

  const monto = parseMonto(rawAt(row, mapping, 'monto'), prefs).valor
  // The amount must exist and be non-zero. Sign is meaningful (signo mode:
  // negative = expense); the magnitude is what makes the row executable.
  const montoOk = monto !== null && Number.isFinite(monto) && Math.abs(monto) > 0
  if (!montoOk) fieldErrors.push(ROW_ERROR_KEYS.monto)

  const tipo = resolveTipo(rawAt(row, mapping, 'tipo'), monto, tipoSource, fixedTipo)
  if (tipo === null) fieldErrors.push(ROW_ERROR_KEYS.tipo)

  const origen = normalizeNombre(rawAt(row, mapping, 'billetera_origen'))
  const destino = normalizeNombre(rawAt(row, mapping, 'billetera_destino'))
  if (origen === '') fieldErrors.push(ROW_ERROR_KEYS.billetera)
  if (tipo !== null && isRequired('billetera_destino', tipo) && destino === '') {
    fieldErrors.push(ROW_ERROR_KEYS.destino)
  }

  let cuenta: WorksetCuenta | null = null
  if (tipo !== null && isRequired('cuenta', tipo)) {
    const split = splitCuenta(rawAt(row, mapping, 'cuenta'), sep)
    if ('error' in split) {
      fieldErrors.push(ROW_ERROR_KEYS.cuenta)
    } else {
      cuenta = { padre: split.padre, sub: split.sub }
    }
  }

  return {
    fechaISO,
    tipo,
    monto,
    wallets: { origen, destino },
    cuenta,
    detalle: rawAt(row, mapping, 'detalle').trim(),
    fieldErrors,
  }
}

export function buildWorkset(input: BuildWorksetInput): WorksetRow[] {
  const { rows, mapping, sep, tipoSource, fixedTipo, prefs } = input
  const list = Array.isArray(rows) ? rows : []
  return list.map((row) => buildRow(row, mapping, sep, tipoSource, prefs, fixedTipo))
}

export interface CollectedAccount {
  padre: string
  sub: string | null
}

export interface CollectedEntities {
  wallets: string[]
  accounts: CollectedAccount[]
}

export function accountKey(account: CollectedAccount | WorksetCuenta): string {
  return normalizeNombre(account.padre) + '|' + normalizeNombre(account.sub ?? '')
}

/** Distinct wallets (origen + destino, normalized) and accounts (padre/sub
 * pairs from successful splits) referenced by the non-discarded rows. */
export function collectEntities(rows: WorksetRow[]): CollectedEntities {
  const wallets: string[] = []
  const walletSeen = new Set<string>()
  const accounts: CollectedAccount[] = []
  const accountSeen = new Set<string>()

  for (const row of rows) {
    for (const name of [row.wallets.origen, row.wallets.destino]) {
      if (name === '' || walletSeen.has(name)) continue
      walletSeen.add(name)
      wallets.push(name)
    }

    if (row.cuenta) {
      const account: CollectedAccount = {
        padre: row.cuenta.padre,
        sub: row.cuenta.sub === '' ? null : row.cuenta.sub,
      }
      const key = accountKey(account)
      if (accountSeen.has(key)) continue
      accountSeen.add(key)
      accounts.push(account)
    }
  }

  return { wallets, accounts }
}

export interface EntityMatch {
  exact: string | null
  normalized: string | null
  ambiguity: boolean
}

/** Match each referenced entity against the existing catalog: literal (raw)
 * match first, then normalized (accent/case-insensitive) match. When 2+ raw
 * names normalize to the same target the entity is ambiguous and gets no
 * auto-match. */
export function matchEntities(
  entityNames: string[],
  existingNames: string[]
): Record<string, EntityMatch> {
  const result: Record<string, EntityMatch> = {}
  const existing = Array.isArray(existingNames) ? existingNames : []
  const names = Array.isArray(entityNames) ? entityNames : []

  for (const name of names) {
    const exact = existing.find((candidate) => candidate === name) ?? null
    if (exact !== null) {
      result[name] = { exact, normalized: exact, ambiguity: false }
      continue
    }

    const target = normalizeNombre(name)
    const normalizedMatches = existing.filter(
      (candidate) => normalizeNombre(candidate) === target
    )
    if (normalizedMatches.length > 1) {
      result[name] = { exact: null, normalized: null, ambiguity: true }
      continue
    }

    result[name] = {
      exact: null,
      normalized: normalizedMatches[0] ?? null,
      ambiguity: false,
    }
  }

  return result
}

/** Re-tag the workset with the owner's account rejections (defect 2). A row
 * whose cuentaKey (accountKey of its cuenta) is in `rejectedKeys` carries the
 * cuenta_rechazada error key; every other row is left untouched. Idempotent
 * and self-replacing: a prior rejection is stripped first, so calling this
 * again with a shorter list clears the rejections the user reinstated.
 * Returns new row objects only for the rows that actually change. */
export function applyAccountRejections(
  rows: WorksetRow[],
  rejectedKeys: string[]
): WorksetRow[] {
  const rejected = new Set(Array.isArray(rejectedKeys) ? rejectedKeys : [])
  const list = Array.isArray(rows) ? rows : []
  return list.map((row) => {
    const cleaned = row.fieldErrors.filter((key) => key !== ROW_ERROR_KEYS.cuenta_rechazada)
    const isRejected = row.cuenta !== null && rejected.has(accountKey(row.cuenta))
    const fieldErrors = isRejected
      ? [...cleaned, ROW_ERROR_KEYS.cuenta_rechazada]
      : cleaned
    const unchanged =
      fieldErrors.length === row.fieldErrors.length &&
      fieldErrors.every((key, index) => key === row.fieldErrors[index])
    return unchanged ? row : { ...row, fieldErrors }
  })
}

export interface WorksetStatus {
  ok: number
  /** Rows with at least one blocking error (any key other than
   * cuenta_rechazada). Rejected rows never count here, so they never close
   * the gate. */
  error: number
  /** Rows excluded from the batch because they use a rejected account. */
  excluded: number
  clean: boolean
}

export function countStatuses(rows: WorksetRow[]): WorksetStatus {
  let ok = 0
  let error = 0
  let excluded = 0
  for (const row of rows) {
    if (row.fieldErrors.length === 0) {
      ok++
      continue
    }
    if (row.fieldErrors.includes(ROW_ERROR_KEYS.cuenta_rechazada)) excluded++
    if (row.fieldErrors.some((key) => key !== ROW_ERROR_KEYS.cuenta_rechazada)) error++
  }
  return { ok, error, excluded, clean: error === 0 }
}

/** The hard gate: every IMPORTABLE row must be error-free. Rows tagged with
 * cuenta_rechazada are excluded, so they do not block execution (defect 2). */
export function canExecute(rows: WorksetRow[]): boolean {
  return countStatuses(rows).clean
}

export type CupoTipo = 'need' | 'want' | 'tithe'

// Stems (normalized, diacritics-stripped) that hint at each budget class.
const TITHE_HINTS = ['iglesia', 'diezmo', 'donacion', 'limosna', 'ofrenda']
const WANT_HINTS = ['ocio', 'entret', 'restaurant', 'salida', 'suscrip', 'gusto', 'cine', 'viaje']
const NEED_HINTS = ['impuesto', 'luz', 'agua', 'servicio', 'renta', 'alquiler', 'expensa', 'alimento']

/** Heuristic budget-class suggestion for a new account name (spec §4 step 3):
 * tithe beats want beats need; default is need. */
export function suggestCupo(name: string): CupoTipo {
  const key = normalizeNombre(name)
  if (TITHE_HINTS.some((hint) => key.includes(hint))) return 'tithe'
  if (WANT_HINTS.some((hint) => key.includes(hint))) return 'want'
  if (NEED_HINTS.some((hint) => key.includes(hint))) return 'need'
  return 'need'
}
