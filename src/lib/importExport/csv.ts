// src/lib/importExport/csv.ts
// Pure RFC4180 CSV writer for the Importar/Exportar feature.
// Text/rows in -> CSV string out. No DOM, no network, no external deps.
// Erasable-syntax only, so node --test can import it via Node's native
// TypeScript type stripping (same pattern as parser.ts / validate.ts).
//
// Used by the failed-rows download (T4) and reusable by the export step (T5).
// The delimiter is configurable because es-AR Excel exports default to ';'
// (spec §3), while the export step will reuse this with the user's choice.

export interface RowsToCsvOptions {
  /** Field separator. Defaults to ';' (es-AR Excel convention). */
  delimiter?: string
}

const QUOTE = '"'

/** A field must be quoted when it contains the delimiter, a quote, or a line
 * break (RFC4180 §2.6-2.7). */
function needsQuoting(value: string, delimiter: string): boolean {
  if (value.includes(QUOTE)) return true
  if (value.includes('\n') || value.includes('\r')) return true
  if (delimiter !== '' && value.includes(delimiter)) return true
  return false
}

/** Wrap in double quotes and double any embedded quote (RFC4180 §2.7). */
function quoteField(value: string, delimiter: string): string {
  if (!needsQuoting(value, delimiter)) return value
  return QUOTE + value.split(QUOTE).join(QUOTE + QUOTE) + QUOTE
}

/**
 * Serialize a matrix of already-stringified cells to RFC4180 CSV.
 * Records are joined with CRLF (RFC4180 §2.1); no trailing line break is
 * appended, so an empty matrix serializes to ''.
 */
export function rowsToCsv(rows: string[][], options: RowsToCsvOptions = {}): string {
  const delimiter = options.delimiter ?? ';'
  const list = Array.isArray(rows) ? rows : []
  return list
    .map((row) =>
      (Array.isArray(row) ? row : [])
        .map((cell) => quoteField(cell === null || cell === undefined ? '' : String(cell), delimiter))
        .join(delimiter)
    )
    .join('\r\n')
}
