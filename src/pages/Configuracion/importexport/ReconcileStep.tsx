// src/pages/Configuracion/importexport/ReconcileStep.tsx
// Wizard step 3 (reconciliation) for the Importar/Exportar feature: per-row
// status table with inline correction + row discarding, and the NEW
// wallet/account blocks resolved one by one. Entity catalogs are read once
// from the two existing RPCs; the hard gate keeps execution disabled while any
// row is in error or any new entity is still unapproved.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { catalogDisplayName } from '@/lib/catalogRegistry'
import { filterUserEditableCategories } from '@/lib/categoryFilters'
import type {
  CanonicalFieldId,
  FieldMapping,
  ImportTipo,
  ImportUserPrefs,
  MappedRows,
  SepId,
  TipoSource,
} from '@/lib/importExport/schema'
import {
  ROW_ERROR_KEYS,
  accountKey,
  applyAccountRejections,
  buildRow,
  buildWorkset,
  collectEntities,
  countStatuses,
  matchEntities,
  suggestCupo,
} from '@/lib/importExport/validate'
import type { CollectedAccount, CupoTipo, WorksetRow } from '@/lib/importExport/validate'
import { partitionExcludedRows } from '@/lib/importExport/execute'
import type {
  AccountTarget,
  ExecuteRow,
  ReconcileHandoff,
  RowFixCounts,
  WalletTarget,
} from '@/lib/importExport/execute'
import { normalizeNombre, parseMonto } from '@/lib/importExport/parser'
import './ReconcileStep.css'

interface WalletRow {
  billetera_id: number
  nombre: string
  moneda: string
  activa?: boolean
}

interface CategoryChildRow {
  estructura_id: number
  nombre_cuenta: string
}

interface CategoryRow {
  estructura_id: number
  nombre_cuenta: string
  tipo_cupo?: string
  hijos?: CategoryChildRow[]
}

interface ReconcileStepProps {
  table: MappedRows
  mapping: FieldMapping
  sep: SepId
  tipoSource: TipoSource
  /** Tipo applied to every row when tipoSource === 'fixed' (owner bug 4). */
  fixedTipo: ImportTipo
  prefs: ImportUserPrefs
  onBack: () => void
  /** Emits the freshly re-validated workset plus entity resolutions and
   * inline-fix counters when the user confirms the hard gate. */
  onContinue: (handoff: ReconcileHandoff) => void
}

interface ReconcileRow {
  raw: string[]
  overrides: Partial<Record<CanonicalFieldId, string>>
  data: WorksetRow
  discarded: boolean
}

interface WalletResolution {
  resolvedTo: string | null
  newName: string
  currency: string
  approved: boolean
}

interface AccountResolution {
  resolvedTo: string | null
  finalName: string
  subName: string
  approved: boolean
  /** Owner rejected this account: its rows are excluded from the batch and the
   * card collapses to a compact state until reincorporated (defect 2). */
  rejected?: boolean
}

const TIPO_WORD: Record<'income' | 'expense' | 'transfer', string> = {
  income: 'ingreso',
  expense: 'egreso',
  transfer: 'transferencia',
}

/** i18n keys for the three movement tipos (ingreso/egreso/transferencia). */
const TIPO_LABEL_KEY: Record<ImportTipo, string> = {
  income: 'config_tipo_movimiento_ingreso',
  expense: 'config_tipo_movimiento_egreso',
  transfer: 'type_transfer',
}

const CUPO_VALUES: readonly CupoTipo[] = ['need', 'want', 'tithe']

function asCupoTipo(value: unknown, fallbackName: string): CupoTipo {
  return typeof value === 'string' && (CUPO_VALUES as readonly string[]).includes(value)
    ? (value as CupoTipo)
    : suggestCupo(fallbackName)
}

const CUPO_OPTIONS: ReadonlyArray<{ value: CupoTipo; labelKey: string }> = [
  { value: 'need', labelKey: 'cat_need_label' },
  { value: 'want', labelKey: 'cat_want_label' },
  { value: 'tithe', labelKey: 'cat_tithe_label' },
]

const DEFAULT_CURRENCY = 'ARS'

function rawAt(row: string[], mapping: FieldMapping, fieldId: CanonicalFieldId): string {
  const index = mapping[fieldId]
  if (index === undefined) return ''
  return row[index] ?? ''
}

/** Merge per-row overrides into a raw row + mapping so buildRow can re-validate
 * fields that have no mapped column (e.g. a transfer destino). */
function effectiveRow(
  raw: string[],
  overrides: Partial<Record<CanonicalFieldId, string>>,
  mapping: FieldMapping
): { cells: string[]; effectiveMapping: FieldMapping } {
  const cells = raw.slice()
  const effectiveMapping: FieldMapping = { ...mapping }
  for (const fieldId of Object.keys(overrides) as CanonicalFieldId[]) {
    const value = overrides[fieldId] ?? ''
    const index = effectiveMapping[fieldId]
    if (index !== undefined) {
      cells[index] = value
      continue
    }
    const appended = cells.length
    cells.push(value)
    effectiveMapping[fieldId] = appended
  }
  return { cells, effectiveMapping }
}

interface WalletEntityCardProps {
  name: string
  resolution: WalletResolution | undefined
  ambiguity: boolean
  collisionCandidates: string[]
  currencyOptions: string[]
  defaultCurrency: string
  onChange: (next: WalletResolution) => void
}

function WalletEntityCard({
  name,
  resolution,
  ambiguity,
  collisionCandidates,
  currencyOptions,
  defaultCurrency,
  onChange,
}: WalletEntityCardProps) {
  const current = resolution ?? {
    resolvedTo: null,
    newName: name,
    currency: defaultCurrency,
    approved: false,
  }

  return (
    <div className="config-ie-entity-card">
      {ambiguity && <p className="config-ie-entity-warn">{t('config_ie_reconcile_ambiguous')}</p>}
      <label className="config-ie-entity-field">
        <span>{t('config_ie_reconcile_new_wallet_name')}</span>
        <input
          type="text"
          className="config-ie-reconcile-input"
          value={current.newName}
          onChange={(e) => onChange({ ...current, resolvedTo: null, newName: e.target.value, approved: false })}
        />
      </label>
      <label className="config-ie-entity-field">
        <span>{t('config_ie_reconcile_new_wallet_currency')}</span>
        <select
          className="config-ie-reconcile-select"
          value={current.currency}
          onChange={(e) => onChange({ ...current, resolvedTo: null, currency: e.target.value, approved: false })}
        >
          {currencyOptions.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </label>
      {collisionCandidates.length > 0 && (
        <label className="config-ie-entity-field">
          <span>{t('config_ie_reconcile_use_existing')}</span>
          <select
            className="config-ie-reconcile-select"
            value={current.resolvedTo ?? ''}
            onChange={(e) =>
              onChange({
                ...current,
                resolvedTo: e.target.value === '' ? null : e.target.value,
                approved: e.target.value !== '',
              })
            }
          >
            <option value="">{t('config_ie_reconcile_create_new')}</option>
            {collisionCandidates.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>
      )}
      {current.approved ? (
        <span className="config-ie-entity-approved">✓ {t('config_ie_reconcile_approved')}</span>
      ) : (
        <button
          type="button"
          className="config-ie-entity-btn"
          onClick={() => onChange({ ...current, approved: true })}
        >
          {t('config_ie_reconcile_approve')}
        </button>
      )}
    </div>
  )
}

interface AccountEntityCardProps {
  account: CollectedAccount
  resolution: AccountResolution | undefined
  ambiguity: boolean
  collisionCandidates: Array<{ key: string; label: string }>
  /** True when this card also creates the parent (no existing parent match).
   * Only then does the card own the parent's cupo; a sub-only card inherits. */
  padreIsNew: boolean
  /** Resolved parent name shown in the inherited-cupo hint. */
  padreDisplayName: string
  /** Effective parent cupo; a sub-card never owns it, it inherits this. */
  cupo: CupoTipo
  onCupoChange: (cupo: CupoTipo) => void
  onChange: (next: AccountResolution) => void
}

function AccountEntityCard({
  account,
  resolution,
  ambiguity,
  collisionCandidates,
  padreIsNew,
  padreDisplayName,
  cupo,
  onCupoChange,
  onChange,
}: AccountEntityCardProps) {
  const current = resolution ?? {
    resolvedTo: null,
    finalName: account.padre,
    subName: account.sub ?? '',
    approved: false,
  }

  // Rejected account: collapse to a compact state. Its rows leave the batch
  // until the owner reincorporates it (defect 2).
  if (current.rejected) {
    return (
      <div className="config-ie-entity-card config-ie-entity-card--rejected">
        <p className="config-ie-entity-relationship">
          {t('config_ie_reconcile_parent_sub', {
            padre: current.finalName,
            sub: account.sub ?? t('config_ie_reconcile_no_sub'),
          })}
        </p>
        <span className="config-ie-entity-note">{t('config_ie_reconcile_reject_hint')}</span>
        <button
          type="button"
          className="config-ie-entity-btn"
          onClick={() => onChange({ ...current, rejected: false })}
        >
          {t('config_ie_reconcile_reinstate')}
        </button>
      </div>
    )
  }

  return (
    <div className="config-ie-entity-card">
      {ambiguity && <p className="config-ie-entity-warn">{t('config_ie_reconcile_ambiguous')}</p>}
      <p className="config-ie-entity-relationship">
        {t('config_ie_reconcile_parent_sub', {
          padre: current.finalName,
          sub: account.sub ?? t('config_ie_reconcile_no_sub'),
        })}
      </p>
      <label className="config-ie-entity-field">
        <span>{t('config_ie_reconcile_new_account_name')}</span>
        <input
          type="text"
          className="config-ie-reconcile-input"
          value={current.finalName}
          onChange={(e) => onChange({ ...current, resolvedTo: null, finalName: e.target.value, approved: false })}
        />
      </label>
      {account.sub !== null && (
        <>
          <label className="config-ie-entity-field">
            <span>{t('config_ie_reconcile_new_account_sub')}</span>
            <input
              type="text"
              className="config-ie-reconcile-input"
              value={current.subName}
              onChange={(e) => onChange({ ...current, resolvedTo: null, subName: e.target.value, approved: false })}
            />
          </label>
          <span className="config-ie-entity-note">
            {padreIsNew
              ? t('config_ie_reconcile_sub_inherits')
              : t('config_ie_reconcile_sub_inherits_from', { padre: padreDisplayName })}
          </span>
        </>
      )}
      {padreIsNew && (
        <>
          <label className="config-ie-entity-field">
            <span>{t('config_ie_reconcile_new_account_cupo')}</span>
            <select
              className="config-ie-reconcile-select"
              value={cupo}
              onChange={(e) => onCupoChange(e.target.value as CupoTipo)}
            >
              {CUPO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <span className="config-ie-entity-note">{t('config_ie_reconcile_cupo_padre_hint')}</span>
        </>
      )}
      {collisionCandidates.length > 0 && (
        <label className="config-ie-entity-field">
          <span>{t('config_ie_reconcile_use_existing')}</span>
          <select
            className="config-ie-reconcile-select"
            value={current.resolvedTo ?? ''}
            onChange={(e) =>
              onChange({
                ...current,
                resolvedTo: e.target.value === '' ? null : e.target.value,
                approved: e.target.value !== '',
              })
            }
          >
            <option value="">{t('config_ie_reconcile_create_new')}</option>
            {collisionCandidates.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="config-ie-entity-actions">
        {current.approved ? (
          <span className="config-ie-entity-approved">✓ {t('config_ie_reconcile_approved')}</span>
        ) : (
          <button
            type="button"
            className="config-ie-entity-btn"
            onClick={() => onChange({ ...current, approved: true })}
          >
            {t('config_ie_reconcile_approve')}
          </button>
        )}
        <button
          type="button"
          className="config-ie-entity-btn config-ie-entity-btn--secondary"
          title={t('config_ie_reconcile_reject_hint')}
          onClick={() => onChange({ ...current, rejected: true })}
        >
          {t('config_ie_reconcile_reject')}
        </button>
      </div>
    </div>
  )
}

export function ReconcileStep({
  table,
  mapping,
  sep,
  tipoSource,
  fixedTipo,
  prefs,
  onBack,
  onContinue,
}: ReconcileStepProps) {
  const { showToast } = useToast()
  const [entitiesStatus, setEntitiesStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [rubros, setRubros] = useState<CategoryRow[]>([])
  const [rows, setRows] = useState<ReconcileRow[]>(() => {
    const workset = buildWorkset({
      headers: table.headers,
      rows: table.rows,
      mapping,
      sep,
      tipoSource,
      fixedTipo,
      prefs,
    })
    return table.rows.map((raw, index) => ({
      raw,
      overrides: {},
      data: workset[index],
      discarded: false,
    }))
  })
  const [discardedCount, setDiscardedCount] = useState(0)
  const [walletRes, setWalletRes] = useState<Record<string, WalletResolution>>({})
  const [accountRes, setAccountRes] = useState<Record<string, AccountResolution>>({})
  // Single source of truth for the cupo of a NEW parent (owner bug 3): the
  // parent owns it and every sub-card under it inherits the same value.
  const [padreCupo, setPadreCupo] = useState<Record<string, CupoTipo>>({})
  // Row whose inline editors must stay mounted even after its last error is
  // fixed by a keystroke (owner defect 1: focus loss). onFocus sets the row
  // index, onBlur clears it, so the editor outlives the change that made the
  // row valid and only unmounts once the user leaves the field.
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null)

  // ── Entity catalogs: read once, guarded. On failure the step is blocked
  // (matching against existing wallets/categories is required to avoid
  // proposing duplicates of entities the user already owns). ──
  const loadEntities = useCallback(async () => {
    setEntitiesStatus('loading')
    try {
      const [walletData, treeData] = await Promise.all([
        rpc<WalletRow[]>('fn_obtener_billeteras_ordenadas', { p_orden: 'valor' }),
        rpc<CategoryRow[]>('fn_obtener_arbol_categorias'),
      ])
      setWallets(Array.isArray(walletData) ? walletData : [])
      setRubros(filterUserEditableCategories(Array.isArray(treeData) ? treeData : []))
      setEntitiesStatus('ready')
    } catch (err) {
      setEntitiesStatus('error')
      showToast(parseError(err), 'error')
    }
  }, [showToast])

  useEffect(() => {
    void loadEntities()
  }, [loadEntities])

  const baseRows = useMemo(
    () => rows.filter((row) => !row.discarded).map((row) => row.data),
    [rows]
  )
  // Entities are collected from the base rows: a rejection only adds an error
  // key, it never changes which wallets/accounts the file references, so the
  // card list stays stable while the owner toggles rejections.
  const entities = useMemo(() => collectEntities(baseRows), [baseRows])

  // Accounts the owner rejected (defect 2): their rows leave the batch without
  // closing the gate (countStatuses ignores this key).
  const rejectedAccountKeys = useMemo(
    () =>
      new Set(
        entities.accounts
          .filter((account) => accountRes[accountKey(account)]?.rejected === true)
          .map((account) => accountKey(account))
      ),
    [entities.accounts, accountRes]
  )
  const activeRows = useMemo(
    () => applyAccountRejections(baseRows, Array.from(rejectedAccountKeys)),
    [baseRows, rejectedAccountKeys]
  )

  // Display layer (catalogRegistry): a system wallet stores the i18n key
  // ('wallet_cash_default_name') while the user SEES the translated label
  // ("Efectivo"). Matching and every label must speak that display language,
  // otherwise a file row for the cash wallet can never match (defect 1).
  const existingWalletNames = useMemo(
    () => wallets.map((wallet) => catalogDisplayName(wallet.nombre)),
    [wallets]
  )
  const walletMatches = useMemo(
    () => matchEntities(entities.wallets, existingWalletNames),
    [entities.wallets, existingWalletNames]
  )
  /** Existing wallets keyed by the normalized DISPLAY name: resolves a matched
   * display label back to its real id/currency at handoff time. */
  const existingWalletByNorm = useMemo(() => {
    const map = new Map<string, WalletRow>()
    for (const wallet of wallets) {
      const key = normalizeNombre(catalogDisplayName(wallet.nombre))
      if (!map.has(key)) map.set(key, wallet)
    }
    return map
  }, [wallets])

  const existingAccounts = useMemo(() => {
    const list: Array<{ key: string; label: string; estructuraId: number }> = []
    for (const rubro of rubros) {
      const parent = catalogDisplayName(rubro.nombre_cuenta)
      list.push({
        key: accountKey({ padre: parent, sub: null }),
        label: parent,
        estructuraId: rubro.estructura_id,
      })
      for (const child of rubro.hijos ?? []) {
        const childName = catalogDisplayName(child.nombre_cuenta)
        list.push({
          key: accountKey({ padre: parent, sub: childName }),
          label: `${parent} › ${childName}`,
          estructuraId: child.estructura_id,
        })
      }
    }
    return list
  }, [rubros])
  const existingAccountKeys = useMemo(
    () => existingAccounts.map((account) => account.key),
    [existingAccounts]
  )
  const accountLabels = useMemo(() => {
    const labels: Record<string, string> = {}
    for (const account of existingAccounts) labels[account.key] = account.label
    return labels
  }, [existingAccounts])
  const accountMatches = useMemo(
    () => matchEntities(entities.accounts.map((account) => accountKey(account)), existingAccountKeys),
    [entities.accounts, existingAccountKeys]
  )

  /** Existing parent accounts keyed by normalized name: their label and the
   * real tipo_cupo a new sub would inherit from them. */
  const existingParentByKey = useMemo(() => {
    const map = new Map<string, { label: string; cupo: CupoTipo; estructuraId: number }>()
    for (const rubro of rubros) {
      const label = catalogDisplayName(rubro.nombre_cuenta)
      map.set(normalizeNombre(label), {
        label,
        cupo: asCupoTipo(rubro.tipo_cupo, label),
        estructuraId: rubro.estructura_id,
      })
    }
    return map
  }, [rubros])

  /** Whether a card creates its parent or only a sub, plus how the sub
   * inherits the parent's cupo (owner bug 3). */
  const padreInfoFor = (padre: string) => {
    const norm = normalizeNombre(padre)
    const padreKey = accountKey({ padre, sub: null })
    const match = accountMatches[padreKey]
    const autoPadre = match?.exact ?? match?.normalized ?? null
    const resolvedPadre = autoPadre ?? accountRes[padreKey]?.resolvedTo ?? null
    const existing = existingParentByKey.get(norm)
    return {
      norm,
      isNew: existing === undefined && resolvedPadre === null,
      displayName:
        existing?.label ?? (resolvedPadre ? accountLabels[resolvedPadre] ?? padre : padre),
      inheritedCupo: existing?.cupo ?? null,
      existingId: existing?.estructuraId ?? null,
    }
  }

  /** Effective cupo an account target carries to execution: a NEW parent uses
   * the shared padre-cupo selection; an existing parent passes on its own. */
  const cupoForAccount = (account: CollectedAccount): CupoTipo => {
    const info = padreInfoFor(account.padre)
    if (!info.isNew && info.inheritedCupo !== null) return info.inheritedCupo
    return padreCupo[info.norm] ?? suggestCupo(account.padre)
  }

  // Currency options come from the fetched wallets (prefs moneda_default is not
  // exposed by the allowed RPC set; DEFAULT_CURRENCY is the empty-catalog floor).
  const currencyOptions = useMemo(() => {
    const codes = new Set<string>()
    for (const wallet of wallets) if (wallet.moneda) codes.add(wallet.moneda)
    if (codes.size === 0) codes.add(DEFAULT_CURRENCY)
    return Array.from(codes)
  }, [wallets])
  const defaultCurrency = currencyOptions[0] ?? DEFAULT_CURRENCY

  const walletOptions = useMemo(() => {
    const options = new Map<string, string>()
    for (const wallet of wallets) {
      // Value = normalized DISPLAY name so the picker feeds the same string
      // the matcher uses; label = what the user actually sees.
      const label = catalogDisplayName(wallet.nombre)
      const value = normalizeNombre(label)
      if (!options.has(value)) options.set(value, label)
    }
    for (const name of entities.wallets) if (!options.has(name)) options.set(name, name)
    return Array.from(options, ([value, label]) => ({ value, label }))
  }, [wallets, entities.wallets])

  // Keep a resolution entry per referenced entity; preserve user edits, drop
  // entities that no longer appear in the workset.
  useEffect(() => {
    if (entitiesStatus !== 'ready') return
    setWalletRes((prev) => {
      const next: Record<string, WalletResolution> = {}
      for (const name of entities.wallets) {
        const match = walletMatches[name]
        const auto = match?.exact ?? match?.normalized ?? null
        const prior = prev[name]
        if (prior && prior.resolvedTo === auto) {
          next[name] = prior
        } else {
          next[name] = {
            resolvedTo: auto,
            newName: prior?.newName ?? name,
            currency: prior?.currency ?? defaultCurrency,
            approved: prior?.approved ?? auto !== null,
          }
        }
      }
      return next
    })
  }, [entitiesStatus, entities.wallets, walletMatches, defaultCurrency])

  useEffect(() => {
    if (entitiesStatus !== 'ready') return
    setAccountRes((prev) => {
      const next: Record<string, AccountResolution> = {}
      for (const account of entities.accounts) {
        const key = accountKey(account)
        const match = accountMatches[key]
        const auto = match?.exact ?? match?.normalized ?? null
        const prior = prev[key]
        if (prior && prior.resolvedTo === auto) {
          next[key] = prior
        } else {
          next[key] = {
            resolvedTo: auto,
            finalName: prior?.finalName ?? account.padre,
            subName: prior?.subName ?? (account.sub ?? ''),
            approved: prior?.approved ?? auto !== null,
          }
        }
      }
      return next
    })
  }, [entitiesStatus, entities.accounts, accountMatches])

  const rebuild = useCallback(
    (row: ReconcileRow, overrides: Partial<Record<CanonicalFieldId, string>>): ReconcileRow => {
      const { cells, effectiveMapping } = effectiveRow(row.raw, overrides, mapping)
      return {
        ...row,
        overrides,
        data: buildRow(cells, effectiveMapping, sep, tipoSource, prefs, fixedTipo),
      }
    },
    [mapping, sep, tipoSource, prefs, fixedTipo]
  )

  const editCell = (index: number, fieldId: CanonicalFieldId, value: string) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? rebuild(row, { ...row.overrides, [fieldId]: value }) : row))
    )
  }

  const editTipo = (index: number, value: 'income' | 'expense' | 'transfer') => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        let next = rebuild(row, { ...row.overrides, tipo: TIPO_WORD[value] })
        if (tipoSource === 'sign') {
          // Signo mode resolves the tipo from the amount; keep both in sync.
          const current = next.overrides.monto ?? rawAt(row.raw, mapping, 'monto')
          const parsed = parseMonto(current, prefs).valor
          const magnitude = parsed === null || parsed === 0 ? '' : String(Math.abs(parsed))
          const signed = value === 'expense' ? (magnitude === '' ? '' : `-${magnitude}`) : magnitude
          next = rebuild(next, { ...next.overrides, monto: signed })
        }
        return next
      })
    )
  }

  const discardRow = (index: number) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, discarded: true } : row)))
    setDiscardedCount((count) => count + 1)
  }

  const autoFor = (name: string): string | null => {
    const match = walletMatches[name]
    return match?.exact ?? match?.normalized ?? null
  }

  const walletsResolved = entities.wallets.every((name) => {
    if (autoFor(name) !== null) return true
    const resolution = walletRes[name]
    if (!resolution) return false
    if (resolution.resolvedTo !== null) return true
    return resolution.approved && resolution.newName.trim() !== ''
  })

  const accountsResolved = entities.accounts.every((account) => {
    const key = accountKey(account)
    // A rejected account is a choice, not a pending decision: it never blocks
    // the gate (its rows are simply excluded).
    if (accountRes[key]?.rejected) return true
    const match = accountMatches[key]
    const auto = match?.exact ?? match?.normalized ?? null
    if (auto !== null || accountRes[key]?.resolvedTo) return true
    const resolution = accountRes[key]
    if (!resolution) return false
    return resolution.approved && resolution.finalName.trim() !== ''
  })

  /** Whether this row uses an account the owner rejected (drives the inline
   * rejection tag shown in the table so the user can fix it). */
  const isRowRejected = (row: ReconcileRow): boolean => {
    const key = row.data.cuenta ? accountKey(row.data.cuenta) : null
    return key !== null && rejectedAccountKeys.has(key)
  }

  const statusCount = countStatuses(activeRows)
  const gateOpen = statusCount.clean && walletsResolved && accountsResolved

  /** Freshly rebuild the effective rows + entity resolutions at confirm time.
   * The page re-checks canExecute() on handoff.rows as the final hard gate.
   * Cross-currency transfers are out of scope for v1 (spec §5 amendment): the
   * file cannot carry a monto_destino, so ExecuteRow has no destination amount
   * and execute.ts always emits p_destination_amount: null. */
  const buildHandoff = (): ReconcileHandoff => {
    const rebuiltRows: ExecuteRow[] = []
    rows.forEach((row, index) => {
      if (row.discarded) return
      const { cells, effectiveMapping } = effectiveRow(row.raw, row.overrides, mapping)
      rebuiltRows.push({
        index,
        data: buildRow(cells, effectiveMapping, sep, tipoSource, prefs, fixedTipo),
      })
    })
    // Rows on a rejected account never reach execution: counted and dropped
    // here (defect 2) so the page/execute path only ever sees importable rows.
    const { rows: executeRows, excludedCount } = partitionExcludedRows(
      rebuiltRows,
      Array.from(rejectedAccountKeys)
    )

    const walletTargets: WalletTarget[] = entities.wallets.map((name) => {
      const auto = autoFor(name)
      const resolution = walletRes[name]
      const resolvedName = auto ?? resolution?.resolvedTo ?? null
      // resolvedName is a DISPLAY label now, so resolve it through the
      // normalized-display map, never by raw nombre equality.
      const existing = resolvedName
        ? existingWalletByNorm.get(normalizeNombre(resolvedName))
        : undefined
      return {
        name,
        existingId: existing ? existing.billetera_id : null,
        newName: resolution?.newName ?? name,
        currency: existing?.moneda ?? resolution?.currency ?? defaultCurrency,
      }
    })

    const accountTargets: AccountTarget[] = entities.accounts
      .filter((account) => accountRes[accountKey(account)]?.rejected !== true)
      .map((account) => {
        const key = accountKey(account)
        const match = accountMatches[key]
        const auto = match?.exact ?? match?.normalized ?? null
        const resolution = accountRes[key]
        const resolvedKey = resolution?.resolvedTo ?? auto
        const existing = resolvedKey
          ? existingAccounts.find((candidate) => candidate.key === resolvedKey)
          : undefined
        // Sub-only target: the whole pair did not match, but its parent may
        // already exist. Carry the parent id so executeImport never re-creates
        // it (defect 2). A matched leaf already owns both.
        const parentInfo = padreInfoFor(account.padre)
        return {
          key,
          existingId: existing ? existing.estructuraId : null,
          existingParentId: existing ? null : parentInfo.existingId,
          finalName: resolution?.finalName ?? account.padre,
          sub: account.sub,
          subName: resolution?.subName ?? (account.sub ?? ''),
          cupo: cupoForAccount(account),
        }
      })

    const fixes: RowFixCounts = {
      rows_fixed_total: 0,
      fixes_date: 0,
      fixes_tipo: 0,
      fixes_monto: 0,
      fixes_wallets: 0,
      fixes_cuenta: 0,
    }
    for (const row of rows) {
      if (row.discarded) continue
      const o = row.overrides
      if (Object.keys(o).length === 0) continue
      fixes.rows_fixed_total++
      if (o.fecha !== undefined) fixes.fixes_date++
      if (o.tipo !== undefined) fixes.fixes_tipo++
      if (o.monto !== undefined) fixes.fixes_monto++
      if (o.billetera_origen !== undefined || o.billetera_destino !== undefined) fixes.fixes_wallets++
      if (o.cuenta !== undefined) fixes.fixes_cuenta++
    }

    return {
      rows: executeRows,
      resolutions: { wallets: walletTargets, accounts: accountTargets },
      discarded: discardedCount,
      excludedCount,
      fixes,
    }
  }

  if (entitiesStatus === 'loading') {
    return <p className="config-ie-hint">{t('config_loading')}</p>
  }

  if (entitiesStatus === 'error') {
    return (
      <div className="config-ie-reconcile-error" role="alert">
        <p>{t('config_ie_reconcile_entities_error')}</p>
        <button type="button" className="config-ie-entity-btn" onClick={() => void loadEntities()}>
          {t('config_ie_reconcile_retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="config-ie-reconcile">
      <p className="config-ie-reconcile-summary">
        {t('config_ie_reconcile_summary', { ok: statusCount.ok, error: statusCount.error })}
        {discardedCount > 0 && (
          <span className="config-ie-reconcile-discarded">
            {t('config_ie_reconcile_discarded', { count: discardedCount })}
          </span>
        )}
      </p>

      <div className="config-ie-reconcile-table-wrap">
        <table className="config-ie-reconcile-table">
          <thead>
            <tr>
              <th scope="col">{t('config_ie_reconcile_col_status')}</th>
              <th scope="col">{t('config_ie_map_field_fecha')}</th>
              <th scope="col">{t('config_ie_map_field_tipo')}</th>
              <th scope="col">{t('config_ie_map_field_monto')}</th>
              <th scope="col">{t('config_ie_map_field_billetera_origen')}</th>
              <th scope="col">{t('config_ie_map_field_billetera_destino')}</th>
              <th scope="col">{t('config_ie_map_field_cuenta')}</th>
              <th scope="col">{t('config_ie_map_field_detalle')}</th>
              <th scope="col">{t('config_ie_reconcile_col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              if (row.discarded) return null
              // A rejected row surfaces the rejection tag so the user can fix
              // it inline, but it never blocks the gate (countStatuses ignores
              // cuenta_rechazada).
              const rowFieldErrors =
                isRowRejected(row) && !row.data.fieldErrors.includes(ROW_ERROR_KEYS.cuenta_rechazada)
                  ? [...row.data.fieldErrors, ROW_ERROR_KEYS.cuenta_rechazada]
                  : row.data.fieldErrors
              const hasError = rowFieldErrors.length > 0
              // Editors stay mounted while the row is focused, even after the
              // last error is fixed mid-keystroke (owner defect 1: focus loss).
              const isEditing = hasError || focusedRowIndex === index
              const rowClass = hasError ? 'config-ie-reconcile-tr--error' : undefined
              return (
                <tr key={index} className={rowClass}>
                  <td>
                    <span className="config-ie-status-cell">
                      <span
                        className={`config-ie-status-dot ${
                          hasError ? 'config-ie-status-dot--error' : 'config-ie-status-dot--ok'
                        }`}
                        aria-label={
                          hasError
                            ? t('config_ie_reconcile_status_error')
                            : t('config_ie_reconcile_status_ok')
                        }
                      >
                        {hasError ? '❌' : '✅'}
                      </span>
                      {hasError && (
                        <span className="config-ie-reconcile-errors">
                          {rowFieldErrors.map((key) => (
                            <span key={key}>{t(key)}</span>
                          ))}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="date"
                        className="config-ie-reconcile-input"
                        value={row.overrides.fecha ?? row.data.fechaISO ?? ''}
                        onChange={(e) => editCell(index, 'fecha', e.target.value)}
                        onFocus={() => setFocusedRowIndex(index)}
                        onBlur={() => setFocusedRowIndex(null)}
                        aria-label={t('config_ie_map_field_fecha')}
                      />
                    ) : (
                      row.data.fechaISO
                    )}
                  </td>
                  <td>
                    {tipoSource === 'fixed' ? (
                      t(TIPO_LABEL_KEY[fixedTipo])
                    ) : isEditing ? (
                      <select
                        className="config-ie-reconcile-select"
                        value={row.data.tipo ?? ''}
                        onChange={(e) => editTipo(index, e.target.value as 'income' | 'expense' | 'transfer')}
                        onFocus={() => setFocusedRowIndex(index)}
                        onBlur={() => setFocusedRowIndex(null)}
                        aria-label={t('config_ie_map_field_tipo')}
                      >
                        <option value="" disabled>
                          {t('config_ie_map_unassigned')}
                        </option>
                        <option value="income">{t('config_tipo_movimiento_ingreso')}</option>
                        <option value="expense">{t('config_tipo_movimiento_egreso')}</option>
                        <option value="transfer">{t('type_transfer')}</option>
                      </select>
                    ) : (
                      t(
                        row.data.tipo === 'income'
                          ? 'config_tipo_movimiento_ingreso'
                          : row.data.tipo === 'transfer'
                            ? 'type_transfer'
                            : 'config_tipo_movimiento_egreso'
                      )
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        className="config-ie-reconcile-input"
                        value={row.overrides.monto ?? rawAt(row.raw, mapping, 'monto')}
                        onChange={(e) => editCell(index, 'monto', e.target.value)}
                        onFocus={() => setFocusedRowIndex(index)}
                        onBlur={() => setFocusedRowIndex(null)}
                        aria-label={t('config_ie_map_field_monto')}
                      />
                    ) : (
                      row.data.monto
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <select
                        className="config-ie-reconcile-select"
                        value={row.data.wallets.origen}
                        onChange={(e) => editCell(index, 'billetera_origen', e.target.value)}
                        onFocus={() => setFocusedRowIndex(index)}
                        onBlur={() => setFocusedRowIndex(null)}
                        aria-label={t('config_ie_map_field_billetera_origen')}
                      >
                        <option value="">{t('config_ie_map_unassigned')}</option>
                        {walletOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.data.wallets.origen
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <select
                        className="config-ie-reconcile-select"
                        value={row.data.wallets.destino}
                        onChange={(e) => editCell(index, 'billetera_destino', e.target.value)}
                        onFocus={() => setFocusedRowIndex(index)}
                        onBlur={() => setFocusedRowIndex(null)}
                        aria-label={t('config_ie_map_field_billetera_destino')}
                      >
                        <option value="">{t('config_ie_map_unassigned')}</option>
                        {walletOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.data.wallets.destino || '—'
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        className="config-ie-reconcile-input"
                        value={row.overrides.cuenta ?? rawAt(row.raw, mapping, 'cuenta')}
                        onChange={(e) => editCell(index, 'cuenta', e.target.value)}
                        onFocus={() => setFocusedRowIndex(index)}
                        onBlur={() => setFocusedRowIndex(null)}
                        aria-label={t('config_ie_map_field_cuenta')}
                      />
                    ) : row.data.cuenta ? (
                      row.data.cuenta.sub
                        ? `${row.data.cuenta.padre} › ${row.data.cuenta.sub}`
                        : row.data.cuenta.padre
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        className="config-ie-reconcile-input"
                        value={row.overrides.detalle ?? row.data.detalle}
                        onChange={(e) => editCell(index, 'detalle', e.target.value)}
                        onFocus={() => setFocusedRowIndex(index)}
                        onBlur={() => setFocusedRowIndex(null)}
                        aria-label={t('config_ie_map_field_detalle')}
                      />
                    ) : (
                      row.data.detalle || '—'
                    )}
                  </td>
                  <td>
                    {hasError && (
                      <button
                        type="button"
                        className="config-ie-entity-btn"
                        onClick={() => discardRow(index)}
                      >
                        {t('config_ie_reconcile_discard')}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <section className="config-ie-entity-section">
        <h3 className="config-ie-entity-title">{t('config_ie_reconcile_wallets_title')}</h3>
        <p className="config-ie-hint">{t('config_ie_reconcile_wallets_hint')}</p>
        <div className="config-ie-entity-grid">
          {entities.wallets.map((name) => {
            const auto = autoFor(name)
            const resolution = walletRes[name]
            if (auto !== null || resolution?.resolvedTo) {
              return (
                <span key={name} className="config-ie-entity-chip">
                  {t('config_ie_reconcile_uses', { nombre: auto ?? resolution?.resolvedTo })}
                </span>
              )
            }
            const match = walletMatches[name]
            const collisionCandidates = existingWalletNames.filter(
              (candidate) => normalizeNombre(candidate) === name
            )
            return (
              <WalletEntityCard
                key={name}
                name={name}
                resolution={resolution}
                ambiguity={Boolean(match?.ambiguity)}
                collisionCandidates={collisionCandidates}
                currencyOptions={currencyOptions}
                defaultCurrency={defaultCurrency}
                onChange={(next) => setWalletRes((prev) => ({ ...prev, [name]: next }))}
              />
            )
          })}
          {entities.wallets.length === 0 && (
            <span className="config-ie-hint">{t('config_ie_reconcile_none')}</span>
          )}
        </div>
      </section>

      <section className="config-ie-entity-section">
        <h3 className="config-ie-entity-title">{t('config_ie_reconcile_accounts_title')}</h3>
        <p className="config-ie-hint">{t('config_ie_reconcile_accounts_hint')}</p>
        <div className="config-ie-entity-grid">
          {entities.accounts.map((account: CollectedAccount) => {
            const key = accountKey(account)
            const match = accountMatches[key]
            const auto = match?.exact ?? match?.normalized ?? null
            const resolution = accountRes[key]
            // A rejected account keeps its compact card even when it was
            // auto-matched: the user must be able to reincorporate it.
            if (resolution?.rejected !== true && (auto !== null || resolution?.resolvedTo)) {
              const resolvedKey = auto ?? resolution?.resolvedTo ?? key
              return (
                <span key={key} className="config-ie-entity-chip">
                  {t('config_ie_reconcile_uses', {
                    nombre: accountLabels[resolvedKey] ?? resolvedKey,
                  })}
                </span>
              )
            }
            const collisionCandidates = existingAccounts.filter((candidate) => candidate.key === key)
            const info = padreInfoFor(account.padre)
            return (
              <AccountEntityCard
                key={key}
                account={account}
                resolution={resolution}
                ambiguity={Boolean(match?.ambiguity)}
                collisionCandidates={collisionCandidates}
                padreIsNew={info.isNew}
                padreDisplayName={info.displayName}
                cupo={cupoForAccount(account)}
                onCupoChange={(next) => setPadreCupo((prev) => ({ ...prev, [info.norm]: next }))}
                onChange={(next) => setAccountRes((prev) => ({ ...prev, [key]: next }))}
              />
            )
          })}
          {entities.accounts.length === 0 && (
            <span className="config-ie-hint">{t('config_ie_reconcile_none')}</span>
          )}
        </div>
      </section>

      <div className="config-ie-actions">
        <button type="button" className="config-ie-btn-ghost" onClick={onBack}>
          {t('config_ie_btn_back')}
        </button>
        <button
          type="button"
          className="config-ie-btn-primary"
          disabled={!gateOpen}
          onClick={() => onContinue(buildHandoff())}
        >
          {t('config_ie_reconcile_continue')}
        </button>
      </div>
      {!gateOpen && <p className="config-ie-hint">{t('config_ie_reconcile_gate_hint')}</p>}
    </div>
  )
}

export default ReconcileStep
