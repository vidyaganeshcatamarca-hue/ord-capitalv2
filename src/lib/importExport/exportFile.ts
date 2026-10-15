// src/lib/importExport/exportFile.ts
// Export step (spec §5) for the Importar/Exportar feature: turns the rows of
// the live fn_exportar_movimientos RPC into a prefs-formatted workbook or CSV
// and triggers the download.
//
// Two layers, same split as execute.ts:
//  - PURE helpers (formatNumber, formatDate, buildCanonicalRows, buildXlsxAoA,
//    buildCsvText, exportFileName, bytesToBase64, resolveRangeBounds): plain
//    data in/out, no DOM, no network, no Capacitor — unit-testable through
//    `node --test` with Node's native TypeScript type stripping.
//  - IMPURE downloadExport: dynamic import of 'xlsx' and the Capacitor plugins
//    INSIDE the function, so neither lands in the main bundle nor in the
//    node-test module graph (only the pure exports are tested).
//
// Numbers/date formatting follow the user's regional prefs — the same ones
// RegionFormatoPage manages (separador_miles, separador_decimal,
// decimales_moneda_local -> decimales, formato_fecha).
//
// Cross-currency transfers (spec §5 amendment): fn_exportar_movimientos already
// emits them as their two legs, paired into a single `tipo: 'transfer'` row with
// bill_destino = the leg-B wallet, cuenta = NULL and detalle = the nota. That row
// is a normal transfer here — no special casing, and no monto_destino column.

import { rowsToCsv } from './csv.ts'

/** Regional prefs the export formats numbers/dates with (READ ONLY subset of
 * fn_obtener_preferencias_usuario; `decimales` comes from
 * decimales_moneda_local). */
export interface ExportPrefs {
  separador_miles: string
  separador_decimal: string
  decimales: number
  formato_fecha: string
}

export type ExportFormat = 'xlsx' | 'csv'

/** Wire row of the live fn_exportar_movimientos RPC. Postgres `numeric` arrives
 * as a string over the wire, so monto is Number()-wrapped here. */
export interface ExportRpcRow {
  fecha: string | null
  tipo: string | null
  monto: string | number | null
  bill_origen: string | null
  bill_destino: string | null
  cuenta: string | null
  detalle: string | null
}

/** One canonical export row: the display strings (CSV + preview) plus the real
 * numeric monto the xlsx cell needs. Field names match the canonical grid of
 * spec §3. */
export interface CanonicalExportRow {
  fechaStr: string
  tipo: string
  monto: number
  montoDisplay: string
  origen: string
  destino: string
  cuenta: string
  detalle: string
}

export type ExportRangeKey = 'current' | 'previous' | 'custom'

/** The spec's canonical column order; the index of `monto` is fixed here and
 * consumed by buildXlsxAoA for the number format. */
export const MONTO_COLUMN_INDEX = 2

/** decimales_moneda_local is offered as 0 | 1 | 2 in RegionFormatoPage; clamp
 * defensively so a bad pref can never break toFixed(). */
function clampDecimals(decimales: number | null | undefined): number {
  const value = Number(decimales)
  if (!Number.isInteger(value) || value < 0) return 0
  if (value > 2) return 2
  return value
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * PURE: format a number with the user's separators and decimals, e.g.
 * 1250.5 with ('.', ',', 2) -> '1.250,50'. Deliberately string arithmetic and
 * not Intl: the CSV must carry exactly the text the importer re-parses with
 * parser.ts parseMonto (which reads these same two separators).
 */
export function formatNumber(valor: number, prefs: ExportPrefs): string {
  const decimals = clampDecimals(prefs?.decimales)
  const value = Number(valor)
  const safe = Number.isFinite(value) ? value : 0
  const decimalsSep = prefs?.separador_decimal ?? ','
  const thousandsSep = prefs?.separador_miles ?? '.'

  const [intPart, decPart = ''] = Math.abs(safe).toFixed(decimals).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u0000')
  const withThousands = grouped.split('\u0000').join(thousandsSep)
  const body = decimals > 0 ? `${withThousands}${decimalsSep}${decPart}` : withThousands
  return safe < 0 ? `-${body}` : body
}

/**
 * PURE: format a YYYY-MM-DD date with the user's formato_fecha tokens
 * (YYYY | YY | MM | M | DD | D). Anything that is not an ISO date, or a format
 * with no recognizable token, is returned unchanged so an export never
 * fabricates a date.
 */
export function formatDate(iso: string | null | undefined, formatoFecha: string): string {
  const text = iso === null || iso === undefined ? '' : String(iso).trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (!match) return text

  const year = match[1]
  const month = match[2]
  const day = match[3]
  const format = formatoFecha === null || formatoFecha === undefined ? '' : String(formatoFecha).trim()
  if (format === '') return `${year}-${month}-${day}`

  const replaced = format.replace(/YYYY|YY|MM|M|DD|D/g, (token) => {
    if (token === 'YYYY') return year
    if (token === 'YY') return year.slice(2)
    if (token === 'MM') return month
    if (token === 'M') return String(Number(month))
    if (token === 'DD') return day
    return String(Number(day))
  })
  return replaced === format ? `${year}-${month}-${day}` : replaced
}

/**
 * PURE: RPC rows -> canonical rows. `tipo` stays in the canonical enum
 * (income | expense | transfer) on purpose: parser.ts recognizes those exact
 * words, so an export re-imports 1:1 through the mapping step.
 */
export function buildCanonicalRows(
  rpcRows: readonly ExportRpcRow[] | null | undefined,
  prefs: ExportPrefs
): CanonicalExportRow[] {
  const list = Array.isArray(rpcRows) ? rpcRows : []
  return list.map((row) => {
    const raw = Number(row?.monto ?? 0)
    const monto = Number.isFinite(raw) ? raw : 0
    return {
      fechaStr: formatDate(row?.fecha ?? '', prefs?.formato_fecha ?? ''),
      tipo: row?.tipo ?? '',
      monto,
      montoDisplay: formatNumber(monto, prefs),
      origen: row?.bill_origen ?? '',
      destino: row?.bill_destino ?? '',
      cuenta: row?.cuenta ?? '',
      detalle: row?.detalle ?? '',
    }
  })
}

/** Excel number-format code for `decimals` places: '#,##0', '#,##0.0',
 * '#,##0.00'. The thousand/decimal CHARACTERS of a numFmt are locale-agnostic —
 * Excel renders separators per the VIEWER's locale, not per this string. So
 * '#,##0.00' shows as 1.250,50 in an es-AR Excel and 1,250.50 in en-US. That is
 * the correct behavior for a real numeric cell, and the exact reason the CSV
 * path exists: the CSV carries the user's own separators as literal text
 * (formatNumber), while the xlsx carries real numbers + this code. */
function numFmtForDecimals(decimals: number): string {
  return decimals <= 0 ? '#,##0' : `#,##0.${'0'.repeat(decimals)}`
}

export interface XlsxSheetSpec {
  aoa: Array<Array<string | number>>
  montoColumnIndex: number
  montoNumFmt: string
}

/**
 * PURE: canonical rows + localized header labels -> the AoA plus the number
 * format to apply to the monto column. `headers` is injected (not hardcoded)
 * so the caller can pass t()-resolved labels.
 */
export function buildXlsxAoA(
  rows: readonly CanonicalExportRow[] | null | undefined,
  headers: readonly string[],
  prefs: ExportPrefs
): XlsxSheetSpec {
  const list = Array.isArray(rows) ? rows : []
  const aoa: Array<Array<string | number>> = [
    (Array.isArray(headers) ? headers : []).map((header) => String(header)),
    ...list.map((row) => [
      row.fechaStr,
      row.tipo,
      row.monto,
      row.origen,
      row.destino,
      row.cuenta,
      row.detalle,
    ]),
  ]
  return {
    aoa,
    montoColumnIndex: MONTO_COLUMN_INDEX,
    montoNumFmt: numFmtForDecimals(clampDecimals(prefs?.decimales)),
  }
}

/**
 * PURE: canonical rows -> RFC4180 CSV text. The delimiter is always ';' when
 * prefs exist on purpose: the decimal separator may itself be ',' (es-AR), and
 * a ',' delimiter would then split the amounts. parser.ts auto-detects the ';'
 * on re-import and parseMonto reads the prefs separators back.
 */
export function buildCsvText(
  rows: readonly CanonicalExportRow[] | null | undefined,
  headers: readonly string[],
  delimiter = ';'
): string {
  const list = Array.isArray(rows) ? rows : []
  return rowsToCsv(
    [
      (Array.isArray(headers) ? headers : []).map((header) => String(header)),
      ...list.map((row) => [
        row.fechaStr,
        row.tipo,
        row.montoDisplay,
        row.origen,
        row.destino,
        row.cuenta,
        row.detalle,
      ]),
    ],
    { delimiter }
  )
}

/** Technical artifact name (not user copy): ordcapital_movimientos_<from>_<to>.<ext>. */
export function exportFileName(from: string, to: string, format: ExportFormat): string {
  const parts = [from, to]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value !== '')
  const slug = parts.length > 0 ? parts.join('_') : 'all'
  return `ordcapital_movimientos_${slug}.${format === 'csv' ? 'csv' : 'xlsx'}`
}

/** PURE: local-calendar bounds of the selected range, as plain YYYY-MM-DD
 * strings (the RPC compares dates, not timestamps). Custom ranges return null
 * while either end is missing, which is what keeps Generate disabled. */
export function resolveRangeBounds(
  range: ExportRangeKey,
  customFrom: string,
  customTo: string,
  now: Date = new Date()
): { from: string; to: string } | null {
  const year = now.getFullYear()
  const month = now.getMonth()

  if (range === 'current') {
    return {
      from: `${year}-${pad2(month + 1)}-01`,
      to: `${year}-${pad2(month + 1)}-${pad2(new Date(year, month + 1, 0).getDate())}`,
    }
  }
  if (range === 'previous') {
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    return {
      from: `${prevYear}-${pad2(prevMonth + 1)}-01`,
      to: `${prevYear}-${pad2(prevMonth + 1)}-${pad2(new Date(prevYear, prevMonth + 1, 0).getDate())}`,
    }
  }

  const from = String(customFrom ?? '').trim()
  const to = String(customTo ?? '').trim()
  if (from === '' || to === '') return null
  return from <= to ? { from, to } : { from: to, to: from }
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** PURE: base64 encoder for the Capacitor Filesystem.writeFile payload. Hand
 * rolled so the pure module keeps zero runtime deps (no btoa/global Buffer). */
export function bytesToBase64(bytes: unknown): string {
  const view =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(Array.isArray(bytes) ? (bytes as number[]) : [])
  let out = ''
  for (let i = 0; i < view.length; i += 3) {
    const b0 = view[i]
    const b1 = i + 1 < view.length ? view[i + 1] : undefined
    const b2 = i + 2 < view.length ? view[i + 2] : undefined

    out += BASE64_ALPHABET[b0 >> 2]
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f]
  }
  return out
}

// ─── IMPURE: download ────────────────────────────────────────────────────────

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const CSV_MIME = 'text/csv'
/** UTF-8 BOM so Excel opens the CSV as UTF-8; decodeUtf8() strips it back out
 * on import. */
const UTF8_BOM = '\uFEFF'

export interface DownloadExportInput {
  rows: readonly CanonicalExportRow[]
  /** Localized column labels, already resolved through t() by the caller. */
  headers: readonly string[]
  format: ExportFormat
  filename: string
  prefs: ExportPrefs
  /** Localized worksheet name (xlsx only). */
  sheetName: string
}

export interface BrowserLikeWindow {
  Capacitor?: { isNativePlatform?: () => boolean }
}

/** Detect the Capacitor (iOS/Android) shell. Guarded: the same web build is
 * served as a PWA, where window.Capacitor is absent. */
export function isNativeApp(target: unknown = typeof window === 'undefined' ? null : window): boolean {
  try {
    const capacitor = (target as BrowserLikeWindow | null)?.Capacitor
    if (typeof capacitor?.isNativePlatform !== 'function') return false
    return capacitor.isNativePlatform() === true
  } catch {
    return false
  }
}

/** Web/PWA download: Blob + anchor, mirroring BackupViewer.tsx. */
function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/** Mobile download: write into the app cache and hand the file to the native
 * share sheet. Returns false (never throws) when the shell/plugins are not
 * available, so downloadExport can fall back to the Blob path. */
async function nativeShare(bytes: Uint8Array, filename: string): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const written = await Filesystem.writeFile({
      path: filename,
      data: bytesToBase64(bytes),
      directory: Directory.Cache,
      recursive: true,
    })
    await Share.share({ title: filename, text: filename, url: written.uri, files: [written.uri] })
    return true
  } catch {
    return false
  }
}

/** Build the xlsx bytes: real numeric cells for monto + the prefs-derived
 * numFmt (see numFmtForDecimals for the locale nuance). */
async function buildXlsxBytes(input: DownloadExportInput): Promise<Uint8Array> {
  const XLSX = await import('xlsx')
  const spec = buildXlsxAoA(input.rows, input.headers, input.prefs)
  const sheet = XLSX.utils.aoa_to_sheet(spec.aoa)

  const column = XLSX.utils.encode_col(spec.montoColumnIndex)
  for (let index = 1; index < spec.aoa.length; index++) {
    const cell = sheet[`${column}${index + 1}`]
    if (cell && typeof cell.v === 'number') cell.z = spec.montoNumFmt
  }

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, String(input.sheetName || 'Sheet1'))
  const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Uint8Array(buffer)
}

/**
 * IMPURE: generate the file for `format` and deliver it. Order of delivery:
 * Capacitor share (native) -> Blob + anchor (web/PWA). Everything async/await;
 * the caller owns the try/catch + parseError.
 */
export async function downloadExport(input: DownloadExportInput): Promise<void> {
  if (input.format === 'xlsx') {
    const bytes = await buildXlsxBytes(input)
    if (await nativeShare(bytes, input.filename)) return
    anchorDownload(new Blob([bytes], { type: XLSX_MIME }), input.filename)
    return
  }

  const text = UTF8_BOM + buildCsvText(input.rows, input.headers)
  const bytes = new TextEncoder().encode(text)
  if (await nativeShare(bytes, input.filename)) return
  anchorDownload(new Blob([bytes], { type: `${CSV_MIME};charset=utf-8` }), input.filename)
}
