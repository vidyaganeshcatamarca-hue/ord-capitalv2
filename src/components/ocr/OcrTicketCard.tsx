// src/components/ocr/OcrTicketCard.tsx
// ============================================
// OCR - One ticket in the quarantine, groupable and editable
// ============================================
//
// Normative source: definitive PRD §2-§17, §37, §54-§59, §64-§65, §83-§89.
//
// A single quarantine row expands into: ticket header -> collapsible
// CATEGORY groups -> collapsible PRODUCTS (§5). Groups are DERIVED from the
// items' current category (§54), never a second editable source, and the
// subtotal of every group is recomputed on each edit (§5).
//
// The immutable field is the product description read by OCR (§15): the user
// expresses interpretation through the category, never by rewriting evidence.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@/locales/i18n'
import { useToast } from '@/contexts/ToastContext'
import { parseError } from '@/locales/i18n'
import { formatCurrency, formatDate } from '@/lib/format'
import { parseMontoInput } from '@/lib/parseMonto'
import { NUMERIC_INPUT_ENTER_PROPS } from '@/lib/numericKeyboard'
import { useNumberFormat } from '@/hooks/useNumberFormat'
import { WalletDropdownSelect } from '@/components/WalletDropdownSelect'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { CategoriaPicker, type CategoriaGrupo } from '@/components/CategoriaPicker/CategoriaPicker'
import type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'
import {
  computeTicketGroups,
  confirmableGroups,
  groupingBlocker,
  type OcrCategoryGroup,
} from '@/ocr/grouping'
import {
  collectCategoryCorrections,
  effectiveSavedCategory,
  isNonLearnableCategory,
  queueCorrections,
} from '@/ocr/memory'
import { confirmOcrQuarantine, rejectOcrQuarantine, saveOcrQuarantine } from '@/ocr/quarantine'
import { patchOcrHistory } from '@/ocr/history'
import { toQuarantineTicketPayload } from '@/ocr/quarantine'
import { OCR_EVENTS, trackOcrError, trackOcrEvent } from '@/ocr/telemetry'
import { readOcrQuarantineLatencyMs } from '@/ocr/storage'
import type { OcrIssue, OcrItem, OcrPayment, OcrTicket } from '@/ocr/types'
import { OCR_SCHEMA_VERSION } from '@/ocr/normalize'
import { useOcrCatalog } from '@/ocr/useOcrCatalog'
import { useOcrJobsContext } from '@/ocr/OcrJobsProvider'
import { OcrTicketEditModal } from './OcrTicketEditModal'
import { OcrTicketImageModal } from './OcrTicketImageModal'
import './Ocr.css'

interface OcrMetadata {
  ocr_job_id?: string
  ocr_schema_version?: number
  merchant?: string | null
  purchase_date?: string | null
  currency?: string | null
  total?: number | string
  general_discount?: number | string
  issues?: OcrIssue[]
  items?: OcrItem[]
  payment?: OcrPayment
}

interface OcrTicketCardProps {
  item: CuarentenaItem
  onChanged: () => void
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function metadataOf(item: CuarentenaItem): OcrMetadata {
  return (item.metadata ?? {}) as OcrMetadata
}

/** Normalizes an item coming from JSON so the editor never sees undefined. */
function normalizeItem(raw: OcrItem, position: number): OcrItem {
  return {
    item_index: typeof raw.item_index === 'number' ? raw.item_index : position,
    description: typeof raw.description === 'string' ? raw.description : '',
    quantity: raw.quantity ?? null,
    unit_price: raw.unit_price ?? null,
    printed_amount: raw.printed_amount ?? null,
    discounts: Array.isArray(raw.discounts) ? raw.discounts : [],
    net_amount: num(raw.net_amount),
    original_category_id: raw.original_category_id ?? null,
    current_category_id: raw.current_category_id ?? null,
    saved_category_id:
      raw.saved_category_id !== undefined ? raw.saved_category_id : raw.original_category_id ?? null,
    issues: Array.isArray(raw.issues) ? raw.issues : [],
  }
}

export function OcrTicketCard({ item, onChanged }: OcrTicketCardProps) {
  const { showToast } = useToast()
  const { syncMemory } = useOcrJobsContext()
  const { groups: categoryGroups, resolve, wallets, cards, loading: catalogLoading } = useOcrCatalog()

  const metadata = metadataOf(item)
  const jobId = typeof metadata.ocr_job_id === 'string' ? metadata.ocr_job_id : ''

  const [editing, setEditing] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [items, setItems] = useState<OcrItem[]>(() =>
    (metadata.items ?? []).map((raw, index) => normalizeItem(raw, index))
  )
  const [payment, setPayment] = useState<OcrPayment>(() => {
    const fromMetadata = metadata.payment ?? null
    if (item.tipo === 'card_expense' && item.tarjeta_id) {
      return {
        type: 'card',
        card_id: item.tarjeta_id,
        wallet_id: null,
        installments: item.cuotas ?? fromMetadata?.installments ?? 1,
        // The purchase currency the user chose lives in metadata; item.moneda is the
        // currency of the charge (the card's), so reading it first switched USD off.
        currency: fromMetadata?.currency ?? item.moneda ?? null,
      }
    }
    return {
      type: item.billetera_id ? 'wallet' : fromMetadata?.type ?? null,
      card_id: item.tarjeta_id ?? fromMetadata?.card_id ?? null,
      wallet_id: item.billetera_id ?? fromMetadata?.wallet_id ?? null,
      installments: item.cuotas ?? fromMetadata?.installments ?? 1,
      currency: fromMetadata?.currency ?? item.moneda ?? null,
    }
  })
  const [date, setDate] = useState<string>(item.fecha ?? metadata.purchase_date ?? '')
  const [merchant, setMerchant] = useState<string>(item.detalle ?? metadata.merchant ?? '')
  const [totalInput, setTotalInput] = useState<string>(String(num(metadata.total, num(item.monto))))
  // Installments are edited as text on purpose: a numeric state coerced the
  // empty string to 1 and turned "1" + "2" into 12.
  const [installmentsInput, setInstallmentsInput] = useState<string>(
    String(payment.installments ?? 1)
  )
  // Local currency of the user: the card expense can be charged in it or in USD.
  const { localCurrency } = useNumberFormat()
  const localCurrencyCode = (localCurrency ?? 'ARS').toUpperCase()

  // Snapshot of the values as loaded: "Cancelar" in edit mode must return the
  // card to exactly what the backend sent, not to whatever was typed.
  const initialValuesRef = useRef({ items, payment, date, merchant, totalInput, installmentsInput })
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [showImages, setShowImages] = useState(false)
  const [memoryPending, setMemoryPending] = useState(false)

  useEffect(() => {
    // The tray re-fetches after a save; keep the draft in sync with the row.
    setItems((metadata.items ?? []).map((raw, index) => normalizeItem(raw, index)))
    setTotalInput(String(num(metadata.total, num(item.monto))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.pendiente_id, item.monto])

  const currency = (payment.currency ?? metadata.currency ?? item.moneda ?? undefined) || undefined
  const ticketTotal = parseMontoInput(totalInput)
  const generalDiscount = num(metadata.general_discount)

  const grouping = useMemo(
    () =>
      computeTicketGroups({
        items: items.map((entry) => ({
          item_index: entry.item_index,
          net_amount: entry.net_amount,
          category_key: entry.current_category_id,
        })),
        general_discount: generalDiscount,
        ticket_total: Number.isFinite(ticketTotal) ? ticketTotal : null,
      }),
    [items, generalDiscount, ticketTotal]
  )

  const itemsByIndex = useMemo(() => {
    const map = new Map<number, OcrItem>()
    for (const entry of items) map.set(entry.item_index, entry)
    return map
  }, [items])

  const issues = useMemo(() => {
    const declared = Array.isArray(metadata.issues) ? metadata.issues : []
    const pendingCategory = items.filter((entry) => isNonLearnableCategory(entry.current_category_id)).length
    const list = declared.map((issue) => issue.code)
    if (pendingCategory > 0) list.push('ocr.issue_category_pending')
    if (!payment.card_id && !payment.wallet_id) list.push('ocr.issue_payment_pending')
    if (!date) list.push('ocr.issue_date_pending')
    if (grouping.material_mismatch) list.push('ocr.issue_amount_pending')
    return [...new Set(list)]
  }, [metadata.issues, items, payment, date, grouping.material_mismatch])

  const blocker = useMemo(() => {
    if (!Number.isFinite(ticketTotal) || ticketTotal <= 0) return 'ocr.missing_total'
    if (payment.type === 'card' && !payment.card_id) return 'ocr.missing_payment'
    if (payment.type !== 'card' && !payment.wallet_id) return 'ocr.missing_payment'
    if (!date) return 'ocr.missing_date'
    return groupingBlocker(grouping)
  }, [ticketTotal, payment, date, grouping])

  // The mismatch note is already rendered further down; the blocker must not repeat it.
  const duplicateBlockerKey = grouping.material_mismatch ? 'ocr.material_mismatch' : null

  const groupLabel = useCallback(
    (group: OcrCategoryGroup): { name: string; parent_name: string | null } => {
      if (group.unrecognized) return { name: t('ocr_unrecognized'), parent_name: null }
      const resolved = resolve(group.category_key)
      return resolved ?? { name: group.category_key, parent_name: null }
    },
    [resolve]
  )

  const toggleGroup = (key: string): void => {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Leaving edit mode discards unsaved typing: the card returns to the values
  // the backend sent, which is what "Cancelar" promises.
  const cancelEdit = (): void => {
    const initial = initialValuesRef.current
    setItems(initial.items)
    setPayment(initial.payment)
    setDate(initial.date)
    setMerchant(initial.merchant)
    setTotalInput(initial.totalInput)
    setInstallmentsInput(initial.installmentsInput)
    setOpenGroups(new Set())
    setEditing(false)
  }

  // Opening the editor is the same action Voice calls "Editar": a full modal,
  // not an inline expansion.
  const openEditor = (): void => {
    trackOcrEvent(OCR_EVENTS.quarantineOpened, {
      job_id: jobId || undefined,
      item_count: items.length,
      issue_count: issues.length,
      // Backend receipt -> quarantine row. Excludes the upload and the time
      // the user took to open the card, which are not backend latency.
      quarantine_age_ms: readOcrQuarantineLatencyMs(jobId) ?? undefined,
    })
    setEditing(true)
  }

  const updateItem = (itemIndex: number, patch: Partial<OcrItem>): void => {
    setItems((current) =>
      current.map((entry) => (entry.item_index === itemIndex ? { ...entry, ...patch } : entry))
    )
  }

  /** Builds the ticket payload the RPC persists. */
  const buildTicket = useCallback((): OcrTicket => {
    return {
      ocr_schema_version: metadata.ocr_schema_version ?? OCR_SCHEMA_VERSION,
      ocr_job_id: jobId,
      merchant: merchant || null,
      purchase_date: date || null,
      currency: currency ? currency.toUpperCase() : null,
      total: Number.isFinite(ticketTotal) ? ticketTotal : 0,
      general_discount: generalDiscount,
      items,
      issues: Array.isArray(metadata.issues) ? metadata.issues : [],
      payment: {
        ...payment,
        // The typed value wins; an empty field means one installment.
        installments: Math.max(1, Number(installmentsInput) || 1),
        currency: currency ? currency.toUpperCase() : null,
      },
    }
  }, [metadata.ocr_schema_version, metadata.issues, jobId, merchant, date, currency, ticketTotal, generalDiscount, items, payment, installmentsInput])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const ticket = buildTicket()
      await saveOcrQuarantine(item.pendiente_id, ticket)

      // PRD §19-§24: only explicit changes are corrections, and a memory failure
      // never rolls back the draft.
      const corrections = collectCategoryCorrections(items, resolve)
      if (corrections.length > 0 && jobId) {
        queueCorrections(jobId, corrections)
        void syncMemory(jobId)
        setMemoryPending(true)
      }

      // The saved baseline moves with the draft, so saving twice without changes
      // is not a second correction (PRD §110.10).
      setItems((current) =>
        current.map((entry) => ({ ...entry, saved_category_id: entry.current_category_id }))
      )

      trackOcrEvent(OCR_EVENTS.quarantineSaved, {
        job_id: jobId || undefined,
        item_count: items.length,
        issue_count: issues.length,
        changed_item_count: corrections.length,
        duplicate: undefined,
      })
      showToast(t('ocr.saved'), 'success')
      // Saving is what closes the editor: the owner sees the updated card again.
      setEditing(false)
      onChanged()
    } catch (error) {
      trackOcrError('quarantine_save', 'SAVE_FAILED', { job_id: jobId || undefined })
      showToast(parseError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async (): Promise<void> => {
    setConfirming(true)
    try {
      // Persist the current draft first so the confirmed data is the reviewed
      // data, then create the grouped movements atomically.
      await saveOcrQuarantine(item.pendiente_id, buildTicket())
      const rows = await confirmOcrQuarantine(item.pendiente_id)
      const groupsCreated = rows.length || confirmableGroups(grouping).length
      trackOcrEvent(OCR_EVENTS.ticketConfirmed, {
        job_id: jobId || undefined,
        item_count: items.length,
        group_count: groupsCreated,
        status: 'completed',
      })
      showToast(t('ocr.confirmed', { count: String(groupsCreated) }), 'success')
      // The local history keeps the outcome after the job itself is gone.
      if (jobId) patchOcrHistory(jobId, { status: 'approved' })
      onChanged()
    } catch (error) {
      trackOcrError('confirmation', 'CONFIRM_FAILED', { job_id: jobId || undefined })
      showToast(parseError(error), 'error')
    } finally {
      setConfirming(false)
    }
  }

  const handleReject = async (): Promise<void> => {
    setShowReject(false)
    try {
      await rejectOcrQuarantine(item.pendiente_id)
      trackOcrEvent(OCR_EVENTS.ticketRejected, {
        job_id: jobId || undefined,
        item_count: items.length,
      })
      showToast(t('ocr.rejected'), 'success')
      if (jobId) patchOcrHistory(jobId, { status: 'rejected' })
      onChanged()
    } catch (error) {
      showToast(parseError(error), 'error')
    }
  }

  const displayMerchant = merchant || t('ocr.ticket_merchant_unknown')

  return (
    <div
      className="ocr-ticket"
      onClick={openEditor}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openEditor()
        }
      }}
    >
      <div className="ocr-ticket-header">
        <div className="ocr-ticket-title">
          <strong>📷 {displayMerchant}</strong>
          <span>
            {date ? formatDate(date) : t('ocr.issue_date_pending')} ·{' '}
            {t('ocr.ticket_items', { count: String(items.length) })}
          </span>
        </div>
        <div className="ocr-ticket-total">
          <span>{t('ocr.ticket_total')}</span>
          <strong>{formatCurrency(Number.isFinite(ticketTotal) ? ticketTotal : 0, currency)}</strong>
        </div>
      </div>

      {/*
        The backend flags what IT could not read. Once every essential field is
        filled the flag describes a past state, so keeping it on screen tells the
        owner to review work already done. With a blocker it stays.
      */}
      {issues.length > 0 && blocker !== null && (
        <div className="ocr-issues" aria-label={t('ocr.issue_title')}>
          {issues.map((issue) => (
            <span className="ocr-issue-chip" key={issue}>
              {issue.startsWith('ocr.') ? t(issue) : t('ocr.issue_generic')}
            </span>
          ))}
        </div>
      )}

      <div className="ocr-card-links">
        <button
          type="button"
          className="ocr-chip-btn"
          onClick={(event) => {
            event.stopPropagation()
            openEditor()
          }}
        >
          {t('ocr.quarantine_title')}
        </button>
        {jobId && (
          <button
            type="button"
            className="ocr-chip-btn"
            onClick={(event) => {
              event.stopPropagation()
              setShowImages(true)
            }}
          >
            {t('ocr.view_ticket')}
          </button>
        )}
      </div>

      {editing && (
        <OcrTicketEditModal
          onClose={cancelEdit}
          onSave={() => void handleSave()}
          saving={saving}
          saveDisabled={blocker !== null}
        >
          <div className="ocr-field-grid">
            <div className={`ocr-field ${date ? '' : 'ocr-field--invalid'}`}>
              <label htmlFor={`ocr-date-${item.pendiente_id}`}>{t('ocr.field_date')}</label>
              <input
                id={`ocr-date-${item.pendiente_id}`}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="ocr-field">
              <label htmlFor={`ocr-merchant-${item.pendiente_id}`}>{t('ocr.field_merchant')}</label>
              <input
                id={`ocr-merchant-${item.pendiente_id}`}
                type="text"
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
              />
            </div>
            <div className="ocr-field" id={`ocr-payment-${item.pendiente_id}`}>
              {/* Same picker as the manual movement form: the label is the title,
                  so the placeholder is never offered as a choice. */}
              <label htmlFor={`ocr-payment-${item.pendiente_id}`}>{t('ocr.field_payment')}</label>
              <WalletDropdownSelect
                wallets={wallets}
                selectedWalletId={payment.type === 'wallet' ? payment.wallet_id : null}
                onSelectWallet={(id) =>
                  setPayment((current) => ({
                    ...current,
                    type: 'wallet',
                    wallet_id: id,
                    card_id: null,
                  }))
                }
                tarjetas={cards}
                selectedTarjetaId={payment.type === 'card' ? payment.card_id : null}
                onSelectTarjeta={(id) =>
                  setPayment((current) => ({
                    ...current,
                    type: 'card',
                    card_id: id,
                    wallet_id: null,
                    installments: current.installments ?? 1,
                  }))
                }
                placeholder={t('ocr.missing_payment')}
              />
            </div>
            {payment.type === 'card' && (
              <div className="ocr-field">
                <label htmlFor={`ocr-installments-${item.pendiente_id}`}>{t('ocr.field_installments')}</label>
                <input
                  id={`ocr-installments-${item.pendiente_id}`}
                  type="number"
                  min={1}
                  value={installmentsInput}
                  {...NUMERIC_INPUT_ENTER_PROPS}
                  // The first tap clears the suggested value so typing replaces it. Using
                  // select() only highlighted it, which on Android pops the copy/paste menu.
                  onFocus={() => setInstallmentsInput('')}
                  onBlur={() =>
                    setInstallmentsInput((current) =>
                      current === '' ? String(payment.installments ?? 1) : current,
                    )
                  }
                  onChange={(event) => {
                    // Digits only, and an empty field is allowed while typing:
                    // coercing it to 1 was what made the old input uneditable.
                    const digits = event.target.value.replace(/[^0-9]/g, '')
                    setInstallmentsInput(digits)
                    const parsed = Number(digits)
                    setPayment((current) => ({
                      ...current,
                      installments: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                    }))
                  }}
                />
              </div>
            )}
            {payment.type === 'card' && (
              <div className="ocr-toggle-row">
                <span>{t('card_usd_purchase')}</span>
                <label className="ocr-switch">
                  <input
                    type="checkbox"
                    checked={(payment.currency ?? localCurrencyCode).toUpperCase() === 'USD'}
                    onChange={(event) =>
                      setPayment((current) => ({
                        ...current,
                        // Off is the local currency, on is dollars. Same switch as
                        // the manual movement form.
                        currency: event.target.checked ? 'USD' : localCurrencyCode,
                      }))
                    }
                  />
                  <span className="ocr-switch-track" />
                </label>
              </div>
            )}
            <div className="ocr-field">
              <label htmlFor={`ocr-total-${item.pendiente_id}`}>{t('ocr.total_required')}</label>
              <input
                id={`ocr-total-${item.pendiente_id}`}
                type="text"
                inputMode="decimal"
                value={totalInput}
                onChange={(event) => setTotalInput(event.target.value)}
              />
            </div>
          </div>

          <div className="ocr-groups">
            {grouping.groups.length === 0 && <p className="ocr-note">{t('ocr.no_items')}</p>}
            {grouping.groups.map((group) => {
              const label = groupLabel(group)
              const isOpen = openGroups.has(group.category_key)
              return (
                <div
                  className={`ocr-group ${group.unrecognized ? 'ocr-group--unrecognized' : ''}`}
                  key={group.category_key}
                >
                  <button type="button" className="ocr-group-head" onClick={() => toggleGroup(group.category_key)}>
                    <span aria-hidden="true">{isOpen ? '▼' : '▶'}</span>
                    <span className="ocr-group-name">
                      {label.name}
                      {label.parent_name && <small>{label.parent_name}</small>}
                      {group.unrecognized && <small>{t('ocr.group_unrecognized_hint')}</small>}
                    </span>
                    <span className="ocr-group-subtotal">
                      {formatCurrency(group.total, currency)}
                      {group.general_discount_cents !== 0 && (
                        <span className="ocr-group-discount">
                          {' '}
                          −{formatCurrency(group.general_discount, currency)}
                        </span>
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="ocr-items">
                      {group.item_indexes.map((itemIndex) => {
                        const entry = itemsByIndex.get(itemIndex)
                        if (!entry) return null
                        return (
                          <OcrItemRow
                            key={itemIndex}
                            entry={entry}
                            currency={currency}
                            categoryGroups={categoryGroups}
                            catalogLoading={catalogLoading}
                            resolve={resolve}
                            onChange={(patch) => updateItem(itemIndex, patch)}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div
            className={`ocr-balance ${
              grouping.material_mismatch
                ? 'ocr-balance--error'
                : grouping.sum_cents === grouping.ticket_total_cents
                  ? 'ocr-balance--ok'
                  : 'ocr-balance--warn'
            }`}
          >
            <span>
              {t('ocr.movements_summary', { count: String(confirmableGroups(grouping).length) })} ·{' '}
              {formatCurrency(grouping.sum_cents / 100, currency)}
            </span>
            <strong>{formatCurrency(grouping.ticket_total_cents / 100, currency)}</strong>
          </div>

          {grouping.material_mismatch && <p className="ocr-note ocr-note--warn">{t('ocr.material_mismatch')}</p>}
          {grouping.rounding_adjustment_cents !== 0 && (
            <p className="ocr-note">
              {t('ocr.rounding_adjusted', {
                amount: formatCurrency(Math.abs(grouping.rounding_adjustment_cents) / 100, currency),
              })}
            </p>
          )}
          {memoryPending && <p className="ocr-note">{t('ocr.memory_pending_note')}</p>}
          {blocker && blocker !== duplicateBlockerKey && (
            <p className="ocr-note ocr-note--warn">{t(blocker)}</p>
          )}
        </OcrTicketEditModal>
      )}

      <div className="ocr-ticket-actions">
        <button
          type="button"
          className="saneamiento-btn-rechazar"
          onClick={(event) => {
            event.stopPropagation()
            setShowReject(true)
          }}
        >
          {t('ocr.reject_ticket')}
        </button>
        <button
          type="button"
          className="saneamiento-btn-aprobar"
          onClick={(event) => {
            event.stopPropagation()
            void handleConfirm()
          }}
          disabled={confirming || blocker !== null}
          title={blocker ? t(blocker) : undefined}
        >
          {t('ocr.confirm_ticket')}
        </button>
      </div>

      {showImages && jobId && (
        <OcrTicketImageModal jobId={jobId} onClose={() => setShowImages(false)} />
      )}

      <ConfirmModal
        isOpen={showReject}
        title={t('ocr.reject_title')}
        message={t('ocr.reject_message')}
        confirmText={t('ocr.reject_ticket')}
        cancelText={t('ocr.capture_cancel')}
        type="danger"
        onConfirm={() => void handleReject()}
        onCancel={() => setShowReject(false)}
      />
    </div>
  )
}

interface OcrItemRowProps {
  entry: OcrItem
  currency: string | undefined
  categoryGroups: CategoriaGrupo[]
  catalogLoading: boolean
  resolve: (id: string) => { name: string; parent_name: string | null } | null
  onChange: (patch: Partial<OcrItem>) => void
}

/**
 * One product. The description is printed as read-only evidence (PRD §15); only
 * the category and the final amount are editable, and quantity/unit price stay
 * visible as auxiliary data (PRD §14, §16).
 */
function OcrItemRow({ entry, currency, categoryGroups, catalogLoading, resolve, onChange }: OcrItemRowProps) {
  const [amountInput, setAmountInput] = useState<string>(String(entry.net_amount))

  useEffect(() => {
    setAmountInput(String(entry.net_amount))
  }, [entry.net_amount])

  const categoryName = entry.current_category_id ? resolve(entry.current_category_id) : null
  const saved = effectiveSavedCategory(entry)

  return (
    <div className="ocr-item">
      <div className="ocr-item-top">
        <span className="ocr-item-description">{entry.description || t('ocr.item_original_description')}</span>
        <span className="ocr-item-amount">{formatCurrency(entry.net_amount, currency)}</span>
      </div>

      <div className="ocr-item-aux">
        {entry.quantity !== null && (
          <span>
            {t('ocr.item_quantity')}: {entry.quantity}
          </span>
        )}
        {entry.unit_price !== null && (
          <span>
            {t('ocr.item_unit_price')}: {formatCurrency(entry.unit_price, currency)}
          </span>
        )}
        {entry.printed_amount !== null && (
          <span>
            {t('ocr.item_printed_amount')}: {formatCurrency(entry.printed_amount, currency)}
          </span>
        )}
        {entry.discounts.map((discount, index) => (
          <span key={`${entry.item_index}-discount-${index}`}>
            {t('ocr.item_discount')}: −{formatCurrency(discount.amount, currency)}
          </span>
        ))}
        {categoryName === null && entry.current_category_id && (
          <span className="ocr-note--warn">{t('ocr.missing_category')}</span>
        )}
        {saved && saved !== entry.current_category_id && (
          <span className="ocr-item-locked">{t('ocr.item_category_changed')}</span>
        )}
      </div>

      <div className="ocr-item-controls">
        <div className="ocr-field">
          <label>{t('ocr.item_category')}</label>
          <CategoriaPicker
            categorias={categoryGroups}
            value={entry.current_category_id}
            onChange={(id) => onChange({ current_category_id: id || null })}
            placeholder={t('ocr.item_category_pending')}
            loading={catalogLoading}
          />
        </div>
        <div className="ocr-field">
          <label htmlFor={`ocr-net-${entry.item_index}`}>{t('ocr.item_net_amount')}</label>
          <input
            id={`ocr-net-${entry.item_index}`}
            type="text"
            inputMode="decimal"
            value={amountInput}
            {...NUMERIC_INPUT_ENTER_PROPS}
            onChange={(event) => setAmountInput(event.target.value)}
            onBlur={() => {
              const parsed = parseMontoInput(amountInput)
              if (Number.isFinite(parsed)) onChange({ net_amount: Math.round(parsed * 100) / 100 })
              else setAmountInput(String(entry.net_amount))
            }}
          />
        </div>
      </div>
    </div>
  )
}
