import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import './Cuarentena.css'

export function CuarentenaPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  
  const [pendientes, setPendientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const [showConfirmAprobarTodo, setShowConfirmAprobarTodo] = useState(false)
  const [itemToReject, setItemToReject] = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await rpc<any[]>('fn_reporte_cuarentena_pendientes')
      setPendientes(res || [])
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const formatAmount = (monto: number, moneda: string) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(monto)
  }

  const handleAprobarItem = async (id: number) => {
    try {
      await rpc('fn_aprobar_cuarentena', { p_cuarentena_id: id })
      showToast(t('success_quarantine_approved'), 'success')
      fetchData()
      window.dispatchEvent(new CustomEvent('movement-added'))
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleRechazarItem = async () => {
    if (!itemToReject) return
    try {
      await rpc('fn_rechazar_cuarentena', { p_cuarentena_id: itemToReject.id })
      showToast(t('success_quarantine_rejected'), 'success')
      setItemToReject(null)
      fetchData()
      window.dispatchEvent(new CustomEvent('movement-added'))
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleAprobarTodo = async () => {
    try {
      await rpc('fn_aprobar_gastos_cuarentena_lote', { p_cuarentena_ids: pendientes.map(p => p.id) })
      showToast(t('success_quarantine_approved_batch', { count: String(pendientes.length) }), 'success')
      setShowConfirmAprobarTodo(false)
      fetchData()
      window.dispatchEvent(new CustomEvent('movement-added'))
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const { totalARS, totalUSD } = pendientes.reduce(
    (acc, p) => {
      if (p.moneda === 'ARS') acc.totalARS += Number(p.monto)
      else if (p.moneda === 'USD') acc.totalUSD += Number(p.monto)
      return acc
    },
    { totalARS: 0, totalUSD: 0 }
  )

  return (
    <div className="page cuarentena-page fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className="btn-back" onClick={() => navigate(-1)}>←</button>
        <h1 className="font-display" style={{ fontSize: 'calc(24px * var(--font-scale))', margin: 0 }}>{t('quarantine_title_page')}</h1>
      </div>

      <p className="text-muted" style={{ marginBottom: '24px' }}>
        {t('quarantine_subtitle_page')}
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}><div className="spinner" /></div>
      ) : pendientes.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">🛡️</span>
          <h3>{t('quarantine_empty_title')}</h3>
          <p>{t('quarantine_empty_desc')}</p>
        </div>
      ) : (
        <>
          <div className="cuarentena-stats">
            <div className="cuarentena-stat-card">
              <p className="text-xs text-muted font-semibold">{t('quarantine_stat_pending')}</p>
              <p className="font-display" style={{ fontSize: 'calc(24px * var(--font-scale))', color: 'var(--coral)' }}>{pendientes.length}</p>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button className="btn btn-primary text-sm" onClick={() => setShowConfirmAprobarTodo(true)}>
              ✅ {t('btn_approve_all')}
            </button>
          </div>

          <div className="cuarentena-list">
            {pendientes.map((p) => (
              <div key={p.id} className="cuarentena-item">
                <div className="cuarentena-item-header">
                  <div>
                    <h4 style={{ margin: 0, fontSize: 'calc(16px * var(--font-scale))', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {p.icono_categoria || '🛒'} {t(p.nombre_categoria)}
                    </h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: 'calc(14px * var(--font-scale))', color: 'var(--text-2)' }}>{p.descripcion || t('quarantine_no_detail')}</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: 'calc(12px * var(--font-scale))', color: 'var(--text-3)' }}>
                      {t('quarantine_item_received_date')}{new Date(p.fecha_ingreso).toLocaleDateString('es-AR')}
                    </p>
                    {p.motivo_cuarentena && (
                        <span style={{ display: 'inline-block', marginTop: '8px', padding: '2px 8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--coral)', borderRadius: '4px', fontSize: 'calc(11px * var(--font-scale))', fontWeight: 'bold' }}>
                        {p.motivo_cuarentena === 'out_of_budget' ? t('quarantine_reason_out_of_budget') : t('quarantine_reason_impulsive_ant')}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p className="font-mono font-bold" style={{ margin: 0, fontSize: 'calc(16px * var(--font-scale))', color: 'var(--coral)' }}>
                      {formatAmount(p.monto, p.moneda)}
                    </p>
                    <p style={{ margin: '4px 0 0 0', fontSize: 'calc(12px * var(--font-scale))', color: 'var(--text-3)' }}>
                      💳 {p.nombre_billetera}
                    </p>
                  </div>
                </div>

                <div className="cuarentena-item-actions">
                  <button className="btn-cuarentena reject" onClick={() => setItemToReject(p)}>
                    ❌ {t('btn_reject')}
                  </button>
                  <button className="btn-cuarentena approve" onClick={() => handleAprobarItem(p.id)}>
                    ✅ {t('btn_approve')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showConfirmAprobarTodo && (
        <ConfirmModal
          isOpen={showConfirmAprobarTodo}
          title={t('confirm_approve_all_title')}
          message={t('confirm_approve_all_msg', { count: String(pendientes.length) })}
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
          message={t('confirm_reject_item_msg', { desc: itemToReject.descripcion || t(itemToReject.nombre_categoria), monto: formatAmount(itemToReject.monto, itemToReject.moneda) })}
          confirmText={t('btn_reject_and_delete')}
          cancelText={t('btn_cancel')}
          onConfirm={handleRechazarItem}
          onCancel={() => setItemToReject(null)}
          type="danger"
        />
      )}
    </div>
  )
}
