// src/lib/importExport/parseWorkbook.ts
// Turns uploaded file bytes into { headers, rows } of display strings.
// No DOM events, no network. Two decode paths, one table shape out:
//
// - .csv/.tsv: UTF-8 decode (BOM stripped) -> detectDelimiter + parseDelimitedText.
// - .xlsx: lazy `import('xlsx')` keeps SheetJS OUT of the main bundle (spec §2);
//   sheet_to_json runs with { header: 1, raw: false, defval: '' } on the FIRST
//   worksheet so dates/numbers arrive as display strings. We deliberately do NOT
//   trust SheetJS's date/number interpretations: we re-parse those display
//   strings ourselves with parser.ts (parseFecha/parseMonto) using the user's
//   regional prefs. That keeps a single parse path for every format.

import { detectDelimiter, parseDelimitedText } from './parser'
import type { MappedRows } from './schema'

/** Machine error key; the page resolves it with parseError(). */
export interface ParseFileError {
  key: 'config_ie_error_unsupported_file'
}

const UTF8_BOM = '\uFEFF'

/** Decode file bytes as UTF-8 and strip a leading BOM if present. */
export function decodeUtf8(buffer: ArrayBuffer): string {
  const text = new TextDecoder('utf-8').decode(buffer)
  return text.startsWith(UTF8_BOM) ? text.slice(1) : text
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** Dispatch by file extension. Unknown extension throws a typed error key. */
export async function parseUploadedFile(name: string, buffer: ArrayBuffer): Promise<MappedRows> {
  const ext = extensionOf(name)

  if (ext === 'csv' || ext === 'tsv') {
    const text = decodeUtf8(buffer)
    return ext === 'tsv'
      ? parseDelimitedText(text, '\t')
      : parseDelimitedText(text, detectDelimiter(text))
  }

  if (ext === 'xlsx') {
    return parseXlsx(buffer)
  }

  throw { key: 'config_ie_error_unsupported_file' }
}

async function parseXlsx(buffer: ArrayBuffer): Promise<MappedRows> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array' })

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return { headers: [], rows: [] }

  const sheet = workbook.Sheets[firstSheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  })

  return matrixToTable(matrix)
}

/** Trim headers, drop blank rows, pad short rows to the header width and cast
 * every cell to a display string. Mirrors what parseDelimitedText guarantees. */
function matrixToTable(matrix: unknown[][]): MappedRows {
  const nonEmpty = matrix.filter((row) =>
    row.some((cell) => String(cell ?? '').trim() !== '')
  )
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  const headers = nonEmpty[0].map((cell) => String(cell ?? '').trim())
  const rows = nonEmpty.slice(1).map((row) => {
    const cells = row.map((cell) => String(cell ?? ''))
    while (cells.length < headers.length) cells.push('')
    return cells
  })

  return { headers, rows }
}
