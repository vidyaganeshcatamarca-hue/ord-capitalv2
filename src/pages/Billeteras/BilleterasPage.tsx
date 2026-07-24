import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useBilleteras } from '@/hooks/useBilleteras'
import { useNumberFormat } from '@/hooks/useNumberFormat'
import { Billetera } from '@/types/Billetera'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { InitialBalanceModal } from '@/components/InitialBalanceModal/InitialBalanceModal'
import { BilleteraDetailModal } from '@/components/BilleteraDetailModal/BilleteraDetailModal'
import { ReconcileWalletModal } from '@/components/ReconcileWalletModal/ReconcileWalletModal'
import { TabEgresos, TabIngresos } from '@/pages/Categorias/CategoriasPage'
import '@/pages/Categorias/Categorias.css'
import './Billeteras.css'

const FINANCIAL_EMOJIS = ['💵', '💳', '🏦', '🪙', '💸', '💼', '📊', '📈', '📉', '💰', '🛡️', '🐖', '🎯', '🔑', '🏧']
export function BilleterasPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { showToast } = useToast()
  const { billeteras, healthReport, loading, fetchData } = useBilleteras()
  const [hideAmounts, setHideAmounts] = useState(() => {
    return window.localStorage.getItem(`ocultar_montos:${user?.id}`) === 'true'
  })
  const [activeMenuTab, setActiveMenuTabState] = useState<'cuentas_ingreso' | 'categorias_egresos'>(() => {
    const fromUrl = searchParams.get('tab')
    if (fromUrl === 'categorias_egresos' || fromUrl === 'egresos') return 'categorias_egresos'
    if (fromUrl === 'cuentas_ingreso' || fromUrl === 'ingresos') return 'cuentas_ingreso'
    const fromSession = sessionStorage.getItem('last_billeteras_menu_tab') as 'cuentas_ingreso' | 'categorias_egresos'
    if (fromSession === 'cuentas_ingreso' || fromSession === 'categorias_egresos') return fromSession
    return 'cuentas_ingreso'
  })

  const setActiveMenuTab = (tab: 'cuentas_ingreso' | 'categorias_egresos') => {
    setActiveMenuTabState(tab)
    sessionStorage.setItem('last_billeteras_menu_tab', tab)
  }

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showConciliarModal, setShowConciliarModal] = useState(false)
  const [showInitialBalanceModal, setShowInitialBalanceModal] = useState(false)
  const [showConfirmArchive, setShowConfirmArchive] = useState(false)

  // Estado del Formulario de Creación
  const [newName, setNewName] = useState('')
  const [newMoneda, setNewMoneda] = useState('ARS')
  const [newSaldoApertura, setNewSaldoApertura] = useState('0')
  const [newIcono, setNewIcono] = useState('💳')

  // Estado del Formulario de Edición
  const [selectedBilletera, setSelectedBilletera] = useState<Billetera | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcono, setEditIcono] = useState('💳')

  // Estado del Formulario de Conciliación
  const [conciliarBilletera, setConciliarBilletera] = useState<Billetera | null>(null)
  const [initialBalanceBilletera, setInitialBalanceBilletera] = useState<Billetera | null>(null)
  const [initialBalanceValue, setInitialBalanceValue] = useState('0')

  // Estado del Detalle
  const [detailBilletera, setDetailBilletera] = useState<Billetera | null>(null)

  useEffect(() => {
    // Cargar preferencia de ocultar montos
    const val = localStorage.getItem('hide_amounts') === 'true'
    setHideAmounts(val)
  }, [])

  useEffect(() => {
    if (selectedBilletera && billeteras.length > 0) {
      const freshBilletera = billeteras.find(b => b.billetera_id === selectedBilletera.billetera_id)
      if (freshBilletera && JSON.stringify(freshBilletera) !== JSON.stringify(selectedBilletera)) {
        setSelectedBilletera(freshBilletera)
      }
    }
  }, [billeteras, selectedBilletera])

  // Formateo de montos respetando decimales del usuario (useNumberFormat)
  const { formatMonto: formatMontoBase } = useNumberFormat()
  const formatAmount = useCallback((monto: number, moneda: string) => {
    if (hideAmounts) return '***'
    return formatMontoBase(monto, moneda)
  }, [hideAmounts, formatMontoBase])

  // Semáforo con texto explicativo (Observación 3)
  const getSemaforoDetails = (ultimaConciliacionAt: string | null) => {
    if (!ultimaConciliacionAt) {
      return { color: 'red', text: 'Sin conciliar', days: null }
    }
    const diffTime = Math.abs(new Date().getTime() - new Date(ultimaConciliacionAt).getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays < 5) {
      return { color: 'green', text: 'Sincronizado', days: diffDays }
    }
    if (diffDays <= 10) {
      return { color: 'yellow', text: 'Desactualizado', days: diffDays }
    }
    return { color: 'red', text: 'Dato Dudoso', days: diffDays }
  }

  // Creación
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) {
      showToast('Por favor, ingresa el nombre de la cuenta', 'error')
      return
    }

    const saldoNum = parseFloat(newSaldoApertura)
    if (isNaN(saldoNum) || saldoNum < 0) {
      showToast(t('error_invalid_opening_balance'), 'error')
      return
    }

    try {
      await rpc('fn_crear_billetera', {
        p_nombre: newName,
        p_moneda: newMoneda,
        p_saldo_apertura: saldoNum,
        p_icono: newIcono
      })
      showToast('Cuenta creada correctamente', 'success')
      setShowCreateModal(false)
      // Resetear campos
      setNewName('')
      setNewMoneda('ARS')
      setNewSaldoApertura('0')
      setNewIcono('💳')
      fetchData()
    } catch (err: any) {
      showToast('Error al crear la cuenta: ' + (err.message || err), 'error')
    }
  }

  // Edición
  const openEdit = (billetera: any) => {
    setSelectedBilletera(billetera)
    setEditName(billetera.nombre)
    setEditIcono(billetera.icono || '💳')
    setShowEditModal(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBilletera) return
    if (!editName.trim()) {
      showToast(t('error_name_empty'), 'error')
      return
    }

    try {
      await rpc('fn_editar_billetera', {
        p_billetera_id: selectedBilletera.billetera_id,
        p_nombre: editName,
        p_icono: editIcono
      })
      showToast('Cambios guardados', 'success')
      setShowEditModal(false)
      fetchData()
    } catch (err: any) {
      showToast('Error al guardar cambios: ' + (err.message || err), 'error')
    }
  }

  // Archivación
  const handleArchivar = async () => {
    if (!selectedBilletera) return
    
    // Validar en cliente de manera clara por si tiene saldo
    if (selectedBilletera.saldo_actual !== 0) {
      showToast(t('error_archive_active_balance'), 'error')
      return
    }

    setShowConfirmArchive(true)
  }

  const confirmArchivar = async () => {
    if (!selectedBilletera) return
    setShowConfirmArchive(false)
    try {
      await rpc('fn_archivar_billetera', {
        p_billetera_id: selectedBilletera.billetera_id
      })
      showToast('Cuenta archivada correctamente', 'success')
      setShowEditModal(false)
      fetchData()
    } catch (err: any) {
      if (err.message?.includes('error_wallet_has_balance')) {
        showToast('Error: No se puede archivar una cuenta con saldo activo.', 'error')
      } else {
        showToast('Error al archivar la cuenta: ' + (err.message || err), 'error')
      }
    }
  }

  // Conciliación (modal unificado)
  const openConciliar = (billetera: any) => {
    setConciliarBilletera(billetera)
    setShowConciliarModal(true)
  }

  const openInitialBalance = (billetera: any) => {
    setInitialBalanceBilletera(billetera)
    setShowInitialBalanceModal(true)
  }

  if (loading && billeteras.length === 0) {
    return (
      <div className="page flex items-center justify-center" style={{ minHeight: '80vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  // Filtrar alertas de mantenimiento para el widget
  const alertasSalud = healthReport.filter(b => b.alertas_keys && b.alertas_keys.length > 0)

  return (
    <div className="page">
      {/* Switcher de menús unificados */}
      <div className="cat-tabs-switcher mb-4">
        <button
          className={`cat-tab-btn ${activeMenuTab === 'cuentas_ingreso' ? 'active' : ''}`}
          onClick={() => setActiveMenuTab('cuentas_ingreso')}
        >
          <span>💼</span> Ingresos
        </button>
        <button
          className={`cat-tab-btn ${activeMenuTab === 'categorias_egresos' ? 'active' : ''}`}
          onClick={() => setActiveMenuTab('categorias_egresos')}
        >
          <span>📤</span> Egresos
        </button>
      </div>

      {activeMenuTab === 'cuentas_ingreso' ? (
        <>
          {/* ── HEADER DE CUENTAS ── */}
          <div className="page-header" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 0 }}>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary btn-sm font-semibold"
                onClick={() => window.dispatchEvent(new CustomEvent('open-crear-fuente'))}
              >
                + Fuente
              </button>
              <button className="btn btn-primary btn-sm font-semibold" onClick={() => setShowCreateModal(true)}>
                + Cuenta
              </button>
            </div>
          </div>

          <div className="section">
            {/* ── WIDGET DE SALUD BANCARIA ── */}
            {alertasSalud.length > 0 && (
              <div className="health-widget">
                <h4 className="health-widget-title">
                  ⚠️ Mantenimiento Requerido ({alertasSalud.length})
                </h4>
                <div className="health-alerts-list">
                  {alertasSalud.map((b) => (
                    <div key={b.billetera_id} className="health-alert-item">
                      <div className="health-alert-text">
                        <strong>{t(b.nombre)}</strong>:{' '}
                        {b.alertas_keys.includes('negative_balance') && 'Saldo en descubierto / negativo. '}
                        {b.alertas_keys.includes('unreconciled') && t('alert_unreconciled_10_days')}
                        {b.alertas_keys.includes('no_movements') && t('alert_no_movements_60_days')}
                      </div>
                      <div className="flex gap-2">
                        {b.alertas_keys.includes('unreconciled') && (
                          <button className="btn btn-xs btn-primary text-xs" onClick={() => openConciliar(b)}>
                            ⚖️ Conciliar
                          </button>
                        )}
                        {b.alertas_keys.includes('no_movements') && b.saldo_actual === 0 && (
                          <button className="btn btn-xs btn-secondary text-xs" onClick={() => openEdit(b)}>
                            ⚙️ Archivar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── LISTADO DE BILLETERAS (Grilla en PC / Lista en móvil) ── */}
            {billeteras.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">💳</span>
                <h3>No tienes cuentas activas</h3>
                <p>Comienza agregando tu primera billetera de efectivo o banco.</p>
                <button className="btn btn-primary mt-4" onClick={() => setShowCreateModal(true)}>
                  Crear Cuenta
                </button>
              </div>
            ) : (
              <div className="billeteras-list">
                {billeteras.map((b) => {
                  const sem = getSemaforoDetails(b.ultima_conciliacion_at)
                  return (
                    <div key={b.billetera_id} className="billetera-item">
                      <div className="billetera-item-top">
                        <div className="billetera-item-left" onClick={() => setDetailBilletera(b)} style={{ cursor: 'pointer' }}>
                          <div className="billetera-item-icon-wrapper">
                            {b.icono || '💳'}
                            <span className={`dot dot-${sem.color} billetera-item-semaforo`} />
                          </div>
                          <div className="billetera-item-info">
                            <div className="billetera-item-name">
                              <span className="billetera-name-text">{t(b.nombre)}</span>
                              {b.es_fondo_prevision && <span className="prevision-badge">{t('badge_prevision_fund')}</span>}
                              {b.saldo_inicial_pendiente && <span className="prevision-badge">{t('wallet_pending_initial_balance_badge')}</span>}
                            </div>
                            <div className="billetera-item-type">
                              <span>{b.moneda === 'USD' ? 'USD (Reserva)' : 'ARS (Moneda local)'}</span>
                              <span>•</span>
                              <span style={{ color: `var(--text-3)`, fontWeight: 600 }}>
                                {sem.text} {sem.days !== null && `(hace ${sem.days}d)`}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="billetera-item-saldo-wrap">
                          <span className="billetera-item-saldo">
                            {formatAmount(b.saldo_actual, b.moneda)}
                          </span>
                        </div>
                      </div>

                      <div className="billetera-item-actions">
                        {b.saldo_inicial_pendiente && (
                          <button className="btn-billetera-action primary" onClick={() => openInitialBalance(b)}>
                            {t('wallet_complete_initial_balance')}
                          </button>
                        )}
                        <button className="btn-billetera-action primary" onClick={() => openConciliar(b)}>
                          ⚖️ Conciliar
                        </button>
                        <button className="btn-billetera-action" onClick={() => openEdit(b)}>
                          ⚙️ Editar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Divisor estético */}
          <div style={{ margin: '40px 0 24px 0', borderTop: '1px solid var(--border)', opacity: 0.5 }} />

          {/* ── HEADER DE FUENTES DE INGRESO ── */}
          <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="font-display" style={{ fontSize: 20 }}>Fuentes de Ingreso</h2>
          </div>

          <TabIngresos hideNewBtn={true} />
        </>
      ) : (
        <TabEgresos />
      )}

      {/* ── MODAL: NUEVA CUENTA ── */}
      {showCreateModal && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowCreateModal(false)} />
          <div className="bottom-sheet wallet-modal-sheet">
            <div className="bottom-sheet-handle" />
            <form onSubmit={handleCreate} style={{ padding: 'var(--space-2) var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h3 className="font-display" style={{ fontSize: '18px', margin: 0 }}>➕ Nueva Cuenta</h3>
                <button type="button" className="text-xs text-muted" onClick={() => setShowCreateModal(false)}>Cerrar ✕</button>
              </div>

              <div className="form-group mb-3">
                <label className="text-xs text-muted mb-1 block font-semibold">Nombre de la cuenta</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ej: Banco Galicia, Mercado Pago, Efectivo"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  required
                  enterKeyHint="next"
                />
              </div>

              <div className="form-group mb-3">
                <label className="text-xs text-muted mb-1 block font-semibold">Saldo de Apertura (Inicial)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control font-mono"
                  value={newSaldoApertura}
                  onChange={(e) => setNewSaldoApertura(e.target.value)}
                  onFocus={(e) => { if (e.target.value === '0') setNewSaldoApertura('') }}
                  onBlur={(e) => { if (e.target.value.trim() === '') setNewSaldoApertura('0') }}
                  required
                />
              </div>

              <div className="form-group mb-3">
                <label className="text-xs text-muted mb-1 block font-semibold">Moneda</label>
                <select className="form-control" value={newMoneda} onChange={(e) => setNewMoneda(e.target.value)}>
                  <option value="ARS">Pesos Argentinos (ARS)</option>
                  <option value="USD">{t('option_usd_currency')}</option>
                </select>
              </div>

              <div className="form-group mb-4">
                <label className="text-xs text-muted mb-2 block font-semibold">Icono Representativo</label>
                <div className="emojis-picker-grid">
                  {FINANCIAL_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`emoji-select-btn ${newIcono === emoji ? 'active' : ''}`}
                      onClick={() => setNewIcono(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Crear Cuenta
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── MODAL: EDITAR CUENTA ── */}
      {showEditModal && selectedBilletera && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowEditModal(false)} />
          <div className="bottom-sheet wallet-modal-sheet">
            <div className="bottom-sheet-handle" />
            <form onSubmit={handleEdit} style={{ padding: 'var(--space-2) var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h3 className="font-display" style={{ fontSize: '18px', margin: 0 }}>⚙️ Editar {selectedBilletera.nombre}</h3>
                <button type="button" className="text-xs text-muted" onClick={() => setShowEditModal(false)}>Cerrar ✕</button>
              </div>

              <div className="form-group mb-3">
                <label className="text-xs text-muted mb-1 block font-semibold">Nombre de la cuenta</label>
                <input
                  type="text"
                  className="form-control"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  required
                  enterKeyHint="done"
                />
              </div>

              <div className="form-group mb-4">
                <label className="text-xs text-muted mb-2 block font-semibold">Icono Representativo</label>
                <div className="emojis-picker-grid">
                  {FINANCIAL_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`emoji-select-btn ${editIcono === emoji ? 'active' : ''}`}
                      onClick={() => setEditIcono(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowEditModal(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary flex-1">
                    Guardar Cambios
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleArchivar}
                  className="btn btn-secondary"
                  style={{
                    background: 'rgba(255, 107, 107, 0.08)',
                    color: 'var(--coral)',
                    borderColor: 'rgba(255, 107, 107, 0.25)',
                    marginTop: 'var(--space-1)'
                  }}
                >
                  Archivar
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── MODAL: DETALLE DE BILLETERA ── */}
      {detailBilletera && (
        <BilleteraDetailModal
          billetera={detailBilletera}
          onClose={() => setDetailBilletera(null)}
          onConciliar={(b) => {
            setDetailBilletera(null)
            openConciliar(b)
          }}
          onTransferir={(b) => {
            setDetailBilletera(null)
            window.dispatchEvent(new CustomEvent('open-transfer-modal', { detail: { billetera_id: b.billetera_id } }))
          }}
        />
      )}

      {/* ── MODAL: CONCILIAR (componente unificado) ── */}
      {showConciliarModal && conciliarBilletera && (
        <ReconcileWalletModal
          billetera={conciliarBilletera}
          formatAmount={formatAmount}
          onClose={() => setShowConciliarModal(false)}
          onSuccess={fetchData}
        />
      )}
      {/* ── MODAL: CARGAR SALDO INICIAL PENDIENTE ── */}
      {showInitialBalanceModal && initialBalanceBilletera && (
        <InitialBalanceModal
          billetera={initialBalanceBilletera}
          onClose={() => {
            setShowInitialBalanceModal(false)
            setInitialBalanceBilletera(null)
          }}
          onSuccess={fetchData}
        />
      )}
      {/* ── MODAL: CONFIRM ARCHIVAR ── */}
      <ConfirmModal
        isOpen={showConfirmArchive}
        title="Archivar"
        message={t('confirm_archive_wallet', { name: selectedBilletera?.nombre })}
        confirmText="Archivar"
        cancelText="Cancelar"
        type="danger"
        onConfirm={confirmArchivar}
        onCancel={() => setShowConfirmArchive(false)}
      />
    </div>
  )
}
