import { useState, useEffect, useCallback, useMemo } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { CategoryIcon } from '@/components/CategoryIcon'
import { WalletIcon } from '@/components/WalletIcon'
import { WalletDropdownSelect } from '@/components/WalletDropdownSelect'
import './Tarjetas.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapaTarjeta {
  tarjeta_id: number
  nombre_tarjeta: string
  limite_un_pago_total: number
  un_pago_disponible: number
  limite_cuotas_total: number
  cuotas_disponible: number
  estado_config: string
  dia_cierre?: number
  dia_vencimiento?: number
  banco?: string
  color?: string
}

interface VencimientoTarjeta {
  tarjeta_id: number
  nombre_tarjeta: string
  dia_vencimiento: number
  dias_para_vencimiento: number
  monto_a_pagar: number
  estado_urgencia_key: string
  mensaje_key: string
}

interface Termometro {
  nombre_tarjeta: string
  indice_estres: number
  capacidad_pago_promedio: number
  saldo_actual_total: number
  cuota_proxima: number
  estado_alerta: string
  estado_mensaje: string
}

interface PagoHistorial {
  pago_id: number
  fecha: string
  tarjeta_nombre: string
  monto_pagado: number
  billetera_origen: string
  cuotas_liquidadas: number
  observaciones: string | null
}

interface ComparativaTarjeta {
  tarjeta_id: number
  nombre_tarjeta: string
  gasto_mes_anterior: number
  gasto_mes_actual: number
  variacion_absoluta: number
  variacion_porcentual: number
  tendencia_key: string
  mensaje_key: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CARD_COLORS = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB',
  '#1E88E5', '#039BE5', '#00ACC1', '#00897B', '#43A047',
  '#7CB342', '#C0CA33', '#FDD835', '#FFB300', '#FB8C00',
  '#F4511E', '#6D4C41', '#757575', '#546E7A', '#000000'
]

const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

function fmtARS(n: number) { return fmt.format(Number(n) || 0) }

function getMonthName(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function getUsoPct(total: number, disponible: number): number {
  if (!total || total === 0) return 0
  return Math.min(100, Math.round(((total - disponible) / total) * 100))
}

function getProgressClass(pct: number) {
  if (pct >= 90) return 'danger'
  if (pct >= 70) return 'warning'
  return 'safe'
}

function getSemaforoClass(alerta: string) {
  if (alerta === 'green') return 'semaforo-green'
  if (alerta === 'yellow') return 'semaforo-yellow'
  return 'semaforo-red'
}

function getSemaforoLabel(alerta: string) {
  if (alerta === 'green') return 'Saludable'
  if (alerta === 'yellow') return t('card_status_caution')
  return 'En Riesgo'
}

function getSemaforoIcon(alerta: string) {
  if (alerta === 'green') return 'CircleDollarSign'
  if (alerta === 'yellow') return 'BarChart3'
  return 'TriangleAlert'
}

function getUrgencyMsg(key: string, dias: number): string {
  const map: Record<string, string> = {
    msg_vencimiento_critico: t('card_due_critical', { dias }),
    msg_vencimiento_urgente: t('card_due_urgent', { dias }),
    msg_vencimiento_precaucion: t('card_due_caution', { dias }),
  }
  return map[key] || t('card_due_normal', { dias })
}

function getTendenciaMsg(key: string): string {
  const map: Record<string, string> = {
    alert_card_overuse: 'Uso excesivo vs mes anterior',
    alert_card_savings: 'Redujiste el uso significativamente',
    alert_card_stable: 'Uso estable respecto al mes anterior',
  }
  return map[key] || ''
}

function getTermMsg(key: string): string {
  const map: Record<string, string> = {
    msg_learning_data: t('card_learning_data'),
    msg_sufficient_balance_high_expenses: t('card_sufficient_balance_high_expenses'),
    msg_insufficient_balance_deficit: t('card_insufficient_balance_deficit'),
    msg_sufficient_balance_future_compromise: 'Tienes saldo hoy, pero compromisos futuros preocupantes.',
    msg_high_quota_insufficient_balance: 'La cuota es alta respecto a tu capacidad de pago habitual.',
    ok: t('card_status_ok'),
  }
  return map[key] || key
}

function getNextVencimientoDate(diaCierre: number, diaVencimiento: number): Date {
  const hoy = new Date()
  const añoHoy = hoy.getFullYear()
  const mesHoy = hoy.getMonth()
  const diaHoy = hoy.getDate()

  let finCiclo: Date
  if (diaHoy <= diaCierre) {
    finCiclo = new Date(añoHoy, mesHoy, diaCierre - 1)
  } else {
    finCiclo = new Date(añoHoy, mesHoy + 1, diaCierre - 1)
  }

  const añoFin = finCiclo.getFullYear()
  const mesFin = finCiclo.getMonth()

  let vencimientoCiclo: Date
  if (diaVencimiento <= diaCierre) {
    vencimientoCiclo = new Date(añoFin, mesFin + 1, diaVencimiento)
  } else {
    vencimientoCiclo = new Date(añoFin, mesFin, diaVencimiento)
  }

  return vencimientoCiclo
}

function getDiasParaProximoVencimiento(card: MapaTarjeta): number {
  if (card.dia_cierre === undefined || card.dia_cierre === null ||
      card.dia_vencimiento === undefined || card.dia_vencimiento === null) {
    return Infinity
  }
  const venc = getNextVencimientoDate(card.dia_cierre, card.dia_vencimiento)
  const hoy = new Date()
  const hoySoloFecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const diffTime = venc.getTime() - hoySoloFecha.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function TarjetasPage() {
  const { showToast } = useToast()

  // ── Data ──
  const [tarjetas, setTarjetas] = useState<MapaTarjeta[]>([])
  const [vencimientos, setVencimientos] = useState<VencimientoTarjeta[]>([])
  const [billeteras, setBilleteras] = useState<any[]>([])
  const [cotizacionUsd, setCotizacionUsd] = useState<number>(1)
  const [totalPasivo, setTotalPasivo] = useState<number>(0)
  const [comparativa, setComparativa] = useState<ComparativaTarjeta[]>([])
  const [loading, setLoading] = useState(true)

  // ── Vista ──
  const [activeTab, setActiveTab] = useState<'lista' | 'comparativa' | 'acreedores'>('lista')
  const [acreedores, setAcreedores] = useState<any[]>([])
  const [selectedCard, setSelectedCard] = useState<MapaTarjeta | null>(null)

  // ── Detalle ──
  const [termometro, setTermometro] = useState<Termometro | null>(null)
  const [historial, setHistorial] = useState<PagoHistorial[]>([])
  const [cuotasActivas, setCuotasActivas] = useState<any[]>([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  // ── Menú contextual ──
  const [menuOpen, setMenuOpen] = useState<number | null>(null)

  // ── Modales ──
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPagarModal, setShowPagarModal] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [targetCard, setTargetCard] = useState<MapaTarjeta | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedCards, setArchivedCards] = useState<any[]>([])

  // ── Formulario Crear / Editar ──
  const [formNombre, setFormNombre] = useState('')
  const [formBanco, setFormBanco] = useState('')
  const [formDiaVenc, setFormDiaVenc] = useState('10')
  const [formDiaCierre, setFormDiaCierre] = useState('5')
  const [formLimiteUnPago, setFormLimiteUnPago] = useState('')
  const [formLimiteCuotas, setFormLimiteCuotas] = useState('')
  const [formColor, setFormColor] = useState(CARD_COLORS[0])
  const [formRecargoDolar, setFormRecargoDolar] = useState('30')
  const [formSubmitting, setFormSubmitting] = useState(false)

  // ── Formulario Pagar ──
  const [pagarMonto, setPagarMonto] = useState('')
  const [pagarFecha, setPagarFecha] = useState(() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })
  const [pagarBilleteraId, setPagarBilleteraId] = useState<number | null>(null)

  // ─────────────────────────────────────────────────────────────────────────────
  // Data fetching
  // ─────────────────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [resT, resV, resB, resUsd, pasivoRes, comparativaRes, acreedoresRes, archivedRes] = await Promise.all([
        rpc<MapaTarjeta[]>('fn_reporte_mapa_tarjetas').catch(() => [] as MapaTarjeta[]),
        rpc<VencimientoTarjeta[]>('fn_reporte_vencimientos_tarjetas').catch(() => [] as VencimientoTarjeta[]),
        rpc<any[]>('fn_obtener_billeteras_activas').catch(() => [] as any[]),
        rpc<number>('fn_obtener_cotizacion_usd').catch(() => 1),
        rpc<number>('fn_obtener_saldo_pasivo_tarjetas').catch(() => 0),
        rpc<ComparativaTarjeta[]>('fn_reporte_comparativa_tarjetas').catch(() => [] as ComparativaTarjeta[]),
        rpc<any[]>('fn_reporte_mapa_acreedores').catch(() => [] as any[]),
        rpc<any[]>('fn_reporte_tarjetas_archivadas').catch(() => [] as any[]),
      ])
      setTarjetas(resT || [])
      setVencimientos(resV || [])
      setBilleteras((resB || []).filter((b: any) => !b.es_fondo_prevision))
      setCotizacionUsd(resUsd || 1)
      setTotalPasivo(Number(pasivoRes) || 0)
      setComparativa(comparativaRes || [])
      setAcreedores(acreedoresRes || [])
      setArchivedCards(archivedRes || [])
    } catch (err: any) {
      showToast('Error al cargar tarjetas: ' + parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const fetchDetalle = useCallback(async (tarjetaId: number) => {
    try {
      setLoadingDetalle(true)
      const [termRes, histRes, cuotasRes] = await Promise.all([
        rpc<Termometro[]>('fn_reporte_termometro_tarjeta', { p_tarjeta_id: tarjetaId }).catch(() => [] as Termometro[]),
        rpc<PagoHistorial[]>('fn_reporte_historial_pagos_tarjetas').catch(() => [] as PagoHistorial[]),
        rpc<any[]>('fn_reporte_compromisos_tarjeta', { p_tarjeta_id: tarjetaId }).catch(() => [] as any[]),
      ])
      setTermometro(termRes?.[0] || null)
      setCuotasActivas(cuotasRes || [])
      // Filter historial by this card
      setHistorial((histRes || []).filter((h: PagoHistorial) => {
        const card = tarjetas.find(t => t.tarjeta_id === tarjetaId)
        return !card || h.tarjeta_nombre === card.nombre_tarjeta
      }))
    } catch (err: any) {
      showToast('Error al cargar detalle: ' + parseError(err), 'error')
    } finally {
      setLoadingDetalle(false)
    }
  }, [showToast, tarjetas])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (selectedCard) {
      fetchDetalle(selectedCard.tarjeta_id)
    }
  }, [selectedCard]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleSuccess = () => {
      fetchData()
      if (selectedCard) {
        fetchDetalle(selectedCard.tarjeta_id)
      }
    }
    window.addEventListener('movement-added', handleSuccess)
    return () => {
      window.removeEventListener('movement-added', handleSuccess)
    }
  }, [fetchData, fetchDetalle, selectedCard])

  useEffect(() => {
    if (selectedCard && tarjetas.length > 0) {
      const freshCard = tarjetas.find(t => t.tarjeta_id === selectedCard.tarjeta_id)
      if (freshCard && JSON.stringify(freshCard) !== JSON.stringify(selectedCard)) {
        setSelectedCard(freshCard)
      }
    }
  }, [tarjetas, selectedCard])

  // ─────────────────────────────────────────────────────────────────────────────
  // Vencimiento data merged with tarjeta list
  // ─────────────────────────────────────────────────────────────────────────────

  const vencimientoByCard = useMemo(() => {
    const map: Record<number, VencimientoTarjeta> = {}
    vencimientos.forEach(v => { map[v.tarjeta_id] = v })
    return map
  }, [vencimientos])

  const criticalAlerts = useMemo(
    () => vencimientos.filter(v => (v.estado_urgencia_key === 'critical' || v.estado_urgencia_key === 'urgent') && Number(v.monto_a_pagar) > 0),
    [vencimientos]
  )

  const sortedTarjetas = useMemo(() => {
    return [...tarjetas].sort((a, b) => {
      const diasA = getDiasParaProximoVencimiento(a)
      const diasB = getDiasParaProximoVencimiento(b)
      if (diasA !== diasB) {
        return diasA - diasB
      }
      return a.nombre_tarjeta.localeCompare(b.nombre_tarjeta)
    })
  }, [tarjetas])

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers for form reset
  // ─────────────────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormNombre(''); setFormBanco(''); setFormDiaVenc('10'); setFormDiaCierre('5')
    setFormLimiteUnPago(''); setFormLimiteCuotas(''); setFormColor(CARD_COLORS[0]); setFormRecargoDolar('30')
  }

  const openEdit = (card: MapaTarjeta) => {
    setTargetCard(card)
    setFormNombre(card.nombre_tarjeta)
    setFormBanco(card.banco || '')
    setFormDiaVenc(card.dia_vencimiento?.toString() || '10')
    setFormDiaCierre(card.dia_cierre?.toString() || '5')
    setFormLimiteUnPago(card.limite_un_pago_total?.toString() || '')
    setFormLimiteCuotas(card.limite_cuotas_total?.toString() || '')
    setFormColor(card.color || CARD_COLORS[0])
    setFormRecargoDolar((card as any).recargo_dolar_pct?.toString() || '30')
    setMenuOpen(null)
    setShowEditModal(true)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!formNombre.trim()) { showToast('Ingresa el nombre de la tarjeta', 'error'); return }
    try {
      setFormSubmitting(true)
      await rpc('fn_crear_tarjeta_credito', {
        p_nombre_tarjeta: formNombre.trim(),
        p_banco: formBanco.trim() || 'Sin banco',
        p_dia_vencimiento: parseInt(formDiaVenc) || 10,
        p_dia_cierre: parseInt(formDiaCierre) || 5,
        p_limite_un_pago: formLimiteUnPago ? parseFloat(formLimiteUnPago) : null,
        p_limite_cuotas: formLimiteCuotas ? parseFloat(formLimiteCuotas) : null,
        p_color: formColor,
        p_recargo_dolar_pct: parseFloat(formRecargoDolar) || 30.00,
      })
      showToast('Tarjeta creada correctamente', 'success')
      setShowCreateModal(false)
      resetForm()
      fetchData()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!targetCard) return
    try {
      setFormSubmitting(true)
      await rpc('fn_editar_tarjeta_credito', {
        p_tarjeta_id: targetCard.tarjeta_id,
        p_nombre_tarjeta: formNombre.trim() || null,
        p_banco: formBanco.trim() || null,
        p_dia_vencimiento: formDiaVenc ? parseInt(formDiaVenc) : null,
        p_dia_cierre: formDiaCierre ? parseInt(formDiaCierre) : null,
        p_limite_un_pago: formLimiteUnPago ? parseFloat(formLimiteUnPago) : null,
        p_limite_cuotas: formLimiteCuotas ? parseFloat(formLimiteCuotas) : null,
        p_color: formColor || null,
        p_recargo_dolar_pct: formRecargoDolar ? parseFloat(formRecargoDolar) : null,
      })
      showToast('Tarjeta actualizada', 'success')
      setShowEditModal(false)
      fetchData()
      if (selectedCard?.tarjeta_id === targetCard.tarjeta_id) {
        fetchDetalle(targetCard.tarjeta_id)
      }
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handlePagar = async () => {
    const monto = parseFloat(pagarMonto)
    if (isNaN(monto) || monto <= 0) { showToast(t('error_invalid_amount'), 'error'); return }
    if (!pagarBilleteraId) { showToast(t('toast_select_source_wallet'), 'error'); return }
    if (!targetCard) return
    try {
      setFormSubmitting(true)
      await rpc('fn_registrar_pago_tarjeta', {
        p_tarjeta_id: targetCard.tarjeta_id,
        p_monto: monto,
        p_billetera_id: pagarBilleteraId,
        p_fecha_pago: pagarFecha,
      })
      showToast('Pago registrado. Las cuotas del ciclo fueron liquidadas.', 'success')
      setShowPagarModal(false)
      setPagarMonto('')
      fetchData()
      if (selectedCard?.tarjeta_id === targetCard.tarjeta_id) {
        fetchDetalle(targetCard.tarjeta_id)
      }
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleArchive = async () => {
    if (!targetCard) return
    try {
      await rpc('fn_archivar_tarjeta_credito', { p_tarjeta_id: targetCard.tarjeta_id })
      showToast('Tarjeta archivada', 'success')
      setShowArchiveConfirm(false)
      if (selectedCard?.tarjeta_id === targetCard.tarjeta_id) setSelectedCard(null)
      fetchData()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleReactivar = async (tarjetaId: number) => {
    try {
      setLoading(true)
      await rpc('fn_desarchivar_tarjeta_credito', { p_tarjeta_id: tarjetaId })
      showToast(t('card_reactivated_success'), 'success')
      fetchData()
    } catch (err: any) {
      showToast('Error al reactivar tarjeta: ' + parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sub-components (inlined for DRY within module)
  // ─────────────────────────────────────────────────────────────────────────────

  const TarjetaCardItem = ({ tc }: { tc: MapaTarjeta }) => {
    const usoPct = getUsoPct(tc.limite_un_pago_total, tc.un_pago_disponible)
    const progressClass = getProgressClass(usoPct)
    const venc = vencimientoByCard[tc.tarjeta_id]

    // Semáforo simple basado en uso
    const semaforoClass = usoPct >= 90 ? 'semaforo-red' : usoPct >= 70 ? 'semaforo-yellow' : 'semaforo-green'
    const semaforoLabel = usoPct >= 90 ? 'Alto' : usoPct >= 70 ? 'Moderado' : 'Saludable'
    const semaforoIcon = usoPct >= 90 ? 'TriangleAlert' : usoPct >= 70 ? 'BarChart3' : 'CircleDollarSign'

    const isConfigRequired = tc.estado_config === 'requires_configuration'

    return (
      <div
        className="tarjeta-card"
        onClick={() => { setSelectedCard(tc); setMenuOpen(null) }}
      >
        <div className="tarjeta-card-accent" style={{ background: tc.color || '#FF6B6B' }} />

        <div className="tarjeta-card-header">
          <div className="tarjeta-card-name-row">
            <div className="tarjeta-card-icon" style={{ background: `${tc.color || '#FF6B6B'}24` }}><CategoryIcon name="CreditCard" size={16} /></div>
            <div>
              <div className="tarjeta-card-name">{tc.nombre_tarjeta}</div>
              {tc.dia_vencimiento && tc.dia_cierre && (
                <div className="tarjeta-card-banco">
                  {t('card_vence_label')}: {tc.dia_vencimiento} · {t('card_cierre_label', { day: tc.dia_cierre })} · {getDiasParaProximoVencimiento(tc)} {t('card_dias_label')}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div className={`tarjeta-semaforo ${semaforoClass}`}><CategoryIcon name={semaforoIcon} size={12} /> {semaforoLabel}</div>
            <button
              className="tarjeta-detalle-action-btn"
              style={{ width: 28, height: 28, fontSize: 'calc(14px * var(--font-scale))' }}
              onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === tc.tarjeta_id ? null : tc.tarjeta_id) }}
              aria-label={t("aria_label_card_menu")}
            >⋮</button>
          </div>
        </div>

        {isConfigRequired ? (
          <div className="tarjeta-config-required" onClick={e => { e.stopPropagation(); openEdit(tc) }}>
            <CategoryIcon name="Settings" size={14} /> {t("card_configure_limits_analysis")} →
          </div>
        ) : (
          <>
            <div className="tarjeta-progress-row">
              <span className="tarjeta-progress-label">{t("card_monthly_limit_used")}</span>
              <span className={`tarjeta-progress-pct ${progressClass === 'danger' ? 'text-coral' : ''}`}>{usoPct}%</span>
            </div>
            <div className="tarjeta-progress-bar">
              <div className={`tarjeta-progress-fill ${progressClass}`} style={{ width: `${usoPct}%` }} />
            </div>

            <div className="tarjeta-card-footer">
              <div className="tarjeta-footer-item">
                <CategoryIcon name="CircleDollarSign" size={14} /> Disponible: <b>{fmtARS(tc.un_pago_disponible)}</b>
              </div>
              <div className="tarjeta-footer-item">
                <CategoryIcon name="ClipboardList" size={14} /> Cuotas: <b>{fmtARS(tc.cuotas_disponible)}</b>
              </div>
            </div>
          </>
        )}

        {/* Menú contextual */}
        {menuOpen === tc.tarjeta_id && (
          <div className="tarjeta-context-menu" onClick={e => e.stopPropagation()}>
            <button className="tarjeta-context-btn" onClick={() => openEdit(tc)}><CategoryIcon name="Pencil" size={14} /> Editar tarjeta</button>
            <button className="tarjeta-context-btn" onClick={() => {
              setTargetCard(tc)
              setPagarMonto(venc ? venc.monto_a_pagar.toString() : '')
              setPagarBilleteraId(null)
              setMenuOpen(null)
              setShowPagarModal(true)
            }}><CategoryIcon name="CreditCard" size={14} /> Pagar resumen</button>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Vista Detalle
  // ─────────────────────────────────────────────────────────────────────────────

  if (selectedCard) {
    const usoPct = getUsoPct(selectedCard.limite_un_pago_total, selectedCard.un_pago_disponible)
    const progressClass = getProgressClass(usoPct)
    const venc = vencimientoByCard[selectedCard.tarjeta_id]

    return (
      <div className="page tarjetas-view">
        {/* Header */}
        <div className="tarjeta-detalle-header">
          <button className="tarjeta-detalle-back" onClick={() => setSelectedCard(null)}>←</button>
          <span className="tarjeta-detalle-title"><CategoryIcon name="CreditCard" size={18} /> {selectedCard.nombre_tarjeta}</span>
          <div className="tarjeta-detalle-actions">
            <button className="tarjeta-detalle-action-btn" onClick={() => openEdit(selectedCard)} title="Editar"><CategoryIcon name="Pencil" size={18} /></button>
          </div>
        </div>

        <div className="tarjetas-scroll">

          {/* Widget de Límite Disponible */}
          <div className="tarjeta-detalle-section">
            <div className="tarjeta-detalle-section-title"><CategoryIcon name="CircleDollarSign" size={13} /> {t("card_available_limit")}</div>
            <div className="limite-row">
              <div className="limite-disponible">{fmtARS(selectedCard.un_pago_disponible)}</div>
              <div className="limite-total">de {fmtARS(selectedCard.limite_un_pago_total)}</div>
            </div>
            <div className="tarjeta-progress-bar" style={{ height: 8 }}>
              <div className={`tarjeta-progress-fill ${progressClass}`} style={{ width: `${usoPct}%` }} />
            </div>

            {/* Próximo Vencimiento */}
            {venc && (
              <div className="vencimiento-widget" style={{ marginTop: 14 }}>
                <div className="vencimiento-info">
                    <div className="vencimiento-label"><CategoryIcon name="Calendar" size={13} /> {t("card_next_due_date")}</div>
                  <div className="vencimiento-date">{t("card_due_date_format", { day: venc.dia_vencimiento, days: venc.dias_para_vencimiento })}</div>
                  <div className="vencimiento-monto">Estimado: {fmtARS(venc.monto_a_pagar)}</div>
                </div>
                <button className="btn-pagar-resumen" onClick={() => {
                  setTargetCard(selectedCard)
                  setPagarMonto(venc.monto_a_pagar.toString())
                  setPagarBilleteraId(null)
                  setShowPagarModal(true)
                }}>
                  Pagar Resumen
                </button>
              </div>
            )}
          </div>

          {/* Termómetro de Estrés */}
          <div className="termometro-widget">
            <div className="termometro-header">
              <span className="termometro-title"><CategoryIcon name="BarChart3" size={13} /> {t("card_stress_thermometer")}</span>
              {termometro && (
                <span className={`termometro-badge ${termometro.estado_alerta}`}>
                  <CategoryIcon name={getSemaforoIcon(termometro.estado_alerta)} size={12} /> {getSemaforoLabel(termometro.estado_alerta)}
                </span>
              )}
            </div>

            {loadingDetalle ? (
              <div className="tarjeta-skeleton" style={{ height: 40 }} />
            ) : termometro ? (
              <>
                <div className="termometro-bar-wrapper">
                  <div
                    className={`termometro-bar-fill ${termometro.estado_alerta}`}
                    style={{ width: `${Math.min(100, Number(termometro.indice_estres))}%` }}
                  />
                </div>
                <div className="termometro-metrics">
                  <div className="termometro-metric">
                    <div className="termometro-metric-value">{Number(termometro.indice_estres).toFixed(0)}%</div>
                    <div className="termometro-metric-label">{t("card_stress_index")}</div>
                  </div>
                  <div className="termometro-metric">
                    <div className="termometro-metric-value">{fmtARS(termometro.cuota_proxima)}</div>
                    <div className="termometro-metric-label">{t("card_next_installment")}</div>
                  </div>
                  <div className="termometro-metric">
                    <div className="termometro-metric-value">{fmtARS(termometro.capacidad_pago_promedio)}</div>
                    <div className="termometro-metric-label">Cap. de pago</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 'calc(13px * var(--font-scale))', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {getTermMsg(termometro.estado_mensaje)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 'calc(13px * var(--font-scale))', color: 'var(--color-text-muted)' }}>{t("card_insufficient_data_analysis")}</div>
            )}
          </div>

          {/* Cuotas Activas */}
          <div className="tarjeta-detalle-section">
            <div className="tarjeta-detalle-section-title"><CategoryIcon name="ShoppingBag" size={13} /> Cuotas Pendientes</div>
            {loadingDetalle ? (
              <div className="tarjeta-skeleton" style={{ height: 80 }} />
            ) : cuotasActivas.filter(c => !c.pagado).length === 0 ? (
              <div style={{ fontSize: 'calc(13px * var(--font-scale))', color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>
                No tienes compras en cuotas pendientes para esta tarjeta.
              </div>
            ) : (
              <div className="historial-list">
                {cuotasActivas.filter(c => !c.pagado).map((c: any) => {
                  const parts = c.fecha_estimada_pago ? c.fecha_estimada_pago.split('-') : []
                  const dueDateStr = parts[1] ? new Date(c.fecha_estimada_pago + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '--'
                  return (
                    <div key={c.cuota_id} className="historial-item" style={{ alignItems: 'center' }}>
                      <div className="historial-item-info">
                        <div className="historial-item-card">{!c.caja_id ? t('msg_refinanciacion_pago_minimo') : (c.descripcion || t('msg_compra_en_cuotas_default'))}</div>
                        <div className="historial-item-source">Cuota {c.posicion_cuota} de {c.total_cuotas} • Vence el {dueDateStr}</div>
                      </div>
                      <div className="historial-item-monto" style={{ color: 'var(--coral)' }}>
                        {fmtARS(c.monto_cuota)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Historial de Pagos */}
          <div className="tarjeta-detalle-section">
            <div className="tarjeta-detalle-section-title"><CategoryIcon name="ScrollText" size={13} /> Historial de Pagos</div>
            {loadingDetalle ? (
              <div className="tarjeta-skeleton" style={{ height: 80 }} />
            ) : historial.length === 0 ? (
              <div style={{ fontSize: 'calc(13px * var(--font-scale))', color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>
                Sin pagos registrados para esta tarjeta
              </div>
            ) : (
              <div className="historial-list">
                {historial.slice(0, 10).map(h => {
                  const parts = h.fecha ? h.fecha.split('-') : []
                  const day = parts[2] || '--'
                  const month = parts[1] ? new Date(h.fecha + 'T00:00:00').toLocaleDateString('es-AR', { month: 'short' }) : '--'
                  return (
                    <div key={h.pago_id} className="historial-item">
                      <div className="historial-item-date">
                        <div className="historial-item-day">{day}</div>
                        <div className="historial-item-month">{month}</div>
                      </div>
                      <div className="historial-item-info">
                        <div className="historial-item-card">{h.tarjeta_nombre}</div>
                        {h.billetera_origen && (
                          <div className="historial-item-source">desde {h.billetera_origen}</div>
                        )}
                        {h.cuotas_liquidadas > 0 && (
                          <span className="historial-item-badge"><CategoryIcon name="CheckCircle2" size={11} /> {h.cuotas_liquidadas} cuotas liquidadas</span>
                        )}
                      </div>
                      <div className="historial-item-monto">{fmtARS(h.monto_pagado)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modales desde el detalle */}
        {showEditModal && (
          <TarjetaFormModal
            isEdit={true}
            onClose={() => setShowEditModal(false)}
            onSubmit={handleEdit}
            onArchive={() => {
              setShowEditModal(false)
              setShowArchiveConfirm(true)
            }}
            formNombre={formNombre}
            setFormNombre={setFormNombre}
            formBanco={formBanco}
            setFormBanco={setFormBanco}
            formDiaCierre={formDiaCierre}
            setFormDiaCierre={setFormDiaCierre}
            formDiaVenc={formDiaVenc}
            setFormDiaVenc={setFormDiaVenc}
            formLimiteUnPago={formLimiteUnPago}
            setFormLimiteUnPago={setFormLimiteUnPago}
            formLimiteCuotas={formLimiteCuotas}
            setFormLimiteCuotas={setFormLimiteCuotas}
            formColor={formColor}
            setFormColor={setFormColor}
            formRecargoDolar={formRecargoDolar}
            setFormRecargoDolar={setFormRecargoDolar}
            formSubmitting={formSubmitting}
          />
        )}
        {showPagarModal && (
          <PagarModal
            onClose={() => setShowPagarModal(false)}
            onSubmit={handlePagar}
            targetCard={targetCard}
            pagarMonto={pagarMonto}
            setPagarMonto={setPagarMonto}
            pagarFecha={pagarFecha}
            setPagarFecha={setPagarFecha}
            formSubmitting={formSubmitting}
            billeteras={billeteras}
            pagarBilleteraId={pagarBilleteraId}
            setPagarBilleteraId={setPagarBilleteraId}
          />
        )}
        {showArchiveConfirm && (
          <ConfirmModal
            isOpen={showArchiveConfirm}
            title="Archivar tarjeta"
            message={`t("card_archive_confirm_pending", { name: targetCard?.nombre_tarjeta })`}
            confirmText="Archivar"
            type="danger"
            onConfirm={handleArchive}
            onCancel={() => setShowArchiveConfirm(false)}
          />
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Vista Lista
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="page tarjetas-view">
      {/* Header */}
      <div className="tarjetas-view-header">
        <div className="tarjetas-view-title"><CategoryIcon name="CreditCard" size={22} /> Mis Tarjetas</div>
        <button className="tarjetas-btn-new" onClick={() => { resetForm(); setShowCreateModal(true) }}>
          + Nueva
        </button>
      </div>

      <div className="tarjetas-scroll">

        {/* Widget Deuda Total */}
        {loading ? (
          <div className="tarjeta-skeleton" style={{ height: 80, marginBottom: 16 }} />
        ) : (
          <div className="tarjetas-debt-widget">
            <div>
              <div className="tarjetas-debt-label">Deuda Total en Cuotas</div>
              <div className="tarjetas-debt-amount">{fmtARS(totalPasivo)}</div>
              <div className="tarjetas-debt-meta">{tarjetas.length} tarjeta{tarjetas.length !== 1 ? 's' : ''} activa{tarjetas.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="tarjetas-debt-icon"><CategoryIcon name="CreditCard" size={36} /></div>
          </div>
        )}

        {/* Alertas de Vencimiento */}
        {criticalAlerts.length > 0 && (
          <>
            <div className="tarjetas-section-title"><CategoryIcon name="AlertTriangle" size={13} /> Alertas de Vencimiento</div>
            <div className="tarjetas-alerts">
              {criticalAlerts.map(v => (
                <div
                  key={v.tarjeta_id}
                  className={`tarjetas-alert-item ${v.estado_urgencia_key}`}
                  onClick={() => {
                    const card = tarjetas.find(t => t.tarjeta_id === v.tarjeta_id)
                    if (card) setSelectedCard(card)
                  }}
                >
                  <div className="tarjetas-alert-dot" />
                  <div className="tarjetas-alert-info">
                    <div className="tarjetas-alert-name">{v.nombre_tarjeta}</div>
                    <div className="tarjetas-alert-msg">{getUrgencyMsg(v.mensaje_key, v.dias_para_vencimiento)}</div>
                  </div>
                  <div className="tarjetas-alert-monto">
                    <div className="tarjetas-alert-monto-value">{fmtARS(v.monto_a_pagar)}</div>
                    <div className="tarjetas-alert-days">{t("card_days_format", { days: v.dias_para_vencimiento })}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Tabs */}
        <div className="tarjetas-tabs">
          <button className={`tarjetas-tab ${activeTab === 'lista' ? 'active' : ''}`} onClick={() => setActiveTab('lista')}>
            Mis Tarjetas
          </button>
          <button className={`tarjetas-tab ${activeTab === 'comparativa' ? 'active' : ''}`} onClick={() => setActiveTab('comparativa')}>
            <CategoryIcon name="BarChart3" size={13} /> Comparativa
          </button>
          <button className={`tarjetas-tab ${activeTab === 'acreedores' ? 'active' : ''}`} onClick={() => setActiveTab('acreedores')}>
            <CategoryIcon name="Map" size={13} /> Acreedores
          </button>
        </div>

        {/* Lista de Tarjetas */}
        {activeTab === 'lista' && (
          <>
            {loading ? (
              <div className="tarjetas-list">
                {[1, 2].map(i => <div key={i} className="tarjeta-skeleton" style={{ height: 140 }} />)}
              </div>
            ) : tarjetas.length === 0 ? (
              <div className="tarjetas-empty">
                <div className="tarjetas-empty-icon"><CategoryIcon name="CreditCard" size={56} /></div>
                <h3>{t("card_empty_state_title")}</h3>
                <p>{t("card_empty_state_desc")}</p>
                <button className="tarjetas-empty-btn" onClick={() => { resetForm(); setShowCreateModal(true) }}>
                  + Agregar Tarjeta
                </button>
              </div>
            ) : (
              <div
                className="tarjetas-list"
                onClick={() => setMenuOpen(null)}
              >
                {sortedTarjetas.map(tc => <TarjetaCardItem key={tc.tarjeta_id} tc={tc} />)}
              </div>
            )}

            {/* Tarjetas Archivadas Collapsible Section */}
            <div className="tarjetas-archivadas-section">
              <button 
                className="btn-toggle-archivadas" 
                onClick={() => setShowArchived(!showArchived)}
              >
                <CategoryIcon name="Archive" size={14} /> {showArchived ? 'Ocultar tarjetas archivadas' : `Ver tarjetas archivadas (${archivedCards.length})`}
              </button>

              {showArchived && (
                <div className="tarjetas-archivadas-list">
                  {archivedCards.length === 0 ? (
                    <div className="tarjetas-archivadas-empty">No hay tarjetas archivadas.</div>
                  ) : (
                    archivedCards.map(ac => (
                      <div key={ac.tarjeta_id} className="tarjeta-archivada-item">
                        <div>
                          <strong>{ac.nombre_tarjeta}</strong> {ac.banco ? `(${ac.banco})` : ''}
                        </div>
                        <button 
                          className="btn-reactivar-tarjeta" 
                          onClick={() => handleReactivar(ac.tarjeta_id)}
                        >
                          <CategoryIcon name="RotateCcw" size={12} /> Activar
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab Acreedores */}
        {activeTab === 'acreedores' && (
          <>
            {loading ? (
              <div className="tarjeta-skeleton" style={{ height: 200 }} />
            ) : acreedores.length === 0 ? (
              <div className="tarjetas-empty">
                <div className="tarjetas-empty-icon"><CategoryIcon name="Users" size={56} /></div>
                <h3>Sin acreedores</h3>
                <p>No tienes deudas activas registradas.</p>
              </div>
            ) : (
              <div className="tarjetas-list">
                {acreedores.map((a: any, i: number) => (
                  <div key={i} className="tarjeta-card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ fontSize: 'calc(24px * var(--font-scale))' }}><CategoryIcon name={a.icono || 'CircleDollarSign'} size={24} /></div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 'calc(16px * var(--font-scale))' }}>{a.nombre_acreedor}</h4>
                        <p style={{ margin: 0, fontSize: 'calc(12px * var(--font-scale))', color: 'var(--text-3)' }}>{a.tipo_deuda === 'tarjeta' ? t('card_type_credit') : t('card_type_loan')}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p className="font-mono font-bold" style={{ margin: 0, fontSize: 'calc(16px * var(--font-scale))', color: 'var(--coral)' }}>{fmtARS(a.monto_total)}</p>
                      <p style={{ margin: 0, fontSize: 'calc(12px * var(--font-scale))', color: 'var(--text-3)' }}>{Number(a.porcentaje_total).toFixed(1)}% del total</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab Comparativa */}
        {activeTab === 'comparativa' && (
          <>
            {loading ? (
              <div className="tarjeta-skeleton" style={{ height: 200 }} />
            ) : comparativa.length === 0 ? (
              <div className="tarjetas-empty">
                <div className="tarjetas-empty-icon"><CategoryIcon name="BarChart3" size={56} /></div>
                <h3>Sin datos comparativos</h3>
                <p>{t("card_need_full_cycle_comparative")}</p>
              </div>
            ) : (
              <div className="comparativa-list">
                {comparativa.map(c => {
                  const maxAmt = Math.max(Number(c.gasto_mes_anterior), Number(c.gasto_mes_actual), 1)
                  const heightAnt = Math.max(4, (Number(c.gasto_mes_anterior) / maxAmt) * 48)
                  const heightAct = Math.max(4, (Number(c.gasto_mes_actual) / maxAmt) * 48)
                  const tendencia = c.tendencia_key
                  const isSaving = c.variacion_porcentual < -20

                  return (
                    <div key={c.tarjeta_id} className="comparativa-item">
                      <div className="comparativa-header">
                        <div className="comparativa-name"><CategoryIcon name="CreditCard" size={14} /> {c.nombre_tarjeta}</div>
                        <div className={`comparativa-tendencia ${tendencia === 'trend_up' ? 'tendencia-up' : tendencia === 'trend_down' ? 'tendencia-down' : 'tendencia-stable'}`}>
                          {tendencia === 'trend_up' ? '↑' : tendencia === 'trend_down' ? '↓' : '→'}
                          {' '}{Math.abs(Number(c.variacion_porcentual)).toFixed(1)}%
                        </div>
                      </div>

                      <div className="comparativa-bars">
                        <div className="comparativa-bar-wrap">
                          <div className="comparativa-bar anterior" style={{ height: heightAnt }} />
                          <div className="comparativa-bar-label">Ant.</div>
                          <div className="comparativa-bar-amount" style={{ color: 'var(--color-text-muted)' }}>
                            {fmtARS(c.gasto_mes_anterior)}
                          </div>
                        </div>
                        <div className="comparativa-bar-wrap">
                          <div className="comparativa-bar actual" style={{ height: heightAct }} />
                          <div className="comparativa-bar-label">Act.</div>
                          <div className="comparativa-bar-amount" style={{ color: 'var(--color-coral)' }}>
                            {fmtARS(c.gasto_mes_actual)}
                          </div>
                        </div>
                      </div>

                      <div className="comparativa-msg"><CategoryIcon name={isSaving ? 'BarChart3' : 'TriangleAlert'} size={14} /> {getTendenciaMsg(c.mensaje_key)}</div>
                      {isSaving && (
                        <span className="comparativa-badge-great">
                          <CategoryIcon name="BarChart3" size={14} /> ¡Excelente disciplina! Redujiste tu uso un {Math.abs(Number(c.variacion_porcentual)).toFixed(0)}% este mes.
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modales de la Vista Lista */}
      {showCreateModal && (
        <TarjetaFormModal
          isEdit={false}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          formNombre={formNombre}
          setFormNombre={setFormNombre}
          formBanco={formBanco}
          setFormBanco={setFormBanco}
          formDiaCierre={formDiaCierre}
          setFormDiaCierre={setFormDiaCierre}
          formDiaVenc={formDiaVenc}
          setFormDiaVenc={setFormDiaVenc}
          formLimiteUnPago={formLimiteUnPago}
          setFormLimiteUnPago={setFormLimiteUnPago}
          formLimiteCuotas={formLimiteCuotas}
          setFormLimiteCuotas={setFormLimiteCuotas}
          formRecargoDolar={formRecargoDolar}
          setFormRecargoDolar={setFormRecargoDolar}
          formColor={formColor}
          setFormColor={setFormColor}
          formSubmitting={formSubmitting}
        />
      )}
      {showEditModal && (
        <TarjetaFormModal
          isEdit={true}
          onClose={() => setShowEditModal(false)}
          onSubmit={handleEdit}
          onArchive={() => {
            setShowEditModal(false)
            setShowArchiveConfirm(true)
          }}
          formNombre={formNombre}
          setFormNombre={setFormNombre}
          formBanco={formBanco}
          setFormBanco={setFormBanco}
          formDiaCierre={formDiaCierre}
          setFormDiaCierre={setFormDiaCierre}
          formDiaVenc={formDiaVenc}
          setFormDiaVenc={setFormDiaVenc}
          formLimiteUnPago={formLimiteUnPago}
          setFormLimiteUnPago={setFormLimiteUnPago}
          formLimiteCuotas={formLimiteCuotas}
          setFormLimiteCuotas={setFormLimiteCuotas}
          formRecargoDolar={formRecargoDolar}
          setFormRecargoDolar={setFormRecargoDolar}
          formColor={formColor}
          setFormColor={setFormColor}
          formSubmitting={formSubmitting}
        />
      )}
      {showPagarModal && (
        <PagarModal
          onClose={() => setShowPagarModal(false)}
          onSubmit={handlePagar}
          targetCard={targetCard}
          pagarMonto={pagarMonto}
          setPagarMonto={setPagarMonto}
          pagarFecha={pagarFecha}
          setPagarFecha={setPagarFecha}
          formSubmitting={formSubmitting}
          billeteras={billeteras}
          pagarBilleteraId={pagarBilleteraId}
          setPagarBilleteraId={setPagarBilleteraId}
        />
      )}
        {showArchiveConfirm && (
          <ConfirmModal
            isOpen={showArchiveConfirm}
            title="Archivar tarjeta"
            message={`t("card_archive_confirm_reversible", { name: targetCard?.nombre_tarjeta })`}
            confirmText="Archivar"
            type="danger"
            onConfirm={handleArchive}
            onCancel={() => setShowArchiveConfirm(false)}
          />
        )}
    </div>
  )

}

// ─────────────────────────────────────────────────────────────────────────────
// Declaración de Subcomponentes Modales Externos (Punto 2: Evitar cierres de teclado)
// ─────────────────────────────────────────────────────────────────────────────

interface TarjetaFormModalProps {
  isEdit: boolean
  onClose: () => void
  onSubmit: () => void
  onArchive?: () => void
  formNombre: string
  setFormNombre: (val: string) => void
  formBanco: string
  setFormBanco: (val: string) => void
  formDiaCierre: string
  setFormDiaCierre: (val: string) => void
  formDiaVenc: string
  setFormDiaVenc: (val: string) => void
  formLimiteUnPago: string
  setFormLimiteUnPago: (val: string) => void
  formLimiteCuotas: string
  setFormLimiteCuotas: (val: string) => void
  formRecargoDolar: string
  setFormRecargoDolar: (val: string) => void
  formColor: string
  setFormColor: (val: string) => void
  formSubmitting: boolean
}

export function TarjetaFormModal({
  isEdit,
  onClose,
  onSubmit,
  onArchive,
  formNombre,
  setFormNombre,
  formBanco,
  setFormBanco,
  formDiaCierre,
  setFormDiaCierre,
  formDiaVenc,
  setFormDiaVenc,
  formLimiteUnPago,
  setFormLimiteUnPago,
  formLimiteCuotas,
  setFormLimiteCuotas,
  formRecargoDolar,
  setFormRecargoDolar,
  formColor,
  setFormColor,
  formSubmitting,
}: TarjetaFormModalProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const form = e.currentTarget.closest('.tarjeta-modal-form')
      if (form) {
        const inputs = Array.from(form.querySelectorAll('input:not([disabled])')) as HTMLInputElement[]
        const index = inputs.indexOf(e.currentTarget)
        if (index > -1 && index < inputs.length - 1) {
          inputs[index + 1].focus()
          inputs[index + 1].scrollIntoView({ block: 'center', behavior: 'smooth' })
        } else if (index === inputs.length - 1) {
          e.currentTarget.blur()
        }
      }
    }
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 300)
  }

  return (
    <div className="tarjeta-modal-overlay" onClick={onClose}>
      <div className="tarjeta-modal" onClick={e => e.stopPropagation()}>
        <div className="tarjeta-modal-header">
          <span className="tarjeta-modal-title">{isEdit ? <><CategoryIcon name="Pencil" size={18} /> Editar Tarjeta</> : <><CategoryIcon name="CreditCard" size={18} /> Nueva Tarjeta</>}</span>
          <button className="tarjeta-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="tarjeta-modal-form">
          <div>
            <label className="tarjeta-form-label">Nombre de la tarjeta *</label>
            <input className="tarjeta-form-input" value={formNombre} onChange={e => setFormNombre(e.target.value)}
              placeholder="Ej: Visa Galicia" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
          </div>
          <div>
            <label className="tarjeta-form-label">Banco / Emisor</label>
            <input className="tarjeta-form-input" value={formBanco} onChange={e => setFormBanco(e.target.value)}
              placeholder="Ej: Galicia, Macro, BBVA" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
          </div>
          <div className="tarjeta-form-row">
            <div>
              <label className="tarjeta-form-label">{t("card_form_closing_day")}</label>
              <input className="tarjeta-form-input" type="number" min={1} max={31}
                value={formDiaCierre} onChange={e => setFormDiaCierre(e.target.value)}
                placeholder="Ej: 5" inputMode="numeric" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
            </div>
            <div>
              <label className="tarjeta-form-label">{t("card_form_due_day")}</label>
              <input className="tarjeta-form-input" type="number" min={1} max={31}
                value={formDiaVenc} onChange={e => setFormDiaVenc(e.target.value)}
                placeholder="Ej: 10" inputMode="numeric" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
            </div>
          </div>
          <div className="tarjeta-form-row">
            <div>
              <label className="tarjeta-form-label">{t("card_form_monthly_limit_optional")}</label>
              <input className="tarjeta-form-input" type="number" min={0}
                value={formLimiteUnPago} onChange={e => setFormLimiteUnPago(e.target.value)}
                placeholder="Ej: 300000" inputMode="decimal" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
            </div>
            <div>
              <label className="tarjeta-form-label">{t("card_form_installments_limit_optional")}</label>
              <input className="tarjeta-form-input" type="number" min={0}
                value={formLimiteCuotas} onChange={e => setFormLimiteCuotas(e.target.value)}
                placeholder="Ej: 500000" inputMode="decimal" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
            </div>
          </div>
          <div>
            <label className="tarjeta-form-label">{t("card_form_usd_surcharge_optional")}</label>
            <input className="tarjeta-form-input" type="number" min={0} step="0.01"
              value={formRecargoDolar} onChange={e => setFormRecargoDolar(e.target.value)}
              placeholder="Ej: 30" inputMode="decimal" enterKeyHint="done" onKeyDown={handleKeyDown} onFocus={handleFocus} />
          </div>
          <div>
            <label className="tarjeta-form-label">Color de la tarjeta</label>
            <div className="color-picker-grid">
              {CARD_COLORS.map(c => (
                <div key={c} className={`color-swatch ${formColor === c ? 'selected' : ''}`}
                  style={{ background: c }} onClick={() => setFormColor(c)} />
              ))}
            </div>
          </div>
        </div>

        <div className="tarjeta-modal-actions">
          {isEdit && onArchive && (
            <button type="button" className="btn-modal-archive" onClick={onArchive} title="Archivar tarjeta">
              <CategoryIcon name="Trash2" size={20} />
            </button>
          )}
          <button className="btn-modal-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-modal-submit" onClick={onSubmit} disabled={formSubmitting}>
            {formSubmitting ? 'Guardando...' : (isEdit ? 'Guardar cambios' : '+ Crear Tarjeta')}
          </button>
        </div>
      </div>
    </div>
  )
}

interface PagarModalProps {
  onClose: () => void
  onSubmit: () => void
  targetCard: MapaTarjeta | null
  pagarMonto: string
  setPagarMonto: (val: string) => void
  pagarFecha: string
  setPagarFecha: (val: string) => void
  formSubmitting: boolean
  billeteras: any[]
  pagarBilleteraId: number | null
  setPagarBilleteraId: (val: number | null) => void
}

export function PagarModal({
  onClose,
  onSubmit,
  targetCard,
  pagarMonto,
  setPagarMonto,
  pagarFecha,
  setPagarFecha,
  formSubmitting,
  billeteras,
  pagarBilleteraId,
  setPagarBilleteraId,
}: PagarModalProps) {
  const numericPagarMonto = parseFloat(pagarMonto) || 0
  const filteredBilleteras = billeteras.filter(b => b.saldo_actual >= numericPagarMonto)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const form = e.currentTarget.closest('.tarjeta-modal-form')
      if (form) {
        const inputs = Array.from(form.querySelectorAll('input:not([disabled])')) as HTMLInputElement[]
        const index = inputs.indexOf(e.currentTarget)
        if (index > -1 && index < inputs.length - 1) {
          inputs[index + 1].focus()
          inputs[index + 1].scrollIntoView({ block: 'center', behavior: 'smooth' })
        } else if (index === inputs.length - 1) {
          e.currentTarget.blur()
        }
      }
    }
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 300)
  }

  return (
    <div className="tarjeta-modal-overlay" onClick={onClose}>
      <div className="tarjeta-modal" onClick={e => e.stopPropagation()}>
        <div className="tarjeta-modal-header">
          <span className="tarjeta-modal-title">{t('pay_resumen_title')}</span>
          <button className="tarjeta-modal-close" onClick={onClose}>✕</button>
        </div>
        {targetCard && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,107,107,0.08)', borderRadius: 10, fontSize: 'calc(13px * var(--font-scale))', color: 'var(--color-text-muted)' }}>
            {t('pay_resumen_card_label', { nombre: targetCard.nombre_tarjeta })}
          </div>
        )}
        <div className="tarjeta-modal-form">
          <div>
            <label className="tarjeta-form-label">{t('pay_resumen_wallet_label')} *</label>
            {filteredBilleteras.length === 0 && (
              <div className="warning-card" style={{ color: 'var(--coral)', padding: '12px', background: 'rgba(255,107,107,0.08)', borderRadius: 10, fontSize: 'calc(13px * var(--font-scale))', marginBottom: '16px' }}>
                <CategoryIcon name="AlertTriangle" size={14} /> {t('error_no_sufficient_balance_wallets')}
              </div>
            )}
            <WalletDropdownSelect
              wallets={filteredBilleteras}
              selectedWalletId={pagarBilleteraId}
              onSelectWallet={(id) => setPagarBilleteraId(id)}
              placeholder={t('pay_resumen_select_wallet_placeholder')}
              formatMonto={(val, moneda) => `${fmtARS(Number(val))} ${moneda}`}
              style={{ marginTop: '6px' }}
            />
          </div>
          <div>
            <label className="tarjeta-form-label">{t('pay_resumen_amount_label')}</label>
            <input className="tarjeta-form-input" type="number" min={0} step="0.01"
              value={pagarMonto} onChange={e => setPagarMonto(e.target.value)}
              placeholder="0" inputMode="decimal" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
          </div>
          <div>
            <label className="tarjeta-form-label">{t('pay_resumen_date_label')}</label>
            <input className="tarjeta-form-input" type="date"
              value={pagarFecha} onChange={e => setPagarFecha(e.target.value)} enterKeyHint="done" onKeyDown={handleKeyDown} onFocus={handleFocus} />
          </div>
        </div>
        <div className="tarjeta-modal-actions">
          <button className="btn-modal-cancel" onClick={onClose}>{t('btn_cancel')}</button>
          <button className="btn-modal-submit" onClick={onSubmit} disabled={formSubmitting}>
            {formSubmitting ? t('btn_registering') : t('btn_confirm_payment')}
          </button>
        </div>
      </div>
    </div>
  )
}
