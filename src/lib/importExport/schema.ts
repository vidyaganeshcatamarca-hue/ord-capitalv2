// src/lib/importExport/schema.ts
// Canonical field definitions shared by the import wizard and the export step
// (spec §3). Pure config + types only: no DOM, no network, no external deps.
// Erasable-syntax only, so it can be imported by node --test via Node's native
// TypeScript type stripping alongside parser.ts.

/** Every canonical column of the round-trippable schema (import == export). */
export type CanonicalFieldId =
  | 'fecha'
  | 'tipo'
  | 'monto'
  | 'billetera_origen'
  | 'billetera_destino'
  | 'cuenta'
  | 'detalle'

/** Movement types the wizard validates against at step 3 (reconciliation). */
export type ImportTipo = 'income' | 'expense' | 'transfer'

/** Whether a canonical field is mandatory for each movement tipo. Step 3 uses
 * this at validation time; T3a only reads it to mark required fields in the
 * mapping UI. */
export type RequiredByTipo = Record<ImportTipo, boolean>

export interface CanonicalFieldDef {
  id: CanonicalFieldId
  /** i18n key for the field label (one label per canonical field). */
  labelKey: string
  required: RequiredByTipo
  /** Field only meaningful for transfers (the destination wallet). */
  transferOnly: boolean
}

export const CANONICAL_FIELDS: readonly CanonicalFieldDef[] = [
  {
    id: 'fecha',
    labelKey: 'config_ie_map_field_fecha',
    required: { income: true, expense: true, transfer: true },
    transferOnly: false,
  },
  {
    id: 'tipo',
    labelKey: 'config_ie_map_field_tipo',
    required: { income: true, expense: true, transfer: true },
    transferOnly: false,
  },
  {
    id: 'monto',
    labelKey: 'config_ie_map_field_monto',
    required: { income: true, expense: true, transfer: true },
    transferOnly: false,
  },
  {
    id: 'billetera_origen',
    labelKey: 'config_ie_map_field_billetera_origen',
    required: { income: true, expense: true, transfer: true },
    transferOnly: false,
  },
  {
    id: 'billetera_destino',
    labelKey: 'config_ie_map_field_billetera_destino',
    required: { income: false, expense: false, transfer: true },
    transferOnly: true,
  },
  {
    id: 'cuenta',
    labelKey: 'config_ie_map_field_cuenta',
    // Only expenses carry a category: AddMovementModal passes
    // estructura_egreso_id = null for income and transfer
    // (AddMovementModal.tsx:872), so the round-trip stays consistent.
    required: { income: false, expense: true, transfer: false },
    transferOnly: false,
  },
  {
    id: 'detalle',
    labelKey: 'config_ie_map_field_detalle',
    required: { income: false, expense: false, transfer: false },
    transferOnly: false,
  },
]

/** Fields the mapping step requires before Continue (T3a gate). Transfer-only
 * fields are excluded: the per-row tipo is unknown while mapping. `tipo` joins
 * this set only when the tipo source is the column (see TipoSource). */
export const MAPPING_GATE_FIELDS: readonly CanonicalFieldId[] = [
  'fecha',
  'monto',
  'billetera_origen',
  'cuenta',
]

/** Where the movement tipo comes from: an explicit column or the amount sign. */
export type TipoSource = 'column' | 'sign'

/** Account-name separator ids; the char drives splitCuenta in parser.ts. */
export type SepId = 'dash' | 'slash' | 'pipe'

/** Default (dash) first to match the spec's `Padre-Sub` convention. */
export const SEPARATORS: ReadonlyArray<{ id: SepId; char: string }> = [
  { id: 'dash', char: '-' },
  { id: 'slash', char: '/' },
  { id: 'pipe', char: '|' },
]

/** Shape the parse step produces and the validate step consumes. */
export interface MappedRows {
  headers: string[]
  rows: string[][]
}

/** Canonical field -> header index. Produced by guessHeaderMapping and edited
 * by the user. `undefined` means "sin asignar". */
export type FieldMapping = Partial<Record<CanonicalFieldId, number>>

/** User regional prefs the wizard reads (READ ONLY) to parse dates/amounts.
 * Same fields RegionFormatoPage manages; only the parse-relevant subset. */
export interface ImportUserPrefs {
  separador_miles: string
  separador_decimal: string
  formato_fecha: string
}
