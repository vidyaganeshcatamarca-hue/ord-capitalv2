// src/lib/importExport/execute.ts
// Execution layer for the Importar/Exportar wizard (spec §2/§4, T4).
//
// Two layers live here on purpose:
//  - PURE helpers (rowToMovementParams, errorKeyOf, durationBucket): plain
//    data in/out, zero imports of the app runtime, unit-testable through
//    node --test with Node's native TypeScript type stripping.
//  - IMPURE executeImport: the thin sequential RPC wrapper. It dynamically
//    imports '@/lib/supabase' and '@/locales/i18n' INSIDE the function so the
//    module stays loadable by node --test (only the pure exports are tested).
//
// Cross-currency transfers are NOT supported by the import (spec §5 amendment,
// owner decision): the canonical schema has no monto_destino, so every row is
// inserted with p_destination_amount: null. A transfer between wallets with
// different currencies therefore reaches fn_registrar_movimiento_caja and fails
// there with the backend's own error contract (surfaced per row in the summary).
//
// RPC surface (existing only, no new RPCs, no table access):
//  fn_crear_billetera, fn_crear_cuenta_egreso, fn_crear_subcuenta_egreso,
//  fn_registrar_movimiento_caja.

import type { ImportTipo } from './schema.ts'
import type { CupoTipo, WorksetCuenta, WorksetRow } from './validate.ts'
import { accountKey } from './validate.ts'
import { normalizeNombre } from './parser.ts'

/** Machine error key used when a row depends on an entity that could not be
 * created during execution. */
export const ENTITY_CREATION_ERROR_KEY = 'config_ie_error_entity_creation'
/** Fallback key when a registrar RPC error cannot be mapped to a DB key. */
export const ROW_IMPORT_ERROR_KEY = 'config_ie_error_row_import_failed'

/** One row ready for execution. `index` is the stable position in the source
 * workset (used to map failures back to the original file rows). */
export interface ExecuteRow {
  index: number
  data: WorksetRow
}

/** A wallet referenced by the workset: reuse an existing id or create a new
 * wallet with the user-approved name/currency. `currency` is only consumed by
 * the creation call (fn_crear_billetera) — the import never uses it to decide
 * a destination amount. */
export interface WalletTarget {
  /** Normalized name as referenced by the rows. */
  name: string
  /** Existing wallet id when matched; null means "create new". */
  existingId: number | null
  newName: string
  currency: string
}

/** An account (parent, optionally with a sub) referenced by the workset. */
export interface AccountTarget {
  /** accountKey() of the source padre|sub pair. */
  key: string
  /** Existing leaf estructura_id when matched; null means "create". */
  existingId: number | null
  finalName: string
  sub: string | null
  subName: string
  cupo: CupoTipo
}

export interface ImportResolutions {
  wallets: WalletTarget[]
  accounts: AccountTarget[]
}

/** Aggregate inline-fix counters for the import_row_fixed telemetry event. */
export interface RowFixCounts {
  rows_fixed_total: number
  fixes_date: number
  fixes_tipo: number
  fixes_monto: number
  fixes_wallets: number
  fixes_cuenta: number
}

/** Payload handed from the reconciliation step to the page when the user
 * confirms the gate. */
export interface ReconcileHandoff {
  rows: ExecuteRow[]
  resolutions: ImportResolutions
  discarded: number
  fixes: RowFixCounts
}

export interface RowFailure {
  index: number
  errorKey: string
  message: string
}

export interface ImportExecutionResult {
  inserted: number
  failed: number
  failures: RowFailure[]
  walletsCreated: number
  parentsCreated: number
  subsCreated: number
  walletsFailed: number
  accountsFailed: number
  durationMs: number
}

export type DurationBucket = '<5' | '<15' | '<60' | '<300' | '300+'

/** Coarse-grained duration bucket for import_executed (seconds). */
export function durationBucket(ms: number): DurationBucket {
  if (ms < 5_000) return '<5'
  if (ms < 15_000) return '<15'
  if (ms < 60_000) return '<60'
  if (ms < 300_000) return '<300'
  return '300+'
}

/** Extract the machine error key from an RPC error message. Mirrors the
 * `{"key": "...", "params": {...}}` contract that parseError() resolves. */
export function errorKeyOf(err: unknown): string {
  if (err === null || err === undefined) return ''
  const raw = typeof err === 'string' ? err : (err as { message?: unknown }).message
  const message = typeof raw === 'string' ? raw : ''
  if (message === '') return ''
  const match = message.match(/\{[\s\S]*\}/)
  if (!match) return ''
  try {
    const parsed = JSON.parse(match[0]) as { key?: unknown }
    if (parsed && typeof parsed.key === 'string') return parsed.key
  } catch {
    return ''
  }
  return ''
}

export interface MovementParamIds {
  origenWalletId: number
  destinoWalletId?: number | null
  /** Resolved leaf estructura_id for expense rows. */
  estructuraEgresoId?: number | null
}

/**
 * PURE: build the exact fn_registrar_movimiento_caja param object for one row.
 *
 * Tipo rules: expense carries the account as estructura_egreso_id; income
 * carries none; transfers carry the destination wallet.
 *
 * p_destination_amount is ALWAYS null and must keep being sent: the backend
 * contract requires the parameter to be present, and the value is what tells
 * fn_registrar_movimiento_caja to do a single (non cross-currency) insert. The
 * import path has no monto_destino column anymore (spec §5 amendment), so a
 * cross-currency transfer hits the backend's own validation and fails as a
 * normal per-row error.
 */
export function rowToMovementParams(
  row: WorksetRow,
  ids: MovementParamIds
): Record<string, unknown> {
  const tipo: ImportTipo = row.tipo ?? 'income'
  const monto = Math.abs(row.monto ?? 0)
  const isTransfer = tipo === 'transfer'

  return {
    p_tipo: tipo,
    p_billetera_origen_id: ids.origenWalletId,
    p_billetera_destino_id: isTransfer ? ids.destinoWalletId ?? null : null,
    p_valor_ingreso: tipo === 'income' ? monto : 0,
    p_valor_egreso: tipo === 'income' ? 0 : monto,
    p_descripcion: null,
    p_fecha: row.fechaISO,
    p_es_compartido: false,
    p_estructura_egreso_id: tipo === 'expense' ? ids.estructuraEgresoId ?? null : null,
    p_proyecto_id: null,
    p_cuenta_ingreso_id: null,
    p_detalle: row.detalle ? row.detalle : null,
    p_destination_amount: null,
  }
}

export interface ExecuteImportInput {
  rows: ExecuteRow[]
  resolutions: ImportResolutions
  onProgress?: (done: number, total: number) => void
}

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`
}

function asId(value: unknown): number {
  return Number(value)
}

/**
 * IMPURE: create the approved NEW entities (once) and insert the rows
 * sequentially. A failure never aborts the batch: entity-creation failures
 * cascade to their rows as config_ie_error_entity_creation, and registrar
 * failures are collected per row with their machine key.
 */
export async function executeImport({
  rows,
  resolutions,
  onProgress,
}: ExecuteImportInput): Promise<ImportExecutionResult> {
  const startedAt = Date.now()
  // Dynamic imports keep the module node-loadable for the pure unit tests.
  const { rpc } = await import('@/lib/supabase')
  const { parseError, t } = await import('@/locales/i18n')

  const list = Array.isArray(rows) ? rows : []
  const total = list.length
  let done = 0
  const reportProgress = () => onProgress?.(done, total)

  // ── 1) Wallets ─────────────────────────────────────────────────────────
  const walletIds = new Map<string, number>()
  const walletErrors = new Map<string, string>()
  let walletsCreated = 0

  for (const target of resolutions.wallets) {
    if (target.existingId !== null && Number.isFinite(target.existingId)) {
      walletIds.set(target.name, asId(target.existingId))
      continue
    }
    try {
      const id = await rpc<number>('fn_crear_billetera', {
        p_nombre: target.newName,
        p_moneda: target.currency,
        p_saldo_apertura: 0,
        p_icono: '💳',
        p_fecha_apertura: todayIso(),
      })
      walletIds.set(target.name, asId(id))
      walletsCreated++
    } catch (err) {
      walletErrors.set(target.name, parseError(err))
    }
  }

  // ── 2) Parent accounts + 3) Sub accounts ───────────────────────────────
  const accountIds = new Map<string, number>()
  const accountErrors = new Map<string, string>()
  const createdParentIds = new Map<string, number>()
  let parentsCreated = 0
  let subsCreated = 0

  for (const target of resolutions.accounts) {
    if (target.existingId !== null && Number.isFinite(target.existingId)) {
      accountIds.set(target.key, asId(target.existingId))
      continue
    }
    try {
      const parentKey = normalizeNombre(target.finalName)
      let parentId = createdParentIds.get(parentKey)
      if (parentId === undefined) {
        parentId = asId(
          await rpc<number>('fn_crear_cuenta_egreso', {
            p_nombre: target.finalName,
            p_descripcion: '',
            p_tipo_cupo: target.cupo,
            p_icono: 'Tag',
            p_color: null,
          })
        )
        createdParentIds.set(parentKey, parentId)
        parentsCreated++
      }

      if (target.sub === null || target.sub === '') {
        accountIds.set(target.key, parentId)
      } else {
        const subId = asId(
          await rpc<number>('fn_crear_subcuenta_egreso', {
            p_padre_id: parentId,
            p_nombre: target.subName,
            p_descripcion: '',
            p_icono: 'Tag',
            p_es_deseo: target.cupo === 'want',
            p_es_hormiga: false,
            p_utilidad_placer: 5,
            p_flexibilidad_recorte: 5,
          })
        )
        accountIds.set(target.key, subId)
        subsCreated++
      }
    } catch (err) {
      accountErrors.set(target.key, parseError(err))
    }
  }

  // ── 4) Rows, sequentially ──────────────────────────────────────────────
  let inserted = 0
  const failures: RowFailure[] = []

  for (const row of list) {
    const data = row.data
    const origenName = data.wallets.origen
    const destinoName = data.wallets.destino
    const cuenta: WorksetCuenta | null = data.cuenta
    const rowAccountKey = cuenta ? accountKey(cuenta) : null

    const origenId = walletIds.get(origenName)
    const destinoId = data.tipo === 'transfer' ? walletIds.get(destinoName) : undefined

    let entityFailure: RowFailure | null = null
    if (origenId === undefined) {
      entityFailure = {
        index: row.index,
        errorKey: ENTITY_CREATION_ERROR_KEY,
        message: walletErrors.get(origenName) ?? t(ENTITY_CREATION_ERROR_KEY),
      }
    } else if (data.tipo === 'transfer' && destinoId === undefined) {
      entityFailure = {
        index: row.index,
        errorKey: ENTITY_CREATION_ERROR_KEY,
        message: walletErrors.get(destinoName) ?? t(ENTITY_CREATION_ERROR_KEY),
      }
    } else if (
      data.tipo === 'expense' &&
      rowAccountKey !== null &&
      !accountIds.has(rowAccountKey)
    ) {
      entityFailure = {
        index: row.index,
        errorKey: ENTITY_CREATION_ERROR_KEY,
        message: accountErrors.get(rowAccountKey) ?? t(ENTITY_CREATION_ERROR_KEY),
      }
    }

    if (entityFailure) {
      failures.push(entityFailure)
      done++
      reportProgress()
      continue
    }

    try {
      const params = rowToMovementParams(data, {
        origenWalletId: origenId as number,
        destinoWalletId: destinoId ?? null,
        estructuraEgresoId:
          data.tipo === 'expense' && rowAccountKey !== null
            ? accountIds.get(rowAccountKey) ?? null
            : null,
      })
      await rpc('fn_registrar_movimiento_caja', params)
      inserted++
    } catch (err) {
      failures.push({
        index: row.index,
        errorKey: errorKeyOf(err) || ROW_IMPORT_ERROR_KEY,
        message: parseError(err),
      })
    }
    done++
    reportProgress()
  }

  return {
    inserted,
    failed: failures.length,
    failures,
    walletsCreated,
    parentsCreated,
    subsCreated,
    walletsFailed: walletErrors.size,
    accountsFailed: accountErrors.size,
    durationMs: Date.now() - startedAt,
  }
}
