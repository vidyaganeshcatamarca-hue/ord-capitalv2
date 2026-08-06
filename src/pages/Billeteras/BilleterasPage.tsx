import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useBilleteras } from '@/hooks/useBilleteras'
import { useNumberFormat } from '@/hooks/useNumberFormat'
import { useHideAmounts } from '@/hooks/useHideAmounts'
import { Billetera } from '@/types/Billetera'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { InitialBalanceModal } from '@/components/InitialBalanceModal/InitialBalanceModal'
import { BilleteraDetailModal } from '@/components/BilleteraDetailModal/BilleteraDetailModal'
import { ReconcileWalletModal } from '@/components/ReconcileWalletModal/ReconcileWalletModal'
import { TabEgresos, TabIngresos } from '@/pages/Categorias/CategoriasPage'
import { CategoryIcon } from '@/components/CategoryIcon'
import { WALLET_ICONS } from '@/constants/emojiToLucide'
import '@/pages/Categorias/Categorias.css'
import './Billeteras.css'

export function BilleterasPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { showToast } = useToast()
  const { billeteras, healthReport, loading, fetchData } = useBilleteras()
  const { hideAmounts } = useHideAmounts(user?.id)
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
  const [newIcono, setNewIcono] = useState('Wallet')

  // Estado del Formulario de Edición
  const [selectedBilletera, setSelectedBilletera] = useState<Billetera | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcono, setEditIcono] = useState('Wallet')
  const [originalName, setOriginalName] = useState('')

  // Estado del Formulario de Conciliación
  const [conciliarBilletera, setConciliarBilletera] = useState<Billetera | null>(null)
  const [initialBalanceBilletera, setInitialBalanceBilletera] = useState<Billetera | null>(null)
  const [initialBalanceValue, setInitialBalanceValue] = useState('0')

  // Estado del Detalle
  const [detailBilletera, setDetailBilletera] = useState<Billetera | null>(null)



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
      return { color: 'red', text: t('wallets.sem_sin_conciliar'), days: null }
    }
    const diffTime = Math.abs(new Date().getTime() - new Date(ultimaConciliacionAt).getTime())
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays < 5) {
      return { color: 'green', text: t('wallets.sem_sincronizado'), days: diffDays }
    }
    if (diffDays <= 10) {
      return { color: 'yellow', text: t('wallets.sem_desactualizado'), days: diffDays }
    }
    return { color: 'red', text: t('wallets.sem_dato_dudoso'), days: diffDays }
  }

  // Creación
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) {
      showToast(t('wallets.toast_enter_name'), 'error')
      return
    }

    const saldoNum = parseFloat(newSaldoApertura)
    if (isNaN(saldoNum) || saldoNum < 0) {
      showToast(t('error_invalid_opening_balance'), 'error')
      return
    }

    const now = new Date()
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    try {
      await rpc('fn_crear_billetera', {
        p_nombre: newName,
        p_moneda: newMoneda,
        p_saldo_apertura: saldoNum,
        p_icono: newIcono,
        p_fecha_apertura: localDate
      })
      showToast(t('wallets.toast_created_success'), 'success')
      setShowCreateModal(false)
      // Resetear campos
      setNewName('')
      setNewMoneda('ARS')
      setNewSaldoApertura('0')
      setNewIcono('Wallet')
      fetchData()
    } catch (err: any) {
      showToast(t('wallets.toast_created_error', { error: err.message || err }), 'error')
    }
  }

  // Edición
  const getDisplayName = (nombre: string) =>
    nombre === 'wallet_cash_default_name'
      ? t('wallet_cash_default_name')
      : nombre

  const openEdit = (billetera: any) => {
    setSelectedBilletera(billetera)
    setOriginalName(billetera.nombre)
    setEditName(getDisplayName(billetera.nombre))
    setEditIcono(billetera.icono || 'Wallet')
    setShowEditModal(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBilletera) return
    if (!editName.trim()) {
      showToast(t('error_name_empty'), 'error')
      return
    }

    const nameToSave = (editName === getDisplayName(originalName) && originalName === 'wallet_cash_default_name')
      ? 'wallet_cash_default_name'
      : editName

    try {
      await rpc('fn_editar_billetera', {
        p_billetera_id: selectedBilletera.billetera_id,
        p_nombre: nameToSave,
        p_icono: editIcono
      })
      showToast(t('wallets.toast_updated_success'), 'success')
      setShowEditModal(false)
      fetchData()
    } catch (err: any) {
      showToast(t('wallets.toast_updated_error', { error: err.message || err }), 'error')
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
      showToast(t('wallets.toast_archived_success'), 'success')
      setShowEditModal(false)
      fetchData()
    } catch (err: any) {
      if (err.message?.includes('error_wallet_has_balance')) {
        showToast(t('wallets.toast_archived_with_balance_error'), 'error')
      } else {
        showToast(t('wallets.toast_archived_error', { error: err.message || err }), 'error')
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
          <span><CategoryIcon name="Briefcase" size={14} /></span> {t('wallets.tab_cuentas_ingreso')}
        </button>
        <button
          className={`cat-tab-btn ${activeMenuTab === 'categorias_egresos' ? 'active' : ''}`}
          onClick={() => setActiveMenuTab('categorias_egresos')}
        >
          <span><CategoryIcon name="Upload" size={14} /></span> {t('wallets.tab_categorias_egresos')}
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
                {t('wallets.btn_add_fuente')}
              </button>
              <button className="btn btn-primary btn-sm font-semibold" onClick={() => setShowCreateModal(true)}>
                {t('wallets.btn_add_cuenta')}
              </button>
            </div>
          </div>

          <div className="section">
            {/* ── WIDGET DE SALUD BANCARIA ── */}
            {alertasSalud.length > 0 && (
              <div className="health-widget">
                <h4 className="health-widget-title">
                  {t('wallets.health_title', { count: alertasSalud.length })}
                </h4>
                <div className="health-alerts-list">
                  {alertasSalud.map((b) => (
                    <div key={b.billetera_id} className="health-alert-item">
                      <div className="health-alert-text">
                        <strong>{t(b.nombre)}</strong>:{' '}
                        {b.alertas_keys.includes('negative_balance') && t('wallets.health_alert_negative_balance')}
                        {b.alertas_keys.includes('unreconciled') && t('wallets.health_alert_unreconciled')}
                        {b.alertas_keys.includes('no_movements') && t('wallets.health_alert_no_movements')}
                      </div>
                      <div className="flex gap-2">
                        {b.alertas_keys.includes('unreconciled') && (
                          <button className="btn btn-xs btn-primary text-xs" onClick={() => openConciliar(b)}>
                            <CategoryIcon name="Scale" size={12} /> {t('wallets.btn_conciliar')}
                          </button>
                        )}
                        {b.alertas_keys.includes('no_movements') && b.saldo_actual === 0 && (
                          <button className="btn btn-xs btn-secondary text-xs" onClick={() => openEdit(b)}>
                  <CategoryIcon name="Settings" size={14} /> {t('wallets.btn_archivar')}
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
                <CategoryIcon name="Wallet" size={48} />
                <h3>{t('wallets.empty_title')}</h3>
                <p>{t('wallets.empty_desc')}</p>
                <button className="btn btn-primary mt-4" onClick={() => setShowCreateModal(true)}>
                  {t('wallets.empty_btn_crear')}
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
                            <CategoryIcon name={b.icono || 'Wallet'} size={24} />
                            <span className={`dot dot-${sem.color} billetera-item-semaforo`} />
                          </div>
                          <div className="billetera-item-info">
                            <div className="billetera-item-name">
                              <span className="billetera-name-text">{t(b.nombre)}</span>
                              {b.es_fondo_prevision && <span className="prevision-badge">{t('badge_prevision_fund')}</span>}
                              {b.saldo_inicial_pendiente && <span className="prevision-badge">{t('wallet_pending_initial_balance_badge')}</span>}
                            </div>
                            <div className="billetera-item-type">
                              <span>{b.moneda === 'USD' ? t('wallets.moneda_usd') : t('wallets.moneda_ars')}</span>
                              <span>•</span>
                              <span style={{ color: `var(--text-3)`, fontWeight: 600 }}>
                                {sem.text} {sem.days !== null && (sem.days === 0 ? t('wallets.sem_hace_hoy') : t('wallets.sem_hace_dias', { days: sem.days }))}
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
                          <CategoryIcon name="Scale" size={14} /> {t('wallets.btn_conciliar')}
                        </button>
                        <button className="btn-billetera-action" onClick={() => openEdit(b)}>
                          <CategoryIcon name="Settings" size={14} /> {t('wallets.btn_editar')}
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
            <h2 className="font-display" style={{ fontSize: 'calc(20px * var(--font-scale))' }}>{t('wallets.header_fuentes_ingreso')}</h2>
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
                <h3 className="font-display" style={{ fontSize: 'calc(18px * var(--font-scale))', margin: 0 }}>{t('wallets.modal_nueva_title')}</h3>
                <button type="button" className="text-xs text-muted" onClick={() => setShowCreateModal(false)}>{t('wallets.btn_cerrar_x')}</button>
              </div>

              <div className="form-group mb-3">
                <label className="text-xs text-muted mb-1 block font-semibold">{t('wallets.label_nombre')}</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('wallets.placeholder_nombre')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  required
                  enterKeyHint="next"
                />
              </div>

              <div className="form-group mb-3">
                <label className="text-xs text-muted mb-1 block font-semibold">{t('wallets.label_saldo_apertura')}</label>
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
                <label className="text-xs text-muted mb-1 block font-semibold">{t('wallets.label_moneda')}</label>
                <select className="form-control" value={newMoneda} onChange={(e) => setNewMoneda(e.target.value)}>
                  <option value="ARS">{t('wallets.option_moneda_ars')}</option>
                  <option value="USD">{t('option_usd_currency')}</option>
                </select>
              </div>

              <div className="form-group mb-4">
                <label className="text-xs text-muted mb-2 block font-semibold">{t('wallets.label_icono')}</label>
                <div className="emojis-picker-grid">
                  {WALLET_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      className={`emoji-select-btn ${newIcono === icon ? 'active' : ''}`}
                      onClick={() => setNewIcono(icon)}
                      aria-label={icon}
                    >
                      <CategoryIcon name={icon} size={28} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowCreateModal(false)}>
                  {t('wallets.btn_cancelar')}
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {t('wallets.btn_crear')}
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
                <h3 className="font-display" style={{ fontSize: 'calc(18px * var(--font-scale))', margin: 0 }}>{t('wallets.modal_editar_title', { nombre: selectedBilletera.nombre })}</h3>
                <button type="button" className="text-xs text-muted" onClick={() => setShowEditModal(false)}>{t('wallets.btn_cerrar_x')}</button>
              </div>

              <div className="form-group mb-3">
                <label className="text-xs text-muted mb-1 block font-semibold">{t('wallets.label_nombre')}</label>
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
                <label className="text-xs text-muted mb-2 block font-semibold">{t('wallets.label_icono')}</label>
                <div className="emojis-picker-grid">
                  {WALLET_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      className={`emoji-select-btn ${editIcono === icon ? 'active' : ''}`}
                      onClick={() => setEditIcono(icon)}
                      aria-label={icon}
                    >
                      <CategoryIcon name={icon} size={28} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowEditModal(false)}>
                    {t('wallets.btn_cancelar')}
                  </button>
                  <button type="submit" className="btn btn-primary flex-1">
                    {t('wallets.btn_guardar_cambios')}
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
                  <CategoryIcon name="Settings" size={14} /> {t('wallets.btn_archivar')}
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
        title={t('wallets.btn_archivar')}
        message={t('confirm_archive_wallet', { name: selectedBilletera?.nombre })}
        confirmText={t('wallets.btn_archivar')}
        cancelText={t('wallets.btn_cancelar')}
        type="danger"
        onConfirm={confirmArchivar}
        onCancel={() => setShowConfirmArchive(false)}
      />
    </div>
  )
}
