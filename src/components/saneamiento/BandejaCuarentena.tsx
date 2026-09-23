import { useCallback, useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency, formatDate } from '@/lib/format'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { EditarCuarentenaModal } from './EditarCuarentenaModal'
import type { EditarCuarentenaPayload } from './EditarCuarentenaModal'
import { RechazarCuarentenaModal } from './RechazarCuarentenaModal'
import { ImageModal } from './ImageModal'
import type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'
import './BandejaCuarentena.css'

type FiltroOrigen = 'todos' | 'api_banco' | 'ocr' | 'recurrente' | 'voz'

export type CuarentenaMovementType = 'expense' | 'income' | 'transfer' | 'card_expense'

/** Candidate entity returned when a spoken name matched more than one record. */
export interface AmbiguousCandidate {
  id: string
  name: string
  parent_name: string | null
}

interface AmbiguousMatches {
  expense_category?: AmbiguousCandidate[]
  source_wallet?: AmbiguousCandidate[]
  destination_wallet?: AmbiguousCandidate[]
  card?: AmbiguousCandidate[]
  income_source?: AmbiguousCandidate[]
}

interface LoteResultRow {
  pendiente_id: number
  p_caja_id: number | null
  ok: boolean
  error_key: string | null
}

// ── Row helpers (exported so CuarentenaPage shares one source of truth) ─────

/**
 * Voice rows are the only quarantine rows carrying a non-null `metadata.job_id`.
 * `origen` is not a valid discriminator: voice inserts use `origen = 'api_banco'`
 * like imported bank statements.
 */
export function isVoiceItem(item: CuarentenaItem): boolean {
  return !!item.metadata && item.metadata.job_id != null
}

/** Movement type of a row, defaulting legacy rows without `tipo` to expense. */
export function resolveMovementType(item: CuarentenaItem): CuarentenaMovementType {
  if (item.tipo === 'income' || item.tipo === 'transfer' || item.tipo === 'card_expense') {
    return item.tipo
  }
  return 'expense'
}

/** Display currency for a row: card rows carry `moneda`, wallet rows carry it on the wallet. */
export function itemCurrency(item: CuarentenaItem): string {
  return item.moneda || item.billetera_moneda || item.billetera_destino_moneda || 'ARS'
}

/** True when a transfer moves money between wallets of different currencies. */
export function isCrossCurrencyTransfer(item: CuarentenaItem): boolean {
  return (
    !!item.billetera_moneda &&
    !!item.billetera_destino_moneda &&
    item.billetera_moneda !== item.billetera_destino_moneda
  )
}

/**
 * i18n keys of the required fields still missing for this row's type.
 * An empty list means the row is approvable. The list mirrors, and where the
 * product requires it extends, the validation inside `fn_aprobar_cuarentena_v2`.
 */
export function missingRequiredFields(item: CuarentenaItem): string[] {
  const tipo = resolveMovementType(item)
  const missing: string[] = []

  if (item.monto == null || Number(item.monto) <= 0) missing.push('saneamiento_monto')

  if (tipo === 'expense') {
    if (!item.estructura_egreso_id) missing.push('saneamiento_categoria')
    if (!item.billetera_id) missing.push('saneamiento_billetera')
  } else if (tipo === 'income') {
    if (!item.billetera_destino_id) missing.push('cuarentena_campo_billetera_destino')
    if (!item.cuenta_ingreso_id) missing.push('cuarentena_campo_cuenta_ingreso')
  } else if (tipo === 'transfer') {
    if (!item.billetera_id) missing.push('saneamiento_billetera')
    if (!item.billetera_destino_id) missing.push('cuarentena_campo_billetera_destino')
    if (isCrossCurrencyTransfer(item) && (!item.destination_amount || Number(item.destination_amount) <= 0)) {
      missing.push('cuarentena_campo_destination_amount')
    }
  } else {
    if (!item.tarjeta_id) missing.push('cuarentena_campo_tarjeta')
    if (!item.estructura_egreso_id) missing.push('saneamiento_categoria')
  }

  return missing
}

/** A row can only be approved (individually or in a batch) when nothing is missing. */
export function isApprovable(item: CuarentenaItem): boolean {
  return missingRequiredFields(item).length === 0
}

/** Ambiguous candidates persisted with the row, when the backend provides them. */
function ambiguousCandidates(item: CuarentenaItem, entity: keyof AmbiguousMatches): AmbiguousCandidate[] {
  const matches = item.metadata?.ambiguous_matches as AmbiguousMatches | undefined
  const list = matches?.[entity]
  return Array.isArray(list) ? list : []
}

const AMBIGUOUS_FIELDS = [
  {
    entity: 'expense_category',
    param: 'p_estructura_egreso_id',
    labelKey: 'cuarentena_ambig_categoria',
    isMissing: (item: CuarentenaItem) => !item.estructura_egreso_id,
  },
  {
    entity: 'source_wallet',
    param: 'p_billetera_id',
    labelKey: 'cuarentena_ambig_billetera_origen',
    isMissing: (item: CuarentenaItem) => !item.billetera_id,
  },
  {
    entity: 'destination_wallet',
    param: 'p_billetera_destino_id',
    labelKey: 'cuarentena_ambig_billetera_destino',
    isMissing: (item: CuarentenaItem) => !item.billetera_destino_id,
  },
  {
    entity: 'card',
    param: 'p_tarjeta_id',
    labelKey: 'cuarentena_ambig_tarjeta',
    isMissing: (item: CuarentenaItem) => !item.tarjeta_id,
  },
  {
    entity: 'income_source',
    param: 'p_cuenta_ingreso_id',
    labelKey: 'cuarentena_ambig_fuente_ingreso',
    isMissing: (item: CuarentenaItem) => !item.cuenta_ingreso_id,
  },
] as const

const MOVEMENT_TYPE_ICON: Record<CuarentenaMovementType, string> = {
  expense: 'ShoppingCart',
  income: 'TrendingUp',
  transfer: 'ArrowRightLeft',
  card_expense: 'WalletCards',
}

interface BandejaCuarentenaProps {
  onVolver: () => void
  onChange: () => void
}

export function BandejaCuarentena({ onVolver, onChange }: BandejaCuarentenaProps) {
  const { showToast } = useToast()

  const [filtro, setFiltro] = useState<FiltroOrigen>('todos')
  const [items, setItems] = useState<CuarentenaItem[]>([])
  const [loading, setLoading] = useState(true)

  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())

  const [itemEditar, setItemEditar] = useState<CuarentenaItem | null>(null)
  const [itemRechazar, setItemRechazar] = useState<CuarentenaItem | null>(null)
  const [imagenUrl, setImagenUrl] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [showConfirmLote, setShowConfirmLote] = useState(false)
  const [showConfirmTodos, setShowConfirmTodos] = useState(false)
  const [persistingId, setPersistingId] = useState<number | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      // New contract: no params. Origin filtering happens client-side below.
      const res = await rpc<CuarentenaItem[]>('fn_reporte_cuarentena_pendientes')
      setItems(res || [])
      setSeleccionados(new Set())
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Changing the filter changes what is visible: a selection made under the
  // previous filter must not leak into the next batch.
  useEffect(() => {
    setSeleccionados(new Set())
  }, [filtro])

  const conteos = useMemo(
    () => ({
      todos: items.length,
      api_banco: items.filter((i) => i.origen === 'api_banco').length,
      ocr: items.filter((i) => i.origen === 'ocr').length,
      recurrente: items.filter((i) => i.origen === 'recurrente').length,
      voz: items.filter(isVoiceItem).length,
    }),
    [items]
  )

  const visibles = useMemo(() => {
    if (filtro === 'todos') return items
    if (filtro === 'voz') return items.filter(isVoiceItem)
    return items.filter((i) => i.origen === filtro)
  }, [items, filtro])

  const approvableItems = useMemo(() => visibles.filter(isApprovable), [visibles])
  const excludedCount = visibles.length - approvableItems.length
  const selectedApprovable = useMemo(
    () => approvableItems.filter((i) => seleccionados.has(i.pendiente_id)),
    [approvableItems, seleccionados]
  )

  const toggleSeleccion = (id: number) => {
    const next = new Set(seleccionados)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSeleccionados(next)
  }

  const handleAprobarItem = async (item: CuarentenaItem) => {
    if (!isApprovable(item)) return
    try {
      await rpc('fn_aprobar_cuarentena_v2', { p_pendiente_id: item.pendiente_id })
      showToast(t('saneamiento_toast_aprobado'), 'success')
      onChange()
      fetchItems()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleRechazarItem = async (_motivo: string, _nota: string) => {
    if (!itemRechazar) return
    try {
      await rpc('fn_rechazar_cuarentena', { p_pendiente_id: itemRechazar.pendiente_id })
      showToast(t('saneamiento_toast_rechazado'), 'success')
      setItemRechazar(null)
      onChange()
      fetchItems()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleAprobarLote = async (ids: number[]) => {
    if (ids.length === 0) return
    try {
      const res = await rpc<LoteResultRow[]>('fn_aprobar_cuarentena_lote_v2', {
        p_pendiente_ids: ids,
      })
      const rows = Array.isArray(res) ? res : []
      const failed = rows.filter((r) => !r.ok).length
      const okCount = rows.filter((r) => r.ok).length
      if (failed === 0) {
        showToast(t('saneamiento_toast_aprobados_lote', { count: String(okCount) }), 'success')
      } else {
        showToast(
          t('cuarentena_toast_lote_parcial', { ok: String(okCount), failed: String(failed) }),
          'error'
        )
      }
      setShowConfirmLote(false)
      setShowConfirmTodos(false)
      onChange()
      fetchItems()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleGuardarEdicion = async (payload: EditarCuarentenaPayload) => {
    if (!itemEditar) return
    try {
      await rpc('fn_editar_cuarentena_v2', {
        p_pendiente_id: itemEditar.pendiente_id,
        p_tipo: payload.tipo,
        p_monto: payload.monto,
        p_destination_amount: payload.destination_amount,
        p_billetera_id: payload.billetera_id,
        p_billetera_destino_id: payload.billetera_destino_id,
        p_tarjeta_id: payload.tarjeta_id,
        p_estructura_egreso_id: payload.estructura_egreso_id,
        p_cuenta_ingreso_id: payload.cuenta_ingreso_id,
        p_moneda: payload.moneda,
        p_cuotas: payload.cuotas,
        p_fecha: payload.fecha,
        p_detalle: payload.detalle,
      })
      showToast(t('saneamiento_toast_editado'), 'success')
      setItemEditar(null)
      fetchItems()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  /**
   * Persists an ambiguous choice immediately: picking the right entity is the
   * edit, so there is no separate confirm button.
   */
  const handleElegirCandidato = async (item: CuarentenaItem, param: string, candidate: AmbiguousCandidate) => {
    setPersistingId(item.pendiente_id)
    try {
      await rpc('fn_editar_cuarentena_v2', {
        p_pendiente_id: item.pendiente_id,
        [param]: Number(candidate.id),
      })
      showToast(t('saneamiento_toast_editado'), 'success')
      fetchItems()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setPersistingId(null)
    }
  }

  const verFoto = (metadata: Record<string, any> | null) => {
    const url = metadata?.image_url || metadata?.foto_url || metadata?.ticket_url
    if (url) setImagenUrl(url)
  }

  const escucharAudio = (metadata: Record<string, any> | null) => {
    const url = metadata?.audio_url
    if (url) setAudioUrl(url)
  }

  const filtros: { key: FiltroOrigen; label: string }[] = [
    { key: 'todos', label: t('saneamiento_filtro_todos') },
    { key: 'api_banco', label: `${t('saneamiento_origen_banco')} (${conteos.api_banco})` },
    { key: 'ocr', label: `📷 OCR (${conteos.ocr})` },
    { key: 'recurrente', label: `🔄 ${t('saneamiento_recurrentes')} (${conteos.recurrente})` },
    { key: 'voz', label: `🎙️ ${t('saneamiento_voz')} (${conteos.voz})` },
  ]

  return (
    <section className="saneamiento-seccion">
      <h2 className="saneamiento-seccion-titulo">{t('saneamiento_bandejawidget_titulo')}</h2>

      <div className="saneamiento-filtros">
        {filtros.map((f) => (
          <button
            key={f.key}
            className={`saneamiento-filtro-chip ${filtro === f.key ? 'active' : ''}`}
            onClick={() => setFiltro(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {approvableItems.length > 0 && (
        <div className="cuarentena-toolbar">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowConfirmTodos(true)}
          >
            {t('cuarentena_aprobar_todos', { count: String(approvableItems.length) })}
          </button>
          {excludedCount > 0 && (
            <span className="cuarentena-toolbar-aviso">
              {t('cuarentena_lote_excluidos', { count: String(excludedCount) })}
            </span>
          )}
        </div>
      )}

      {selectedApprovable.length > 0 && (
        <div className="saneamiento-lote-bar">
          <span>{t('saneamiento_seleccionados', { count: String(selectedApprovable.length) })}</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowConfirmLote(true)}>
            {t('saneamiento_aprobar_seleccion')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="saneamiento-loading-mini"><div className="spinner" /></div>
      ) : visibles.length === 0 ? (
        <div className="saneamiento-empty">
          <span className="saneamiento-empty-icon">
            <CategoryIcon name="ShieldCheck" size={48} />
          </span>
          <h3>{t('saneamiento_bandejawidget_vacio_titulo')}</h3>
          <p>{t('saneamiento_bandejawidget_vacio_desc')}</p>
        </div>
      ) : (
        <div className="saneamiento-lista">
          {visibles.map((item) => {
            const isVoice = isVoiceItem(item)
            const tipo = resolveMovementType(item)
            const missing = missingRequiredFields(item)
            const approvable = missing.length === 0
            const missingLabels = missing.map((key) => t(key)).join(', ')
            const candidates = AMBIGUOUS_FIELDS.flatMap((field) => {
              if (!field.isMissing(item)) return []
              const options = ambiguousCandidates(item, field.entity)
              return options.length > 0 ? [{ field, options }] : []
            })

            return (
              <div
                key={item.pendiente_id}
                className={`saneamiento-item ${seleccionados.has(item.pendiente_id) ? 'seleccionado' : ''}`}
              >
                <div className="saneamiento-item-main">
                  <input
                    type="checkbox"
                    checked={seleccionados.has(item.pendiente_id)}
                    onChange={() => toggleSeleccion(item.pendiente_id)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={!approvable}
                    title={approvable ? undefined : t('cuarentena_incompleto_falta', { campos: missingLabels })}
                  />
                  <div className="saneamiento-item-info">
                    <div className="saneamiento-item-titulo">
                      {item.categoria_icono ? (
                        <span>{item.categoria_icono}</span>
                      ) : (
                        <CategoryIcon name={MOVEMENT_TYPE_ICON[tipo]} size={18} />
                      )}
                      <span>{item.categoria_nombre || t('saneamiento_sin_categoria')}</span>
                      {isVoice && (
                        <span className="saneamiento-badge cuarentena-badge-tipo">
                          {t(`cuarentena_tipo_${tipo}`)}
                        </span>
                      )}
                      <OrigenBadge origen={item.origen} isVoice={isVoice} />
                    </div>
                    <p className="saneamiento-item-detalle">{item.detalle || t('saneamiento_sin_detalle')}</p>
                    <p className="saneamiento-item-meta">{formatDate(item.fecha)}</p>
                    <p className="saneamiento-item-meta cuarentena-item-meta-detalle">
                      {itemMetaParts(item, tipo).map((part) => (
                        <span key={part} className="cuarentena-meta-chip">{part}</span>
                      ))}
                    </p>

                    {item.origen === 'ocr' && (
                      <button className="saneamiento-item-link" onClick={() => verFoto(item.metadata)}>
                        📷 {t('saneamiento_ver_foto')}
                      </button>
                    )}
                    {(item.origen === 'voz' || isVoice) && item.metadata?.audio_url && (
                      <button className="saneamiento-item-link" onClick={() => escucharAudio(item.metadata)}>
                        🎧 {t('saneamiento_escuchar_audio')}
                      </button>
                    )}

                    {!approvable && (
                      <p className="cuarentena-incompleto">
                        {t('cuarentena_incompleto_falta', { campos: missingLabels })}
                      </p>
                    )}

                    {candidates.map(({ field, options }) => (
                      <AmbiguitySelector
                        key={field.entity}
                        name={`ambig-${field.entity}-${item.pendiente_id}`}
                        titleKey={field.labelKey}
                        candidates={options}
                        disabled={persistingId === item.pendiente_id}
                        onSelect={(candidate) => handleElegirCandidato(item, field.param, candidate)}
                      />
                    ))}
                  </div>
                  <div className="saneamiento-item-monto">
                    <span className="font-mono font-bold">{formatCurrency(item.monto, itemCurrency(item))}</span>
                  </div>
                </div>

                <div className="saneamiento-item-actions">
                  <button className="saneamiento-btn-editar" onClick={() => setItemEditar(item)}>
                    {t('saneamiento_editar')}
                  </button>
                  <button className="saneamiento-btn-rechazar" onClick={() => setItemRechazar(item)}>
                    {t('saneamiento_rechazar')}
                  </button>
                  <button
                    className="saneamiento-btn-aprobar"
                    onClick={() => handleAprobarItem(item)}
                    disabled={!approvable}
                    title={approvable ? undefined : t('cuarentena_incompleto_falta', { campos: missingLabels })}
                  >
                    {t('saneamiento_aprobar')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {itemEditar && (
        <EditarCuarentenaModal
          item={itemEditar}
          isOpen={true}
          onClose={() => setItemEditar(null)}
          onGuardar={handleGuardarEdicion}
        />
      )}

      {itemRechazar && (
        <RechazarCuarentenaModal
          item={itemRechazar}
          isOpen={true}
          onClose={() => setItemRechazar(null)}
          onConfirmar={handleRechazarItem}
        />
      )}

      {showConfirmLote && (
        <ConfirmModal
          isOpen={showConfirmLote}
          title={t('saneamiento_lote_titulo', { count: String(selectedApprovable.length) })}
          message={confirmMessage(selectedApprovable.length, excludedCount)}
          confirmText={t('saneamiento_aprobar_seleccion')}
          cancelText={t('saneamiento_cancelar')}
          onConfirm={() => handleAprobarLote(selectedApprovable.map((i) => i.pendiente_id))}
          onCancel={() => setShowConfirmLote(false)}
        />
      )}

      {showConfirmTodos && (
        <ConfirmModal
          isOpen={showConfirmTodos}
          title={t('cuarentena_todos_titulo')}
          message={confirmMessage(approvableItems.length, excludedCount)}
          confirmText={t('cuarentena_aprobar_todos', { count: String(approvableItems.length) })}
          cancelText={t('saneamiento_cancelar')}
          onConfirm={() => handleAprobarLote(approvableItems.map((i) => i.pendiente_id))}
          onCancel={() => setShowConfirmTodos(false)}
        />
      )}

      {imagenUrl && (
        <ImageModal url={imagenUrl} onClose={() => setImagenUrl(null)} />
      )}

      {audioUrl && (
        <ImageModal url={audioUrl} onClose={() => setAudioUrl(null)} isAudio />
      )}
    </section>
  )
}

/** Human-readable chips for the type-specific columns of a row. */
function itemMetaParts(item: CuarentenaItem, tipo: CuarentenaMovementType): string[] {
  const parts: string[] = []
  if (tipo === 'income' || tipo === 'transfer') {
    if (item.billetera_nombre) parts.push(item.billetera_nombre)
    if (item.billetera_destino_nombre) parts.push(item.billetera_destino_nombre)
  } else if (item.billetera_nombre) {
    parts.push(item.billetera_nombre)
  }
  if (tipo === 'card_expense' && item.tarjeta_nombre) parts.push(item.tarjeta_nombre)
  if (tipo === 'income' && item.cuenta_ingreso_nombre) parts.push(item.cuenta_ingreso_nombre)
  if (tipo === 'transfer' && item.destination_amount != null) {
    parts.push(
      t('cuarentena_destino_monto', {
        monto: formatCurrency(item.destination_amount, item.billetera_destino_moneda || 'ARS'),
      })
    )
  }
  if (tipo === 'card_expense' && (item.cuotas ?? 1) > 1) {
    parts.push(t('cuarentena_cuotas', { count: String(item.cuotas) }))
  }
  return parts
}

/** Confirmation body with the excluded-incomplete notice when it applies. */
function confirmMessage(count: number, excluded: number): string {
  const base = t('saneamiento_lote_mensaje', { count: String(count) })
  if (excluded <= 0) return base
  return `${base} ${t('cuarentena_lote_excluidos', { count: String(excluded) })}`
}

interface AmbiguitySelectorProps {
  name: string
  titleKey: string
  candidates: AmbiguousCandidate[]
  disabled: boolean
  onSelect: (candidate: AmbiguousCandidate) => void
}

function AmbiguitySelector({ name, titleKey, candidates, disabled, onSelect }: AmbiguitySelectorProps) {
  return (
    <div className="cuarentena-ambig">
      <p className="cuarentena-ambig-titulo">{t(titleKey)}</p>
      <div className="cuarentena-ambig-opciones" role="radiogroup" aria-label={t(titleKey)}>
        {candidates.map((candidate) => (
          <label key={candidate.id} className="cuarentena-ambig-opcion">
            <input
              type="radio"
              name={name}
              checked={false}
              disabled={disabled}
              onChange={() => onSelect(candidate)}
            />
            <span className="cuarentena-ambig-texto">
              <span className="cuarentena-ambig-nombre">{candidate.name}</span>
              {candidate.parent_name ? (
                <span className="cuarentena-ambig-padre">{candidate.parent_name}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function OrigenBadge({ origen, isVoice }: { origen: string; isVoice: boolean }) {
  if (isVoice) return <span className="saneamiento-badge saneamiento-badge-voz">{t('saneamiento_voz')}</span>
  if (origen === 'ocr') return <span className="saneamiento-badge saneamiento-badge-ocr">OCR</span>
  if (origen === 'recurrente') return <span className="saneamiento-badge saneamiento-badge-recurrente">{t('saneamiento_recurrente')}</span>
  if (origen === 'api_banco') return <span className="saneamiento-badge">{t('saneamiento_origen_banco')}</span>
  return <span className="saneamiento-badge">{origen}</span>
}
