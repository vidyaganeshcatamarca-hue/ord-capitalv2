import { useState, useEffect } from 'react'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { useNumberFormat } from '@/hooks/useNumberFormat'
import { WalletIcon } from '@/components/WalletIcon'
import './BilleteraDetailModal.css'

interface BilleteraDetailModalProps {
  billetera: any
  onClose: () => void
  onConciliar?: (b: any) => void
  onTransferir?: (b: any) => void
}

export function BilleteraDetailModal({ billetera, onClose, onConciliar, onTransferir }: BilleteraDetailModalProps) {
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadMovimientos() {
      try {
        setLoading(true)
        const res = await rpc<any[]>('fn_reporte_movimientos_por_billetera', {
          p_billetera_id: billetera.billetera_id,
          p_limit: 50,
          p_offset: 0
        })
        setMovimientos(res || [])
      } catch (err: any) {
        setError(parseError(err))
      } finally {
        setLoading(false)
      }
    }
    loadMovimientos()
  }, [billetera.billetera_id])

  const { formatMonto } = useNumberFormat()
  const formatAmount = (monto: number, moneda: string) => formatMonto(monto, moneda)

  return (
    <>
      <div className="bottom-sheet-overlay" onClick={onClose} />
      <div className="bottom-sheet billetera-detail-modal" style={{ zIndex: 1100 }}>
        <div className="bottom-sheet-handle" />
        <div className="billetera-detail-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px' }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 'calc(24px * var(--font-scale))' }}><WalletIcon name={billetera.icono} size={24} /></span>
            <h2 style={{ fontSize: 'calc(20px * var(--font-scale))', margin: 0 }}>{t(billetera.nombre)}</h2>
          </div>
          <button type="button" className="text-muted" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 'calc(18px * var(--font-scale))', cursor: 'pointer' }}>✕</button>
        </div>

        <div className="billetera-detail-saldo card" style={{ background: 'var(--surface)', margin: '0 16px 16px', padding: '16px', textAlign: 'center', borderRadius: '12px' }}>
          <p style={{ color: 'var(--text-3)', fontSize: 'calc(12px * var(--font-scale))', marginBottom: '4px' }}>{t('wallets.detail_saldo_actual')}</p>
          <p className="font-display" style={{ fontSize: 'calc(24px * var(--font-scale))', color: billetera.saldo_actual >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
            {formatAmount(billetera.saldo_actual, billetera.moneda)}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
            {onTransferir && (
              <button 
                className="btn btn-secondary text-sm" 
                style={{ flex: 1 }} 
                onClick={() => onTransferir(billetera)}
              >
                ↔️ {t('wallets.detail_btn_transferir')}
              </button>
            )}
            {onConciliar && (
              <button 
                className="btn btn-primary text-sm" 
                style={{ flex: 1 }} 
                onClick={() => onConciliar(billetera)}
              >
                ⚖️ {t('wallets.btn_conciliar')}
              </button>
            )}
          </div>
        </div>

        <div className="billetera-detail-body" style={{ padding: '0 16px 16px', overflowY: 'auto', maxHeight: '60vh' }}>
          <h3 style={{ fontSize: 'calc(14px * var(--font-scale))', color: 'var(--text-2)', marginBottom: '12px' }}>{t("title_latest_movements")}</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px' }}><div className="spinner" /></div>
          ) : error ? (
            <div style={{ textAlign: 'center', color: 'var(--coral)', padding: '24px' }}>{error}</div>
          ) : movimientos.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '24px' }}>{t('wallets.detail_empty_movimientos')}</div>
          ) : (
            <div className="movimientos-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {movimientos.map((m, i) => {
                // Determinar si fue ingreso o egreso relativo a la billetera en caso de transferencias
                let displayType = m.tipo
                let amount = m.tipo === 'expense' ? m.valor_egreso : m.valor_ingreso
                if (m.tipo === 'transfer') {
                  if (m.billetera_origen_id === billetera.billetera_id) {
                    displayType = 'expense'
                    amount = m.valor_egreso
                  } else {
                    displayType = 'income'
                    amount = m.valor_ingreso
                  }
                }
                
                return (
                  <div key={i} className="movimiento-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--surface)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', background: 'var(--surface-2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {displayType === 'expense' ? '➖' : displayType === 'income' ? '➕' : '↔️'}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: 'calc(14px * var(--font-scale))' }}>{m.nombre_cuenta_historico || m.descripcion || m.tipo}</p>
                        <p style={{ margin: 0, fontSize: 'calc(12px * var(--font-scale))', color: 'var(--text-3)' }}>{new Date(m.fecha).toLocaleDateString('es-AR')}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontWeight: 'bold', color: displayType === 'expense' ? 'var(--coral)' : displayType === 'income' ? 'var(--mint)' : 'var(--blue)' }}>
                        {displayType === 'expense' ? '-' : '+'}{formatAmount(amount, billetera.moneda)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
