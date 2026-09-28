import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import {
  isVoiceItem,
  resolveMovementType,
  itemCurrency,
  missingRequiredFields,
  isApprovable,
} from '@/components/saneamiento/BandejaCuarentena'
import { EditarCuarentenaModal } from '@/components/saneamiento/EditarCuarentenaModal'
import type { EditarCuarentenaPayload } from '@/components/saneamiento/EditarCuarentenaModal'
import type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'
import './Cuarentena.css'

const TYPE_ICON: Record<string, string> = {
  expense: 'ShoppingCart',
  income: 'TrendingUp',
  transfer: 'ArrowRightLeft',
  card_expense: 'WalletCards',
}

interface LoteResultRow {
  pendiente_id: number
  p_caja_id: number | null
  ok: boolean
  error_key: string | null
}

export function CuarentenaPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [pendientes, setPendientes] = useState<CuarentenaItem[]>([])
  const [loading, setLoading] = useState(true)

  const [showConfirmAprobarTodo, setShowConfirmAprobarTodo] = useState(false)
  const [itemToReject, setItemToReject] = useState<CuarentenaItem | null>(null)
  const [itemEditar, setItemEditar] = useState<CuarentenaItem | null>(null)

  // `?origen=voz` is the entry point used by the home FAB: it narrows the tray
  // to voice movements (the only ones with a `metadata.job_id`).
  const soloVoz = searchParams.get('origen') === 'voz'

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await rpc<CuarentenaItem[]>('fn_reporte_cuarentena_pendientes')
      setPendientes(res || [])
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchData()
    // A voice job landing in the quarantine refreshes the list without
    // requiring the user to leave and come back.
    const onVoiceLanded = () => fetchData()
    window.addEventListener('voice-quarantine-landed', onVoiceLanded)
    return () => window.removeEventListener('voice-quarantine-landed', onVoiceLanded)
  }, [fetchData])

  const visibles = useMemo(
    () => (soloVoz ? pendientes.filter(isVoiceItem) : pendientes),
    [pendientes, soloVoz]
  )
  const approvableItems = useMemo(() => visibles.filter(isApprovable), [visibles])
  const excludedCount = visibles.length - approvableItems.length

  const formatAmount = (monto: number, moneda: string) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(monto)
  }

  const handleAprobarItem = async (item: CuarentenaItem) => {
    if (!isApprovable(item)) return
    try {
      await rpc('fn_aprobar_cuarentena_v2', { p_pendiente_id: item.pendiente_id })
      showToast(t('saneamiento_toast_aprobado'), 'success')
      fetchData()
      window.dispatchEvent(new CustomEvent('movement-added'))
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleRechazarItem = async () => {
    if (!itemToReject) return
    try {
      await rpc('fn_rechazar_cuarentena', { p_pendiente_id: itemToReject.pendiente_id })
      showToast(t('saneamiento_toast_rechazado'), 'success')
      setItemToReject(null)
      fetchData()
      window.dispatchEvent(new CustomEvent('movement-added'))
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  /**
   * Same flow as BandejaCuarentena: the modal owns validation and field
   * visibility per movement type, this handler only persists. Editing is what
   * unblocks rows that are not approvable yet, so it stays enabled in every row.
   */
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
      fetchData()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleAprobarTodo = async () => {
    if (approvableItems.length === 0) return
    try {
      const res = await rpc<LoteResultRow[]>('fn_aprobar_cuarentena_lote_v2', {
        p_pendiente_ids: approvableItems.map((p) => p.pendiente_id),
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
      setShowConfirmAprobarTodo(false)
      fetchData()
      window.dispatchEvent(new CustomEvent('movement-added'))
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const { totalARS, totalUSD } = visibles.reduce(
    (acc, p) => {
      const currency = itemCurrency(p)
      if (currency === 'ARS') acc.totalARS += Number(p.monto)
      else if (currency === 'USD') acc.totalUSD += Number(p.monto)
      return acc
    },
    { totalARS: 0, totalUSD: 0 }
  )

  const quitarFiltroVoz = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('origen')
    setSearchParams(next)
  }

  return (
    <div className="page cuarentena-page fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className="btn-back" onClick={() => navigate(-1)}>←</button>
        <h1 className="font-display" style={{ fontSize: 'calc(24px * var(--font-scale))', margin: 0 }}>{t('quarantine_title_page')}</h1>
      </div>

      <p className="text-muted" style={{ marginBottom: '24px' }}>
        {t('quarantine_subtitle_page')}
      </p>

      {soloVoz && (
        <div className="cuarentena-filtro-voz">
          <span>{t('cuarentena_filtro_voz_activo')}</span>
          <button className="btn btn-secondary text-xs" onClick={quitarFiltroVoz}>
            {t('cuarentena_filtro_quitar')}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}><div className="spinner" /></div>
      ) : visibles.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon"><CategoryIcon name="ShieldCheck" size={56} /></span>
          <h3>{t('quarantine_empty_title')}</h3>
          <p>{t('quarantine_empty_desc')}</p>
        </div>
      ) : (
        <>
          <div className="cuarentena-stats">
            <div className="cuarentena-stat-card">
              <p className="text-xs text-muted font-semibold">{t('quarantine_stat_pending')}</p>
              <p className="font-display" style={{ fontSize: 'calc(24px * var(--font-scale))', color: 'var(--coral)' }}>{visibles.length}</p>
            </div>
            <div className="cuarentena-stat-card">
              <p className="text-xs text-muted font-semibold">{t('quarantine_stat_total_ars')}</p>
              <p className="font-mono font-bold" style={{ fontSize: 'calc(18px * var(--font-scale))', color: 'var(--text)' }}>{formatAmount(totalARS, 'ARS')}</p>
            </div>
            {totalUSD > 0 && (
              <div className="cuarentena-stat-card">
                <p className="text-xs text-muted font-semibold">{t('quarantine_stat_total_usd')}</p>
                <p className="font-mono font-bold" style={{ fontSize: 'calc(18px * var(--font-scale))', color: 'var(--text)' }}>{formatAmount(totalUSD, 'USD')}</p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            {excludedCount > 0 && (
              <span className="cuarentena-toolbar-aviso">
                {t('cuarentena_lote_excluidos', { count: String(excludedCount) })}
              </span>
            )}
            <button
              className="btn btn-primary text-sm"
              onClick={() => setShowConfirmAprobarTodo(true)}
              disabled={approvableItems.length === 0}
            >
              <CategoryIcon name="Check" size={14} /> {t('btn_approve_all')}
            </button>
          </div>

          <div className="cuarentena-list">
            {visibles.map((p) => {
              const tipo = resolveMovementType(p)
              const missing = missingRequiredFields(p)
              const approvable = missing.length === 0
              const missingLabels = missing.map((key) => t(key)).join(', ')
              const isVoice = isVoiceItem(p)

              return (
                <div key={p.pendiente_id} className="cuarentena-item">
                  <div className="cuarentena-item-header">
                    <div>
                      <h4 style={{ margin: 0, fontSize: 'calc(16px * var(--font-scale))', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CategoryIcon name={TYPE_ICON[tipo]} size={18} /> {p.categoria_nombre || t('quarantine_no_detail')}
                      </h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: 'calc(14px * var(--font-scale))', color: 'var(--text-2)' }}>
                        {p.detalle || t('quarantine_no_detail')}
                      </p>
                      <p style={{ margin: '4px 0 0 0', fontSize: 'calc(12px * var(--font-scale))', color: 'var(--text-3)' }}>
                        {t('quarantine_item_received_date')}{new Date(p.creado_at).toLocaleDateString('es-AR')}
                      </p>
                      {isVoice && (
                        <span className="saneamiento-badge cuarentena-badge-tipo">
                          {t(`cuarentena_tipo_${tipo}`)}
                        </span>
                      )}
                      {!approvable && (
                        <p className="cuarentena-incompleto">
                          {t('cuarentena_incompleto_falta', { campos: missingLabels })}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p className="font-mono font-bold" style={{ margin: 0, fontSize: 'calc(16px * var(--font-scale))', color: 'var(--coral)' }}>
                        {formatAmount(p.monto, itemCurrency(p))}
                      </p>
                      <p style={{ margin: '4px 0 0 0', fontSize: 'calc(12px * var(--font-scale))', color: 'var(--text-3)' }}>
                        <CategoryIcon name="WalletCards" size={14} /> {t(p.billetera_nombre || p.billetera_destino_nombre || '-')}
                      </p>
                    </div>
                  </div>

                  <div className="cuarentena-item-actions" style={{ flexWrap: 'wrap' }}>
                    <button className="btn-cuarentena edit" onClick={() => setItemEditar(p)}>
                      <CategoryIcon name="Pencil" size={14} /> {t('saneamiento_editar')}
                    </button>
                    <button className="btn-cuarentena reject" onClick={() => setItemToReject(p)}>
                      <CategoryIcon name="X" size={14} /> {t('btn_reject')}
                    </button>
                    <button
                      className="btn-cuarentena approve"
                      onClick={() => handleAprobarItem(p)}
                      disabled={!approvable}
                      title={approvable ? undefined : t('cuarentena_incompleto_falta', { campos: missingLabels })}
                    >
                      <CategoryIcon name="Check" size={14} /> {t('btn_approve')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showConfirmAprobarTodo && (
        <ConfirmModal
          isOpen={showConfirmAprobarTodo}
          title={t('confirm_approve_all_title')}
          message={
            excludedCount > 0
              ? `${t('confirm_approve_all_msg', { count: String(approvableItems.length) })} ${t('cuarentena_lote_excluidos', { count: String(excludedCount) })}`
              : t('confirm_approve_all_msg', { count: String(approvableItems.length) })
          }
          confirmText={t('btn_approve_all')}
          cancelText={t('btn_cancel')}
          onConfirm={handleAprobarTodo}
          onCancel={() => setShowConfirmAprobarTodo(false)}
        />
      )}

      {itemToReject && (
        <ConfirmModal
          isOpen={!!itemToReject}
          title={t('confirm_reject_item_title')}
          message={t('confirm_reject_item_msg', {
            desc: itemToReject.detalle || itemToReject.categoria_nombre || '',
            monto: formatAmount(itemToReject.monto, itemCurrency(itemToReject)),
          })}
          confirmText={t('btn_reject_and_delete')}
          cancelText={t('btn_cancel')}
          onConfirm={handleRechazarItem}
          onCancel={() => setItemToReject(null)}
          type="danger"
        />
      )}

      {itemEditar && (
        <EditarCuarentenaModal
          item={itemEditar}
          isOpen={true}
          onClose={() => setItemEditar(null)}
          onGuardar={handleGuardarEdicion}
        />
      )}
    </div>
  )
}
