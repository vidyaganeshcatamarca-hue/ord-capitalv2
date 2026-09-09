import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { CategoryIcon } from '@/components/CategoryIcon'
import { WalletIcon } from '@/components/WalletIcon'
import { WalletDropdownSelect } from '@/components/WalletDropdownSelect'
import type { WalletOptionItem } from '@/components/WalletDropdownSelect'
import './Tarjetas.css'
import '../Configuracion/ConfigSectionPage.css'

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  cotizacion_usd?: number
  recargo_dolar_pct?: number
}

interface VencimientoTarjeta {
  tarjeta_id: number
  nombre_tarjeta: string
  dia_vencimiento: number
  dias_para_vencimiento: number
  monto_a_pagar: number           // LEGACY: ARS-equivalent
  estado_urgencia_key: string
  mensaje_key: string
  resumen_vencido: boolean
  saldo_a_favor?: number          // ARS favor (legacy field)
  monto_ciclo_total?: number      // LEGACY: ARS-equivalent
  // Fase 3: per-moneda breakdown
  monto_a_pagar_ars?: number
  monto_a_pagar_usd?: number
  monto_ciclo_total_ars?: number
  monto_ciclo_total_usd?: number
  saldo_a_favor_usd?: number
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
  moneda?: 'ARS' | 'USD'
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
  moneda?: 'ARS' | 'USD'
}

type PagarLine = {
  id: number
  billetera_id: number | null
  monto: string
  target_moneda_cuota?: 'ARS' | 'USD'
  moneda?: 'ARS' | 'USD'
  origen?: 'wallet' | 'favor'
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CARD_COLORS = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB',
  '#1E88E5', '#039BE5', '#00ACC1', '#00897B', '#43A047',
  '#7CB342', '#C0CA33', '#FDD835', '#FFB300', '#FB8C00',
  '#F4511E', '#6D4C41', '#757575', '#546E7A', '#000000'
]

const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const fmtUSD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

function fmtARS(n: number) { return fmt.format(Number(n) || 0) }
function fmtMoneda(n: number, moneda: 'ARS' | 'USD' = 'ARS') {
  return moneda === 'USD' ? fmtUSD.format(Number(n) || 0) : fmt.format(Number(n) || 0)
}

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
  if (alerta === 'green') return t('card_status_healthy')
  if (alerta === 'yellow') return t('card_status_caution')
  return t('card_status_at_risk')
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
    alert_card_overuse: t('card_trend_overuse'),
    alert_card_savings: t('card_trend_savings'),
    alert_card_stable: t('card_trend_stable'),
  }
  return map[key] || ''
}

function getTermMsg(key: string): string {
  const map: Record<string, string> = {
    msg_learning_data: t('card_learning_data'),
    msg_sufficient_balance_high_expenses: t('card_sufficient_balance_high_expenses'),
    msg_insufficient_balance_deficit: t('card_insufficient_balance_deficit'),
    msg_sufficient_balance_future_compromise: t('card_term_future_compromise'),
    msg_high_quota_insufficient_balance: t('card_term_high_quota'),
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

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function TarjetasPage() {
  const { showToast } = useToast()

  // â”€â”€ Data â”€â”€
  const [tarjetas, setTarjetas] = useState<MapaTarjeta[]>([])
  const [vencimientos, setVencimientos] = useState<VencimientoTarjeta[]>([])
  const [billeteras, setBilleteras] = useState<any[]>([])
  const [cotizacionUsd, setCotizacionUsd] = useState<number>(1)
  const [totalPasivo, setTotalPasivo] = useState<number>(0)
  const [comparativa, setComparativa] = useState<ComparativaTarjeta[]>([])
  const [loading, setLoading] = useState(true)

  // â”€â”€ Vista â”€â”€
  const [activeTab, setActiveTab] = useState<'lista' | 'comparativa' | 'acreedores'>('lista')
  const [acreedores, setAcreedores] = useState<any[]>([])
  const [selectedCard, setSelectedCard] = useState<MapaTarjeta | null>(null)

  // â”€â”€ Detalle â”€â”€
  const [termometro, setTermometro] = useState<Termometro | null>(null)
  const [historial, setHistorial] = useState<PagoHistorial[]>([])
  const [cuotasActivas, setCuotasActivas] = useState<any[]>([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  // â”€â”€ Menú contextual â”€â”€
  const [menuOpen, setMenuOpen] = useState<number | null>(null)

  // â”€â”€ Modales â”€â”€
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPagarModal, setShowPagarModal] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [targetCard, setTargetCard] = useState<MapaTarjeta | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedCards, setArchivedCards] = useState<any[]>([])

  // â”€â”€ Formulario Crear / Editar â”€â”€
  const [formNombre, setFormNombre] = useState('')
  const [formBanco, setFormBanco] = useState('')
  const [formDiaVenc, setFormDiaVenc] = useState('10')
  const [formDiaCierre, setFormDiaCierre] = useState('5')
  const [formLimiteUnPago, setFormLimiteUnPago] = useState('')
  const [formLimiteCuotas, setFormLimiteCuotas] = useState('')
  const [formColor, setFormColor] = useState(CARD_COLORS[0])
  const [formRecargoDolar, setFormRecargoDolar] = useState('30')
  const [formSubmitting, setFormSubmitting] = useState(false)

  // â”€â”€ Formulario Pagar â”€â”€
  const [pagarMonto, setPagarMonto] = useState('')
  const [pagarFecha, setPagarFecha] = useState(() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })
  const [pagarBilleteraId, setPagarBilleteraId] = useState<number | null>(null)
  const nextLineIdArsRef = useRef(2)
  const nextLineIdUsdRef2 = useRef(2)
  const [pagarLineas, setPagarLineas] = useState<PagarLine[]>([{ id: 1, billetera_id: null, monto: '' }])
  const [pagarLineasUsd, setPagarLineasUsd] = useState<PagarLine[]>([{ id: 1, billetera_id: null, monto: '' }])
  const [sectionUsdPayIn, setSectionUsdPayIn] = useState<'ARS' | 'USD'>('USD')
  const [resumenReal, setResumenReal] = useState('')
  const [selectedCuotasAdelantar, setSelectedCuotasAdelantar] = useState<number[]>([])

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Data fetching
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Vencimiento data merged with tarjeta list
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Helpers for form reset
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Handlers
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    // Mapear líneas a payload que la RPC multi Fase 2 espera:
    // billetera_id numérico → backend infiere moneda de la billetera (default target = origen).
    // billetera_id null → favor: requiere campo "moneda" explícito.
    // target_moneda_cuota: opcional (default = moneda de origen). En MVP no se setea por línea
    // porque la UI no expone el toggle de recargo (Fase 4b).
    const favorNumModal = Math.max(0, Number(vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.saldo_a_favor ?? 0))
    const favorNumUsdModal = Math.max(0, Number(vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.saldo_a_favor_usd ?? 0))
    const favorEquivModal = favorNumModal + (favorNumUsdModal * Number(targetCard?.cotizacion_usd ?? 1))
    const totalCicloARS_equivModal = resumenReal !== '' && parseFloat(resumenReal) > 0
      ? parseFloat(resumenReal)
      : ((vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_ciclo_total_ars ?? 0) + (vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_ciclo_total_usd ?? 0) * Number(targetCard?.cotizacion_usd ?? 1))
    const favorCubreTotalModal = favorEquivModal >= totalCicloARS_equivModal && totalCicloARS_equivModal > 0

    const allPagarLineas = [...pagarLineas, ...pagarLineasUsd]
    const favorLineas = allPagarLineas.filter(l => l.origen === 'favor' && parseFloat(l.monto) > 0)
    const walletLineas = allPagarLineas.filter(l => l.billetera_id != null && parseFloat(l.monto) > 0)
    const validLineas = [...walletLineas, ...favorLineas]
      .map(l => ({
        billetera_id: l.billetera_id,
        monto: parseFloat(l.monto),
        target_moneda_cuota: l.target_moneda_cuota,
        moneda: l.moneda,
      }))
    if (validLineas.length === 0) {
      // saldo a favor cubre total: permitir envío vacío explícito
      if (!favorCubreTotalModal) { showToast(t('error_invalid_amount'), 'error'); return }
    }
    const walletIds = validLineas.filter(l => l.billetera_id != null).map(l => l.billetera_id!)
    if (new Set(walletIds).size !== walletIds.length) { showToast(t('error_pagos_multi_invalido'), 'error'); return }
    if (resumenReal !== '' && parseFloat(resumenReal) < 0) { showToast(t('error_resumen_real_invalido'), 'error'); return }
    // Validar saldo disponible de cada billetera (no se permite débito mayor al saldo)
    for (const linea of validLineas) {
      const w = linea.billetera_id != null ? billeteras.find(b => b.billetera_id === linea.billetera_id) : null
      if (w && linea.monto > Number(w.saldo_actual) + 0.009) {
        showToast(t('error_wallet_saldo_insuficiente', { nombre: t(w.nombre), saldo: fmtMoneda(Number(w.saldo_actual), w.moneda as 'ARS'|'USD') }), 'error')
        return
      }
    }
    if (!targetCard) return
    const cardSaldoAFavor = Number(vencimientoByCard[targetCard.tarjeta_id]?.saldo_a_favor ?? 0)
    try {
      setFormSubmitting(true)
      await rpc('fn_registrar_pago_tarjeta_multi', {
        p_tarjeta_id: targetCard.tarjeta_id,
        p_fecha_pago: pagarFecha,
        p_pagos: validLineas.map(l => {
          const obj: any = { billetera_id: l.billetera_id, monto: l.monto }
          if (l.billetera_id === null) obj.moneda = l.moneda
          if (l.target_moneda_cuota) obj.target_moneda_cuota = l.target_moneda_cuota
          return obj
        }),
        p_cuotas_adelantar: selectedCuotasAdelantar.length > 0 ? selectedCuotasAdelantar : null,
        p_resumen_real: resumenReal !== '' ? parseFloat(resumenReal) : null,
      })
      // Punto 3: registrar la diferencia banco-vs-tarjeta en la cuenta de sistema
      // 'Diferencia Tarjeta' (cat_card_diff). Solo si el usuario declaró resumen real
      // y difiere del ciclo calculado.
      if (resumenReal !== '' && parseFloat(resumenReal) > 0) {
        const cicloBrutoAjuste = (vencimientoByCard[targetCard.tarjeta_id]?.monto_ciclo_total_ars ?? 0)
        const diferencia = parseFloat(resumenReal) - cicloBrutoAjuste
        if (Math.abs(diferencia) > 0.01) {
          await rpc('fn_registrar_ajuste_diferencia_tarjeta', {
            p_tarjeta_id: targetCard.tarjeta_id,
            p_diferencia: diferencia,
            p_fecha: pagarFecha,
          })
        }
      }
      showToast(t('card_payment_success'), 'success')
      setShowPagarModal(false)
      setPagarMonto('')
      setPagarLineas([{ id: 1, billetera_id: null, monto: '' }])
      setPagarLineasUsd([{ id: 1, billetera_id: null, monto: '' }])
      nextLineIdArsRef.current = 2
      nextLineIdUsdRef2.current = 2
      setResumenReal('')
      setSelectedCuotasAdelantar([])
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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Sub-components (inlined for DRY within module)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
                  {getDiasParaProximoVencimiento(tc)} {t('card_dias_label')} · {t('card_vence_label')} {tc.dia_vencimiento} · {t('card_cierre_label', { day: tc.dia_cierre })}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div className={`tarjeta-semaforo ${semaforoClass}`}><CategoryIcon name={semaforoIcon} size={12} /> {semaforoLabel}</div>
            <button
              className="tarjeta-detalle-action-btn"
              style={{ width: 28, height: 28, fontSize: 'calc(14px * var(--font-scale))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === tc.tarjeta_id ? null : tc.tarjeta_id) }}
              aria-label={t("aria_label_card_menu")}
            ><CategoryIcon name="EllipsisVertical" size={14} /></button>
          </div>
        </div>

        {isConfigRequired ? (
          <div className="tarjeta-config-required" onClick={e => { e.stopPropagation(); openEdit(tc) }}>
            <CategoryIcon name="Settings" size={14} /> {t("card_configure_limits_analysis")} â†’
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
            <button className="tarjeta-context-btn" onClick={() => openEdit(tc)}><CategoryIcon name="Pencil" size={14} /> {t('btn_edit_card')}</button>
            <button className="tarjeta-context-btn" onClick={() => {
              setTargetCard(tc)
              const prefillMontoARS = venc?.monto_a_pagar_ars ?? 0
              setPagarLineas([{ id: 1, billetera_id: null, monto: prefillMontoARS > 0 ? prefillMontoARS.toString() : '' }])
              setPagarLineasUsd([{ id: 1, billetera_id: null, monto: '' }])
              nextLineIdArsRef.current = 2
              nextLineIdUsdRef2.current = 2
              setPagarBilleteraId(null)
              setResumenReal('')
              setSelectedCuotasAdelantar([])
              setMenuOpen(null)
              setShowPagarModal(true)
            }}><CategoryIcon name="CreditCard" size={14} /> {t('btn_pay_resumen')}</button>
          </div>
        )}
      </div>
    )
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Vista Detalle
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (selectedCard) {
    const usoPct = getUsoPct(selectedCard.limite_un_pago_total, selectedCard.un_pago_disponible)
    const progressClass = getProgressClass(usoPct)
    const venc = vencimientoByCard[selectedCard.tarjeta_id]

    return (
      <div className="page tarjetas-view">
        {/* Header */}
        <div className="tarjeta-detalle-header">
          <button className="tarjeta-detalle-back" onClick={() => setSelectedCard(null)}>â†</button>
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
                  <div className="vencimiento-date">
                    {venc.resumen_vencido
                      ? t("card_due_date_overdue", { day: venc.dia_vencimiento, days: venc.dias_para_vencimiento })
                      : t("card_due_date_format", { day: venc.dia_vencimiento, days: venc.dias_para_vencimiento })}
                  </div>
                  {Number(venc.saldo_a_favor) > 0 && (
                    <div className="saldo-a-favor-chip">{t('saldo_a_favor_chip', { monto: fmtARS(Number(venc.saldo_a_favor)) })}</div>
                  )}
                  <div className="vencimiento-monto">{t('card_due_estimated_prefix', { monto: fmtARS(venc.monto_ciclo_total ?? venc.monto_a_pagar) })}</div>
                </div>
                <button className="btn-pagar-resumen" onClick={() => {
                  setTargetCard(selectedCard)
                  const prefillMontoARS = venc.monto_a_pagar_ars ?? 0
                  setPagarLineas([{ id: 1, billetera_id: null, monto: prefillMontoARS > 0 ? prefillMontoARS.toString() : '' }])
                  setPagarLineasUsd([{ id: 1, billetera_id: null, monto: '' }])
                  nextLineIdArsRef.current = 2
                  nextLineIdUsdRef2.current = 2
                  setPagarBilleteraId(null)
                  setResumenReal('')
                  setSelectedCuotasAdelantar([])
                  setShowPagarModal(true)
                }}>
                  {t('btn_pay_resumen')}
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
                    <div className="termometro-metric-label">{t('card_capacity_label')}</div>
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
                        <div className="historial-item-source">Cuota {c.posicion_cuota} de {c.total_cuotas} - Vence el {dueDateStr}</div>
                      </div>
                      <div className="historial-item-monto" style={{ color: 'var(--coral)' }}>
                        {fmtMoneda(c.monto_cuota, (c.moneda ?? 'ARS') as 'ARS' | 'USD')}
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
                          <div className="historial-item-source">{t('pay_multi_line_monto_label', { nombre: h.billetera_origen === 'wallet_cash_default_name' ? t('wallet_cash_default_name') : h.billetera_origen })}</div>
                        )}
                        {h.cuotas_liquidadas > 0 && (
                          <span className="historial-item-badge"><CategoryIcon name="CheckCircle2" size={11} /> {h.cuotas_liquidadas} cuotas liquidadas</span>
                        )}
                      </div>
                      <div className="historial-item-monto">{fmtMoneda(h.monto_pagado, (h.moneda ?? 'ARS') as 'ARS' | 'USD')}</div>
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
            pagarLineas={pagarLineas}
            setPagarLineas={setPagarLineas}
            pagarLineasUsd={pagarLineasUsd}
            setPagarLineasUsd={setPagarLineasUsd}
            sectionUsdPayIn={sectionUsdPayIn}
            setSectionUsdPayIn={setSectionUsdPayIn}
            pagarFecha={pagarFecha}
            setPagarFecha={setPagarFecha}
            formSubmitting={formSubmitting}
            billeteras={billeteras}
            resumenReal={resumenReal}
            setResumenReal={setResumenReal}
            selectedCuotasAdelantar={selectedCuotasAdelantar}
            setSelectedCuotasAdelantar={setSelectedCuotasAdelantar}
            resumenEstimado={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_ciclo_total ?? vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_a_pagar ?? 0}
            saldoAFavor={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.saldo_a_favor ?? 0}
            saldoAFavorUsd={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.saldo_a_favor_usd ?? 0}
            cicloARS={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_ciclo_total_ars ?? 0}
            cicloUSD={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_ciclo_total_usd ?? 0}
            necesitoARS={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_a_pagar_ars ?? 0}
            necesitoUSD={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_a_pagar_usd ?? 0}
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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Vista Lista
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            {archivedCards.length > 0 && (
              <div className="tarjetas-archivadas-section">
                <button
                  className="btn-toggle-archivadas"
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <CategoryIcon name="Archive" size={14} /> {showArchived ? t('btn_hide_archived_cards') : t('btn_view_archived_cards', { count: archivedCards.length })}
                </button>

                {showArchived && (
                  <div className="tarjetas-archivadas-list">
                    {archivedCards.length === 0 ? (
                      <div className="tarjetas-archivadas-empty">{t('cards_archived_empty')}</div>
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
            )}
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
                          {tendencia === 'trend_up' ? 'â†‘' : tendencia === 'trend_down' ? 'â†“' : 'â†’'}
                          {' '}{Math.abs(Number(c.variacion_porcentual)).toFixed(1)}%
                        </div>
                      </div>

                      <div className="comparativa-bars">
                        <div className="comparativa-bar-wrap">
                          <div className="comparativa-bar anterior" style={{ height: heightAnt }} />
                          <div className="comparativa-bar-label">Ant.</div>
                          <div className="comparativa-bar-amount" style={{ color: 'var(--color-text-muted)' }}>
                            {fmtMoneda(c.gasto_mes_anterior, (c.moneda ?? 'ARS') as 'ARS' | 'USD')}
                          </div>
                        </div>
                        <div className="comparativa-bar-wrap">
                          <div className="comparativa-bar actual" style={{ height: heightAct }} />
                          <div className="comparativa-bar-label">Act.</div>
                          <div className="comparativa-bar-amount" style={{ color: 'var(--color-coral)' }}>
                            {fmtMoneda(c.gasto_mes_actual, (c.moneda ?? 'ARS') as 'ARS' | 'USD')}
                          </div>
                        </div>
                      </div>

                      <div className="comparativa-msg"><CategoryIcon name={isSaving ? 'BarChart3' : 'TriangleAlert'} size={14} /> {getTendenciaMsg(c.mensaje_key)}</div>
                      {isSaving && (
                        <span className="comparativa-badge-great">
                          <CategoryIcon name="BarChart3" size={14} /> Â¡Excelente disciplina! Redujiste tu uso un {Math.abs(Number(c.variacion_porcentual)).toFixed(0)}% este mes.
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
          pagarLineas={pagarLineas}
          setPagarLineas={setPagarLineas}
          pagarLineasUsd={pagarLineasUsd}
          setPagarLineasUsd={setPagarLineasUsd}
          sectionUsdPayIn={sectionUsdPayIn}
          setSectionUsdPayIn={setSectionUsdPayIn}
          pagarFecha={pagarFecha}
          setPagarFecha={setPagarFecha}
          formSubmitting={formSubmitting}
          billeteras={billeteras}
          resumenReal={resumenReal}
          setResumenReal={setResumenReal}
            selectedCuotasAdelantar={selectedCuotasAdelantar}
            setSelectedCuotasAdelantar={setSelectedCuotasAdelantar}
resumenEstimado={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_ciclo_total ?? vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_a_pagar ?? 0}
            saldoAFavor={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.saldo_a_favor ?? 0}
            saldoAFavorUsd={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.saldo_a_favor_usd ?? 0}
            cicloARS={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_ciclo_total_ars ?? 0}
            cicloUSD={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_ciclo_total_usd ?? 0}
            necesitoARS={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_a_pagar_ars ?? 0}
            necesitoUSD={vencimientoByCard[targetCard?.tarjeta_id ?? 0]?.monto_a_pagar_usd ?? 0}
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Declaración de Subcomponentes Modales Externos (Punto 2: Evitar cierres de teclado)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      // En el modal de PAGO: Enter cierra el teclado (equivale a "V" / ok).
      if (e.currentTarget.closest('.pay-modal-form')) {
        e.currentTarget.blur()
        return
      }
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
          <button className="tarjeta-modal-close" onClick={onClose}>âœ•</button>
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
          <button className="btn-modal-cancel" onClick={onClose}>{t('btn_cancel')}</button>
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
  pagarLineas: PagarLine[]
  setPagarLineas: React.Dispatch<React.SetStateAction<PagarLine[]>>
  pagarLineasUsd: PagarLine[]
  setPagarLineasUsd: React.Dispatch<React.SetStateAction<PagarLine[]>>
  sectionUsdPayIn: 'ARS' | 'USD'
  setSectionUsdPayIn: (val: 'ARS' | 'USD') => void
  pagarFecha: string
  setPagarFecha: (val: string) => void
  formSubmitting: boolean
  billeteras: any[]
  resumenReal: string
  setResumenReal: (val: string) => void
  selectedCuotasAdelantar: number[]
  setSelectedCuotasAdelantar: (ids: number[]) => void
  resumenEstimado: number        // LEGACY: ARs-equiv (ciclo o resumen real)
  saldoAFavor: number            // ARS favor
  saldoAFavorUsd: number         // USD favor
  // Fase 4 multi-moneda
  cicloARS: number               // bruto ciclo ARS
  cicloUSD: number               // bruto ciclo USD
  necesitoARS: number            // neto (post-favor) ARS
  necesitoUSD: number            // neto (post-favor) USD
}

export function PagarModal({
  onClose,
  onSubmit,
  targetCard,
  pagarLineas,
  setPagarLineas,
  pagarLineasUsd,
  setPagarLineasUsd,
  sectionUsdPayIn,
  setSectionUsdPayIn,
  pagarFecha,
  setPagarFecha,
  formSubmitting,
  billeteras,
  resumenReal,
  setResumenReal,
  selectedCuotasAdelantar,
  setSelectedCuotasAdelantar,
  resumenEstimado,
  saldoAFavor,
  saldoAFavorUsd,
  cicloARS,
  cicloUSD,
  necesitoARS,
  necesitoUSD,
}: PagarModalProps) {
  const nextLineIdRef = useRef(2)
  const allLines = useMemo(() => [...pagarLineas, ...pagarLineasUsd], [pagarLineas, pagarLineasUsd])
  // Totales separados por moneda según la vía elegida para las cuotas USD.
  // Cuando pagamos USD vía ARS, el total ARS sumado es la "huella" pagada, mientras
  // la deduación real para la sección USD es su equivalente en USD.
  const totalPagarPesos = pagarLineas.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0) + (sectionUsdPayIn === 'ARS' ? pagarLineasUsd.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0) : 0)
  const totalPagarUsd = sectionUsdPayIn === 'USD' ? pagarLineasUsd.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0) : 0
  const totalPagar = totalPagarPesos + totalPagarUsd
  const lineasInvalidas = allLines.some(l => {
    const hasWallet = l.billetera_id != null
    const monto = l.monto !== '' ? parseFloat(l.monto) : NaN
    return (hasWallet && isNaN(monto)) || (!hasWallet && !isNaN(monto) && l.monto !== '')
  }) || (() => {
    const ids = allLines.filter(l => l.billetera_id != null).map(l => l.billetera_id!)
    return new Set(ids).size !== ids.length
  })()
  const allLinesEmpty = pagarLineas.every(l => l.billetera_id == null && l.monto === '') && pagarLineasUsd.every(l => l.billetera_id == null && l.monto === '')
  const [resumenRealOn, setResumenRealOn] = useState(false)
  const [overpayMode, setOverpayMode] = useState<'accumulate' | 'cancel'>('accumulate')
  const [futureCuotas, setFutureCuotas] = useState<any[]>([])
  const [loadingCuotas, setLoadingCuotas] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    let cancelled = false
    async function fetchFutureCuotas() {
      if (!targetCard) return
      setLoadingCuotas(true)
      try {
        const res = await rpc<any[]>('fn_reporte_compromisos_tarjeta', { p_tarjeta_id: targetCard.tarjeta_id, p_fecha_pago: pagarFecha }).catch(() => [] as any[])
        if (!cancelled) setFutureCuotas((res || []).filter((c: any) => !c.pagado && !c.es_ciclo_actual).sort((a: any, b: any) => (a.fecha_estimada_pago || '').localeCompare(b.fecha_estimada_pago || '')))
      } finally {
        if (!cancelled) setLoadingCuotas(false)
      }
    }
    setOverpayMode('accumulate')
    setResumenRealOn(false)
    setResumenReal('')
    setSelectedCuotasAdelantar([])
    setSectionUsdPayIn('USD')
    setPagarLineasUsd([{ id: 1, billetera_id: null, monto: '' }])
    fetchFutureCuotas()
    return () => { cancelled = true }
  }, [targetCard?.tarjeta_id, pagarFecha, setSelectedCuotasAdelantar, setResumenReal, setResumenRealOn])

  useEffect(() => {
    if (overpayMode === 'accumulate') {
      setSelectedCuotasAdelantar([])
    }
  }, [overpayMode, setSelectedCuotasAdelantar])

  // Bruto del ciclo (baseline del sobrante: el backend calcula pagado - liquidado_del_ciclo)
  const cicloBruto = Number(resumenEstimado || 0)
  const favorNum = Math.max(0, Number(saldoAFavor || 0))
  const favorNumUsd = Math.max(0, Number(saldoAFavorUsd || 0))
  const realNum = resumenReal !== '' && parseFloat(resumenReal) > 0 ? parseFloat(resumenReal) : null
  // Neto = lo que falta de bolsillo después del saldo a favor (se consume automático)
  const netoRequerido = Math.max(0, cicloBruto - favorNum)
  // Falta repartir: efectivo que el usuario todavía debe distribuir (baseline neto; con resumen real: real - favor)
  const faltaBase = realNum !== null ? Math.max(0, realNum - favorNum) : netoRequerido
  const faltaRepartir = faltaBase - totalPagar
  // Sobrante: pago por encima del ciclo, considerando el saldo a favor previo.
  // El saldo a favor consume primero el ciclo, por lo que si tenías $75k favor + pagás $150k sobre
  // un ciclo de $100k, el sobrante REAL es 150 + 75 - 100 = $125k (no $50k).
  // Con resumen real: el 'pago' del banco ya viene dado, no se aplica el favor previo como input.
  const sobrante = realNum !== null
    ? Math.max(0, totalPagar - cicloBruto)  // con resumen real, el banco es el numero del pago
    : Math.max(0, totalPagar + favorNum - cicloBruto)

  // === Fase 4 multi-moneda ===
  // Pago por moneda según la billetera (o favor) de cada línea.
  let pagoARS = 0
  let pagoUSD = 0
  const cotizacion = Number(targetCard?.cotizacion_usd ?? 1)
  pagarLineas.forEach(l => {
    const m = parseFloat(l.monto) || 0
    if (m <= 0) return
    if (l.billetera_id === null) {
      // favor: depende de l.moneda (default ARS)
      if ((l.moneda ?? 'ARS') === 'USD') pagoUSD += m
      else pagoARS += m
    } else {
      const w = billeteras.find(b => b.billetera_id === l.billetera_id)
      if (w?.moneda === 'USD') pagoUSD += m
      else pagoARS += m
    }
  })
  // Cuando se decide pagar las cuotas USD vía ARS, el monto ingresado está en
  // ARS pero representa un pago en USD. Convertimos a USD y nunca sumamos a pagoARS.
  if (sectionUsdPayIn === 'ARS') {
    pagarLineasUsd.forEach(l => {
      const m = parseFloat(l.monto) || 0
      if (m <= 0) return
      if (l.billetera_id === null) {
        if ((l.moneda ?? 'ARS') === 'USD') pagoUSD += m
        else pagoUSD += cotizacion > 0 ? m / cotizacion : 0
      } else {
        const w = billeteras.find(b => b.billetera_id === l.billetera_id)
        if (w?.moneda === 'USD') pagoUSD += m
        else pagoUSD += cotizacion > 0 ? m / cotizacion : 0
      }
    })
  } else {
    pagarLineasUsd.forEach(l => {
      const m = parseFloat(l.monto) || 0
      if (m <= 0) return
      pagoUSD += m
    })
  }

  // Netos per-moneda desde el reporte (VencimientoTarjeta).
  const faltaARS = Math.max(0, necesitoARS - pagoARS)
  const faltaUSD = Math.max(0, necesitoUSD - pagoUSD)
  const sobranteARS = Math.max(0, pagoARS - necesitoARS)
  const sobranteUSD = Math.max(0, pagoUSD - necesitoUSD)

  // ¿La tarjeta tiene gastos en ARS / USD?
  const tarjetaTieneARS = cicloARS > 0 || necesitoARS > 0 || pagoARS > 0 || favorNum > 0
  const tarjetaTieneUSD = cicloUSD > 0 || necesitoUSD > 0 || pagoUSD > 0 || favorNumUsd > 0
  const selectedSumFuture = selectedCuotasAdelantar.reduce((sum, id) => {
    const found = futureCuotas.find(fc => Number(fc.cuota_id) === id)
    if (!found) return sum
    const monto = Number(found.monto_cuota || 0)
    return sum + (found.moneda === 'USD' ? monto * cotizacion : monto)
  }, 0)
  const overBudget = overpayMode === 'cancel' && selectedSumFuture > sobrante

  // Fase 4 saldo a favor: total equivalente ARS del ciclo a pagar
  const favorEquiv = favorNum + (favorNumUsd * Number(targetCard?.cotizacion_usd ?? 1))
  const totalCicloARS_equiv = realNum !== null
    ? realNum
    : (cicloARS + cicloUSD * Number(targetCard?.cotizacion_usd ?? 1))
  const favorCubreTotal = favorEquiv >= totalCicloARS_equiv && totalCicloARS_equiv > 0

  const seccionARSCompleta = !tarjetaTieneARS || faltaARS <= 0.5
  const seccionUSDCompleta = !tarjetaTieneUSD || faltaUSD <= 0.5
  const submitEnabled = favorCubreTotal || (!allLinesEmpty && seccionARSCompleta && seccionUSDCompleta)
  const submitDisabled = formSubmitting || lineasInvalidas || !submitEnabled || overBudget

  const updateLine = (index: number, patch: Partial<PagarLine>) => {
    const next = pagarLineas.map((l, i) => i === index ? { ...l, ...patch } : l)
    setPagarLineas(next)
  }

  const updateLineUsd = (index: number, patch: Partial<PagarLine>) => {
    setPagarLineasUsd((prev: PagarLine[]) => prev.map((l: PagarLine, i: number) => i === index ? { ...l, ...patch } : l))
  }

  const addLine = () => {
    setPagarLineas([...pagarLineas, { id: nextLineIdRef.current++, billetera_id: null, monto: '' }])
  }

  const addLineUsd = () => {
    setPagarLineasUsd([...pagarLineasUsd, { id: nextLineIdRef.current++, billetera_id: null, monto: '' }])
  }

  const handleSetSectionUsdPayIn = (target: 'ARS' | 'USD') => {
    setSectionUsdPayIn(target)
    if (target === 'ARS') {
      const cotizacion = Number(targetCard?.cotizacion_usd ?? 1)
      setPagarLineasUsd((prev: PagarLine[]) => prev.map((l: PagarLine, i: number) => {
        const isEmpty = l.billetera_id == null && l.monto === ''
        const w = l.billetera_id != null ? billeteras.find(b => b.billetera_id === l.billetera_id) : undefined
        const shouldResetMonto = l.billetera_id != null && w?.moneda !== 'ARS'
        if (i === 0 && isEmpty && cotizacion > 0 && necesitoUSD > 0) {
          return { ...l, billetera_id: null, target_moneda_cuota: 'USD', monto: (necesitoUSD * cotizacion).toFixed(2) }
        }
        return { ...l, billetera_id: null, target_moneda_cuota: 'USD', monto: shouldResetMonto ? '' : l.monto }
      }))
    } else {
      setPagarLineasUsd((prev: PagarLine[]) => prev.map((l: PagarLine) => {
        const w = l.billetera_id != null ? billeteras.find(b => b.billetera_id === l.billetera_id) : undefined
        const shouldResetMonto = l.billetera_id != null && w?.moneda !== 'USD'
        return { ...l, billetera_id: null, target_moneda_cuota: undefined, monto: shouldResetMonto ? '' : l.monto }
      }))
    }
  }

  const addFavorLine = () => {
    const monto = favorCubreTotal
      ? Math.min(favorEquiv, totalCicloARS_equiv)
      : Math.min(favorNum, Math.max(0, totalCicloARS_equiv - totalPagar))
    const next = {
      id: nextLineIdRef.current++,
      billetera_id: null,
      monto: monto > 0 ? monto.toFixed(2) : '',
      moneda: 'ARS' as const,
      origen: 'favor' as const,
    }
    const emptyFirst = pagarLineas.length === 1 && pagarLineas[0].billetera_id == null && pagarLineas[0].monto === ''
    if (emptyFirst) {
      setPagarLineas([{ ...next, id: pagarLineas[0].id }])
    } else {
      setPagarLineas([...pagarLineas, next])
    }
  }

  const removeLine = (index: number) => {
    setPagarLineas(pagarLineas.filter((_, i) => i !== index))
  }

  const removeLineUsd = (index: number) => {
    setPagarLineasUsd(pagarLineasUsd.filter((_, i) => i !== index))
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
          <button className="tarjeta-modal-close" onClick={onClose}>âœ•</button>
        </div>
            {targetCard && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,107,107,0.08)', borderRadius: 10, fontSize: 'calc(13px * var(--font-scale))', color: 'var(--color-text-muted)' }}>
                {t('pay_resumen_card_label', { nombre: targetCard.nombre_tarjeta })}
              </div>
            )}
            {(favorNum > 0 || favorNumUsd > 0) && (
              <div className="saldo-a-favor-applied-banner saldo-a-favor-applied-banner--multi">
                <CategoryIcon name="Wallet" size={14} />
                {favorNum > 0 && (
                  <span className="saldo-a-favor-amount">
                    {t('saldo_a_favor_aplicado_ars', { monto: fmtARS(favorNum) })}
                  </span>
                )}
                {favorNum > 0 && favorNumUsd > 0 && <span className="saldo-a-favor-sep">·</span>}
                {favorNumUsd > 0 && (
                  <span className="saldo-a-favor-amount">
                    {t('saldo_a_favor_aplicado_usd', { monto: fmtMoneda(favorNumUsd, 'USD') })}
                  </span>
                )}
              </div>
            )}

            {favorCubreTotal && (
              <div className="pay-favor-cubre-banner">
                <CategoryIcon name="CheckCircle" size={14} />
                <span>{t('pay_favor_cubre_total_banner')}</span>
              </div>
            )}

            {(cicloARS > 0 || cicloUSD > 0) && (
              <div className="pay-total-header">
                <span className="pay-total-header-label">{t('pay_total_a_pagar_label')}</span>
                <span className="pay-total-header-montos">
                  {cicloARS > 0 && (
                    <span className="pay-total-header-ars">{fmtMoneda(cicloARS, 'ARS')}</span>
                  )}
                  {cicloARS > 0 && cicloUSD > 0 && (
                    <span className="pay-total-header-sep">·</span>
                  )}
                  {cicloUSD > 0 && (
                    <span className="pay-total-header-usd pay-multi-total--usd">{fmtMoneda(cicloUSD, 'USD')}</span>
                  )}
                </span>
              </div>
            )}

        <div className="tarjeta-modal-form pay-modal-form" onKeyDownCapture={(e) => {
          // Defensa: en el modal de pago, Enter SIEMPRE cierra el teclado
          // (algunos teclados Android no refrescan la tecla de acción entre inputs)
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            ;(e.target as HTMLElement).blur()
          }
        }}>
          {cicloARS > 0 && (
          <div>
            <div className="pay-section-title">{t('pay_section_ars_title')}</div>
            <label className="tarjeta-form-label">{t('pay_resumen_wallet_label')} *</label>
            {billeteras.length === 0 && !favorCubreTotal && (
              <div className="warning-card" style={{ color: 'var(--coral)', padding: '12px', background: 'rgba(255,107,107,0.08)', borderRadius: 10, fontSize: 'calc(13px * var(--font-scale))', marginBottom: '16px' }}>
                <CategoryIcon name="AlertTriangle" size={14} /> {t('error_no_sufficient_balance_wallets')}
              </div>
            )}

            {(favorNum > 0 || favorNumUsd > 0) && (
              <button
                type="button"
                className="pay-multi-favor-toggle"
                onClick={addFavorLine}
                disabled={pagarLineas.some(l => l.origen === 'favor')}
              >
                <CategoryIcon name="Wallet" size={16} />
                <span>{t('pay_multi_saldo_favor_label')}</span>
                <span className="pay-multi-favor-amount">
                  {t('pay_multi_saldo_favor_disponible', { monto: fmtARS(favorEquiv) })}
                </span>
              </button>
            )}

            {pagarLineas.map((linea, idx) => {
              const selectedWallet = billeteras.find(b => b.billetera_id === linea.billetera_id)
              const usedWalletIds = allLines.filter((_, i) => i !== idx).map(l => l.billetera_id).filter(id => id != null)
              const baseWallets = billeteras.filter(b => !usedWalletIds.includes(b.billetera_id))
              // Sección ARS: solo billeteras ARS para líneas no favor.
              const availableWallets = linea.origen === 'favor' ? baseWallets : baseWallets.filter(b => b.moneda === 'ARS')
              const recargoPct = Number(targetCard?.recargo_dolar_pct ?? 30)
              const cotizacion = Number(targetCard?.cotizacion_usd ?? 1)
              const montoNum = parseFloat(linea.monto) || 0
              return (
                <div key={linea.id} className="pay-multi-line">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {linea.origen === 'favor' ? (
                      <div className="pay-multi-favor-label">
                        <CategoryIcon name="Wallet" size={18} />
                        <span>{t('pay_multi_saldo_favor_option')}</span>
                      </div>
                    ) : (
                      <>
                        <WalletDropdownSelect
                          wallets={availableWallets}
                          selectedWalletId={linea.billetera_id}
                          onSelectWallet={(id) => {
                            updateLine(idx, { billetera_id: id, target_moneda_cuota: undefined })
                          }}
                          placeholder={t('pay_multi_wallet_placeholder')}
                          formatMonto={(val, moneda) => `${fmtMoneda(Number(val), (moneda ?? 'ARS') as 'ARS'|'USD')} ${moneda}`}
                        />
                      </>
                    )}
                  </div>
                  <div className="pay-multi-monto-col">
                    <input
                      className="tarjeta-form-input pay-multi-monto-input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={linea.monto}
                      onChange={e => updateLine(idx, { monto: e.target.value })}
                      autoComplete="off"
                      inputMode="numeric"
                      enterKeyHint="done"
                      data-form-type="other"
                      onPointerDown={() => {
                        if (linea.origen === 'favor') return
                        if (linea.monto !== '') updateLine(idx, { monto: '' })
                      }}
                      onBlur={() => {
                        if (linea.origen === 'favor') return
                        const w = billeteras.find(b => b.billetera_id === linea.billetera_id)
                        if (!w) return
                        const val = parseFloat(linea.monto)
                        const saldo = Number(w.saldo_actual)
                        if (!isNaN(val) && val > saldo + 0.009) {
                          updateLine(idx, { monto: '' })
                          showToast(t('error_wallet_saldo_excedido', { nombre: t(w.nombre), saldo: fmtARS(saldo) }), 'error')
                        }
                       }}
                       placeholder=""
                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                     />
                     {selectedWallet ? (
                      <span className={`pay-multi-moneda pay-multi-moneda--${selectedWallet.moneda.toLowerCase()}`}>{selectedWallet.moneda}</span>
                    ) : linea.origen === 'favor' ? (
                      <span className="pay-multi-moneda pay-multi-moneda--ars">ARS</span>
                    ) : null}
                  </div>
                  {(idx > 0 || linea.origen === 'favor') && (
                    <button
                      type="button"
                      className="pay-multi-remove-btn"
                      onClick={() => removeLine(idx)}
                      title={t('pay_multi_remove_wallet')}
                    >
                      {t('pay_multi_remove_wallet')}
                    </button>
                  )}
                </div>
              )
            })}

            <button type="button" className="pay-multi-add-btn" onClick={addLine}>
              {t('pay_multi_add_wallet')}
            </button>
          </div>
          )}

          {cicloUSD > 0 && (
            <div className="pay-section pay-section--usd">
              <div className="pay-section-title pay-section-title--usd">{t('pay_section_usd_title')}</div>
              <div className="pay-section-usd-toggle">
                <span className="pay-section-usd-toggle-label">{t('pay_resumen_usd_pay_in_label')}</span>
                <div className="pay-multi-usd-segmented">
                  <button
                    type="button"
                    className={sectionUsdPayIn === 'USD' ? 'active' : ''}
                    onClick={() => handleSetSectionUsdPayIn('USD')}
                  >
                    {t('pay_resumen_usd_toggle_dollars')}
                  </button>
                  <button
                    type="button"
                    className={sectionUsdPayIn === 'ARS' ? 'active' : ''}
                    onClick={() => handleSetSectionUsdPayIn('ARS')}
                  >
                    {t('pay_resumen_usd_toggle_pesos')}
                  </button>
                </div>
              </div>

              {pagarLineasUsd.map((linea, idx) => {
                const selectedWallet = billeteras.find(b => b.billetera_id === linea.billetera_id)
                const usedWalletIds = allLines.filter((_, i) => i !== idx + pagarLineas.length).map(l => l.billetera_id).filter(id => id != null)
                const baseWallets = billeteras.filter(b => !usedWalletIds.includes(b.billetera_id))
                const availableWallets = linea.origen === 'favor' ? baseWallets : baseWallets.filter(b => b.moneda === sectionUsdPayIn)
                const payInPesos = sectionUsdPayIn === 'ARS'
                const cotizacion = Number(targetCard?.cotizacion_usd ?? 1)
                const montoNum = parseFloat(linea.monto) || 0
                const equivalenteUsd = payInPesos && cotizacion > 0 && montoNum > 0
                  ? montoNum / cotizacion
                  : 0
                const emptyPrefillSuggestion = payInPesos && idx === 0 && linea.billetera_id == null && linea.monto === '' && necesitoUSD > 0 && cotizacion > 0
                return (
                  <div key={linea.id} className="pay-multi-line">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {linea.origen === 'favor' ? (
                        <div className="pay-multi-favor-label">
                          <CategoryIcon name="Wallet" size={18} />
                          <span>{t('pay_multi_saldo_favor_option')}</span>
                        </div>
                      ) : (
                        <>
                          <WalletDropdownSelect
                            wallets={availableWallets}
                            selectedWalletId={linea.billetera_id}
                            onSelectWallet={(id) => {
                              const w = billeteras.find(b => b.billetera_id === id)
                              const target = payInPesos && w?.moneda === 'ARS' ? 'USD' : undefined
                              updateLineUsd(idx, { billetera_id: id, target_moneda_cuota: target })
                            }}
                            placeholder={t('pay_multi_wallet_placeholder')}
                            formatMonto={(val, moneda) => `${fmtMoneda(Number(val), (moneda ?? 'ARS') as 'ARS'|'USD')} ${moneda}`}
                          />
                          {payInPesos && montoNum > 0 && (
                            <div className="pay-multi-usd-preview">
                              {t('pay_resumen_usd_equiv_preview', { monto: fmtUSD.format(equivalenteUsd) })}
                            </div>
                          )}
                          {emptyPrefillSuggestion && (
                            <div className="pay-multi-usd-preview pay-multi-usd-preview--suggested">
                              {t('pay_resumen_usd_equiv_suggested', { ars: (necesitoUSD * cotizacion).toFixed(2), usd: fmtUSD.format(necesitoUSD) })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="pay-multi-monto-col">
                      <input
                        className="tarjeta-form-input pay-multi-monto-input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={linea.monto}
                        onChange={e => updateLineUsd(idx, { monto: e.target.value })}
                        autoComplete="off"
                        inputMode="numeric"
                        enterKeyHint="done"
                        data-form-type="other"
                        onPointerDown={() => {
                          if (linea.origen === 'favor') return
                          if (linea.monto !== '') updateLineUsd(idx, { monto: '' })
                        }}
                        onBlur={() => {
                          if (linea.origen === 'favor') return
                          const w = billeteras.find(b => b.billetera_id === linea.billetera_id)
                          if (!w) return
                          const val = parseFloat(linea.monto)
                          const saldo = Number(w.saldo_actual)
                          if (!isNaN(val) && val > saldo + 0.009) {
                            updateLineUsd(idx, { monto: '' })
                            showToast(t('error_wallet_saldo_excedido', { nombre: t(w.nombre), saldo: fmtARS(saldo) }), 'error')
                          }
                        }}
                        placeholder=""
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                      />
                      {selectedWallet ? (
                        <span className={`pay-multi-moneda pay-multi-moneda--${selectedWallet.moneda.toLowerCase()}`}>{selectedWallet.moneda}</span>
                      ) : linea.origen === 'favor' ? (
                        <span className="pay-multi-moneda pay-multi-moneda--ars">ARS</span>
                      ) : null}
                    </div>
                    {(idx > 0 || linea.origen === 'favor') && (
                      <button
                        type="button"
                        className="pay-multi-remove-btn"
                        onClick={() => removeLineUsd(idx)}
                        title={t('pay_multi_remove_wallet')}
                      >
                        {t('pay_multi_remove_wallet')}
                      </button>
                    )}
                  </div>
                )
              })}

              <button type="button" className="pay-multi-add-btn" onClick={addLineUsd}>
                {t('pay_multi_add_wallet')}
              </button>
            </div>
          )}

          <div className="pay-multi-footer pay-multi-footer--multi">
            <div className="pay-multi-footer-row">
              {tarjetaTieneARS && (
                <div className="pay-multi-footer-cell">
                  <span className="pay-multi-footer-label">{t('pay_multi_total_pagado_ars', { monto: fmtARS(pagoARS) })}</span>
                  {faltaARS > 0.5 && (
                    <span className="pay-multi-pendiente">{t('pay_multi_total_pendiente', { monto: fmtARS(faltaARS) })}</span>
                  )}
                </div>
              )}
              {tarjetaTieneUSD && (
                <div className="pay-multi-footer-cell">
                  <span className="pay-multi-footer-label">{t('pay_multi_total_pagado_usd', { monto: fmtMoneda(pagoUSD, 'USD') })}</span>
                  {faltaUSD > 0.5 && (
                    <span className="pay-multi-pendiente pay-multi-pendiente--usd">{t('pay_multi_total_pendiente', { monto: fmtMoneda(faltaUSD, 'USD') })}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          {totalPagar > faltaBase + 0.5 && sobrante <= 0.5 && (
            <div className="pay-multi-overpay-warn">
              {t('pay_overpay_warning_line', { monto: fmtARS(totalPagar - faltaBase) })}
            </div>
          )}

          <div>
            <label className="tarjeta-form-label">{t('pay_resumen_date_label')}</label>
            <input className="tarjeta-form-input" type="date"
              value={pagarFecha} onChange={e => setPagarFecha(e.target.value)} />
          </div>

          <div className="pay-resumen-real-section">
            <div className="pay-resumen-real-header">
              <span className="pay-resumen-real-title">{t('pay_resumen_real_toggle')}</span>
              <span className="pay-resumen-real-info" title={t('pay_resumen_real_info_tooltip')}>i</span>
            </div>
            <div className="config-segmented">
              <button
                type="button"
                className={`config-seg-btn config-seg-btn--expense ${!resumenRealOn ? 'config-seg-btn--active' : ''}`}
                onClick={() => {
                  setResumenRealOn(false)
                  setResumenReal('')
                }}
              >
                {t('pay_resumen_real_no')}
              </button>
              <button
                type="button"
                className={`config-seg-btn config-seg-btn--expense ${resumenRealOn ? 'config-seg-btn--active' : ''}`}
                onClick={() => setResumenRealOn(true)}
              >
                {t('pay_resumen_real_yes')}
              </button>
            </div>
            {resumenRealOn && (
              <>
                <label className="tarjeta-form-label pay-resumen-real-label">{t('pay_resumen_real_label')}</label>
                <input
                  className="tarjeta-form-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={resumenReal}
                  onChange={e => setResumenReal(e.target.value)}
                  autoComplete="off"
                  inputMode="numeric"
                  enterKeyHint="done"
                  data-form-type="other"
                  onPointerDown={() => {
                    if (resumenReal !== '') setResumenReal('')
                  }}
                  placeholder="0"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                />
                <div className="pay-resumen-real-hint">{t('pay_resumen_real_hint')}</div>
                {resumenReal !== '' && Math.abs(parseFloat(resumenReal) - cicloBruto) > 0.01 && (
                  <div className="pay-resumen-real-dif">{t('pay_resumen_real_dif', { monto: fmtARS(parseFloat(resumenReal) - cicloBruto) })}</div>
                )}
              </>
            )}
          </div>

          {sobrante > 0 && (
            <div className="overpay-section">
              <div className="overpay-banner">
                <CategoryIcon name="Info" size={14} /> {t('pay_overpay_detected', { sobrante: fmtARS(sobrante) })}
              </div>
              <div className="overpay-options">
                <button
                  type="button"
                  className={`overpay-option ${overpayMode === 'accumulate' ? 'selected' : ''}`}
                  onClick={() => setOverpayMode('accumulate')}
                >
                  <span className="overpay-option-radio" />
                  <span className="overpay-option-label">{t('pay_overpay_option_accumulate')}</span>
                </button>
                <button
                  type="button"
                  className={`overpay-option ${overpayMode === 'cancel' ? 'selected' : ''}`}
                  onClick={() => setOverpayMode('cancel')}
                >
                  <span className="overpay-option-radio" />
                  <span className="overpay-option-label">{t('pay_overpay_option_cancel_cuotas')}</span>
                </button>
              </div>

              {overpayMode === 'cancel' && (
                <div className="overpay-cuotas-section">
                  <div className="overpay-cuotas-title">{t('pay_overpay_cuotas_section_title')}</div>
                  {loadingCuotas ? (
                    <div className="tarjeta-skeleton" style={{ height: 80 }} />
                  ) : futureCuotas.length === 0 ? (
                    <div className="overpay-empty">{t('card_detail_no_installments')}</div>
                  ) : (
                    (() => {
                      return (
                        <>
                          <div className="overpay-cuotas-list">
                            {futureCuotas.map(c => {
                              const cuotaId = Number(c.cuota_id)
                              const selected = selectedCuotasAdelantar.includes(cuotaId)
                              const dueDateStr = c.fecha_estimada_pago
                                ? new Date(c.fecha_estimada_pago + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                                : '--'
                              return (
                                <button
                                  key={cuotaId}
                                  type="button"
                                  className={`overpay-cuota-row ${selected ? 'selected' : ''}`}
                                  onClick={() => {
                                    if (selected) {
                                      setSelectedCuotasAdelantar(selectedCuotasAdelantar.filter(id => id !== cuotaId))
                                    } else {
                                      setSelectedCuotasAdelantar([...selectedCuotasAdelantar, cuotaId])
                                    }
                                  }}
                                >
                                  <div className="overpay-cuota-info">
                                    <div className="overpay-cuota-date">
                                      {dueDateStr}
                                      {c.posicion_cuota && c.total_cuotas && Number(c.total_cuotas) > 0 && (
                                        <span className="overpay-cuota-pos">
                                          {' · '}{t('pay_overpay_cuota_position', { pos: c.posicion_cuota, total: c.total_cuotas })}
                                        </span>
                                      )}
                                    </div>
                                    <div className="overpay-cuota-desc">{c.descripcion || t('msg_compra_en_cuotas_default')}</div>
                                  </div>
                                  <div className="overpay-cuota-monto">{fmtMoneda(c.monto_cuota, (c.moneda ?? 'ARS') as 'ARS'|'USD')}</div>
                                  <div className="overpay-cuota-status">
                                    {selected ? t('pay_overpay_cuota_already_selected') : ''}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                          <div className="overpay-footer">
                            {overBudget && (
                              <div className="overpay-over-budget">
                                {t('error_sobrante_insuficiente_cuota')}
                              </div>
                            )}
                            {!overBudget && (
                              <span className="overpay-leftover">{t('pay_overpay_leftover_summary', { monto: fmtARS(Math.max(0, sobrante - selectedSumFuture)) })}</span>
                            )}
                          </div>
                        </>
                      )
                    })()
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="tarjeta-modal-actions">
          <button className="btn-modal-cancel" onClick={onClose}>{t('btn_cancel')}</button>
          <button className="btn-modal-submit" onClick={onSubmit} disabled={submitDisabled}>
            {formSubmitting ? t('btn_registering') : t('btn_confirm_payment')}
          </button>
        </div>
      </div>
    </div>
  )
}
