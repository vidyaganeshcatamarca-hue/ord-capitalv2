import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { useLanguage } from '@/locales/LanguageProvider'
import { useActiveLocale } from '@/hooks/useActiveLocale'
import { formatCurrency } from '@/lib/format'
import { useNumberFormat } from '@/hooks/useNumberFormat'
import { telemetry, TELEMETRY_PRIORITY } from '@/lib/telemetry'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { CategoryIcon } from '@/components/CategoryIcon'
import { PageBackButton } from '@/components/PageBackButton/PageBackButton'
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
  un_pago_consumido_ars?: number
  un_pago_consumido_usd?: number
  cuotas_futuras_consumido_ars?: number
  cuotas_futuras_consumido_usd?: number
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
  // Bug fix 2026-09-14: separar resumen vencido del actual en la UI
  resumen_anterior_total_ars?: number
  resumen_anterior_total_usd?: number
  resumen_anterior_a_pagar_ars?: number
  resumen_anterior_a_pagar_usd?: number
  resumen_actual_total_ars?: number
  resumen_actual_total_usd?: number
  resumen_actual_a_pagar_ars?: number
  resumen_actual_a_pagar_usd?: number
}

interface Termometro {
  nombre_tarjeta: string
  indice_estres: number
  capacidad_pago_promedio: number
  saldo_actual_total: number
  cuota_proxima: number
  moneda_proxima?: string | null
  fecha_proxima?: string | null
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
  moneda?: string
}

interface SerieCicloTarjeta {
  ciclo_index: number
  fecha_inicio: string
  fecha_fin: string
  tarjeta_id: number
  nombre_tarjeta: string
  total_ciclo: number
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
  moneda?: string
}

type PagarLine = {
  id: number
  billetera_id: number | null
  monto: string
  target_moneda_cuota?: string
  moneda?: string
  origen?: 'wallet' | 'favor'
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CARD_COLORS = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB',
  '#1E88E5', '#039BE5', '#00ACC1', '#00897B', '#43A047',
  '#7CB342', '#C0CA33', '#FDD835', '#FFB300', '#FB8C00',
  '#F4511E', '#6D4C41', '#757575', '#546E7A', '#000000'
]

// fmtARS/fmtMoneda: importes en moneda LOCAL del usuario (contexto inyectado
// por useNumberFormat); las llaves *_ars del backend ya significan "moneda local".
function fmtARS(n: number) { return formatCurrency(n) }
function fmtMoneda(n: number, moneda?: string) { return formatCurrency(n, moneda) }

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


function getTermMsg(key: string): string {
  const map: Record<string, string> = {
    msg_learning_data: t('card_learning_data'),
    msg_sufficient_balance_high_expenses: t('card_sufficient_balance_high_expenses'),
    msg_insufficient_balance_deficit: t('card_insufficient_balance_deficit'),
    msg_sufficient_balance_future_compromise: t('card_term_future_compromise'),
    msg_high_quota_insufficient_balance: t('card_term_high_quota'),
    msg_no_cuotas_pending: t('card_term_no_cuotas'),
    msg_term_medium_quota: t('card_term_medium_quota'),
    msg_term_over_capacity: t('card_term_over_capacity'),
    msg_cotizacion_no_soportada: t('cotizacion_no_soportada'),
    ok: t('card_status_ok'),
  }
  return map[key] || key
}

function getNextVencimientoDate(diaVencimiento: number): Date {
  // Owner bug-6: days-to-due must be the next occurrence of the due day from
  // today, matching fn_reporte_vencimientos_tarjetas. The old cycle-aware
  // computation skipped the near due (e.g. due day 14 with close day 20 on
  // Oct 2 reported 44 days instead of 12). Date overflow past month-end
  // normalizes the same way the backend interval math does.
  const hoy = new Date()
  if (hoy.getDate() <= diaVencimiento) {
    return new Date(hoy.getFullYear(), hoy.getMonth(), diaVencimiento)
  }
  return new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaVencimiento)
}

function getDiasParaProximoVencimiento(card: MapaTarjeta): number {
  if (card.dia_vencimiento === undefined || card.dia_vencimiento === null) {
    return Infinity
  }
  const venc = getNextVencimientoDate(card.dia_vencimiento)
  const hoy = new Date()
  const hoySoloFecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const diffTime = venc.getTime() - hoySoloFecha.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function TarjetasPage() {
  const { showToast } = useToast()
  const { lang } = useLanguage()
  // The locale for every date and currency rendered on this screen. It
  // follows the language the user is reading in, not a fixed Argentine one.
  const locale = useActiveLocale()
  const { localCurrency } = useNumberFormat()

  // â”€â”€ Data â”€â”€
  const [tarjetas, setTarjetas] = useState<MapaTarjeta[]>([])
  const [vencimientos, setVencimientos] = useState<VencimientoTarjeta[]>([])
  const [billeteras, setBilleteras] = useState<any[]>([])
  // Null honesto: sin cotización no se convierte (NADA se inventa con tasa 1).
  const [cotizacionUsd, setCotizacionUsd] = useState<number | null>(1)
  const [totalPasivo, setTotalPasivo] = useState<number>(0)
  const [comparativa, setComparativa] = useState<ComparativaTarjeta[]>([])
  const [serieTarjetas, setSerieTarjetas] = useState<SerieCicloTarjeta[]>([])
  const [loading, setLoading] = useState(true)

  // â”€â”€ Vista â”€â”€
  const [activeTab, setActiveTab] = useState<'lista' | 'comparativa'>('lista')
  const [selectedCard, setSelectedCard] = useState<MapaTarjeta | null>(null)

  // â”€â”€ Detalle â”€â”€
  const [termometro, setTermometro] = useState<Termometro | null>(null)
  const [termoInfoOpen, setTermoInfoOpen] = useState(false)

  // Carga de cuotas historicas (legacy installments)
  const [showLegacyModal, setShowLegacyModal] = useState(false)
  const [legacyDetalle, setLegacyDetalle] = useState('')
  const [legacyCantidad, setLegacyCantidad] = useState('')
  const [legacyMonto, setLegacyMonto] = useState('')
  const [legacyMes, setLegacyMes] = useState('')           // 'YYYY-MM'
  const [legacyAnio, setLegacyAnio] = useState('')         // 'YYYY'
  const [legacyMoneda, setLegacyMoneda] = useState('')     // '' = resolver al abrir
  const [legacySubmitting, setLegacySubmitting] = useState(false)
  const [legacyDeleteTarget, setLegacyDeleteTarget] = useState<{ cargaId: number; n: number } | null>(null)
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
  const [formSubmitting, setFormSubmitting] = useState(false)

  // â”€â”€ Formulario Pagar â”€â”€
  const [pagarMonto, setPagarMonto] = useState('')
  const [pagarFecha, setPagarFecha] = useState(() => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; })
  const [pagarBilleteraId, setPagarBilleteraId] = useState<number | null>(null)
  const nextLineIdArsRef = useRef(2)
  const nextLineIdUsdRef2 = useRef(2)
  const [pagarLineas, setPagarLineas] = useState<PagarLine[]>([{ id: 1, billetera_id: null, monto: '' }])
  // Bug fix 2026-09-14: monto total del resumen que se esta pagando (null = ciclo entero).
  const [objetivoPagoARS, setObjetivoPagoARS] = useState<number | null>(null)
  const [objetivoPagoUSD, setObjetivoPagoUSD] = useState<number | null>(null)
  // Objetivo del pago: 'anterior' | 'actual' | null (legacy). Lo consume la RPC
  // (p_objetivo) para liquidar SOLO las cuotas del resumen elegido.
  const [pagoObjetivo, setPagoObjetivo] = useState<'anterior' | 'actual' | null>(null)
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
      const [resT, resV, resB, resUsd, pasivoRes, comparativaRes, archivedRes, serieRes] = await Promise.all([
        rpc<MapaTarjeta[]>('fn_reporte_mapa_tarjetas').catch(() => [] as MapaTarjeta[]),
        rpc<VencimientoTarjeta[]>('fn_reporte_vencimientos_tarjetas').catch(() => [] as VencimientoTarjeta[]),
        rpc<any[]>('fn_obtener_billeteras_activas').catch(() => [] as any[]),
        rpc<number>('fn_obtener_cotizacion_usd').catch(() => null),
        rpc<number>('fn_obtener_saldo_pasivo_tarjetas').catch(() => 0),
        rpc<ComparativaTarjeta[]>('fn_reporte_comparativa_tarjetas').catch(() => [] as ComparativaTarjeta[]),
        rpc<any[]>('fn_reporte_tarjetas_archivadas').catch(() => [] as any[]), 
        rpc<SerieCicloTarjeta[]>('fn_reporte_serie_tarjetas', { p_ciclos: 12 }).catch(() => [] as SerieCicloTarjeta[]),
      ])
      setTarjetas(resT || [])
      setVencimientos(resV || [])
      setBilleteras((resB || []).filter((b: any) => !b.es_fondo_prevision))
      setCotizacionUsd(resUsd ?? null)
      setTotalPasivo(Number(pasivoRes) || 0)
      setComparativa(comparativaRes || [])
      setArchivedCards(archivedRes || [])
      setSerieTarjetas(serieRes || [])
    } catch (err: any) {
      showToast(t('cards_error_load') + parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const openLegacyModal = () => {
    const hoy = new Date()
    const mes = String(hoy.getMonth() + 1).padStart(2, '0')
    setLegacyMes(mes)
    setLegacyAnio(String(hoy.getFullYear()))
    setLegacyMoneda(localCurrency || 'ARS')
    setLegacyDetalle('')
    setLegacyCantidad('')
    setLegacyMonto('')
    setShowLegacyModal(true)
  }

const handleLegacySubmit = async () => {
    if (!selectedCard) return
    if (!legacyDetalle.trim()) {
      showToast(t('error_field_required', { field: t('card_legacy_field_detalle') }), 'error')
      return
    }
    const cantidad = parseInt(legacyCantidad)
    const monto = parseFloat(legacyMonto)
    if (!cantidad || cantidad < 1 || cantidad > 120) {
      showToast(t('error_invalid_cuotas', { max: 120 }), 'error')
      return
    }
    if (!monto || monto <= 0 || isNaN(monto)) {
      showToast(t('error_invalid_amount'), 'error')
      return
    }
    const mesInicio = `${legacyAnio}-${legacyMes}-01`
    setLegacySubmitting(true)
    try {
      await rpc('fn_registrar_cuotas_historicas', {
        p_tarjeta_id: selectedCard.tarjeta_id,
        p_detalle: legacyDetalle.trim(),
        p_cantidad: cantidad,
        p_monto_cuota: monto,
        p_mes_inicio: mesInicio,
        p_moneda: legacyMoneda || localCurrency || 'ARS',
        p_estructura_egreso_id: null,
      })
      showToast(t('card_legacy_created_toast', {
        cantidad,
        fecha: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(mesInicio + 'T12:00:00')) }), 'success')
      setShowLegacyModal(false)
      await fetchDetalle(selectedCard.tarjeta_id)
      void fetchData()
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setLegacySubmitting(false)
    }
  }

  const handleLegacyDelete = async () => {
    if (!legacyDeleteTarget) return
    try {
      await rpc('fn_eliminar_carga_cuotas_historicas', { p_carga_id: legacyDeleteTarget.cargaId })
      showToast(t('card_legacy_deleted_toast'), 'success')
      const card = selectedCard
      setLegacyDeleteTarget(null)
      if (card) {
        await fetchDetalle(card.tarjeta_id)
        void fetchData()
      }
    } catch (err) {
      showToast(parseError(err), 'error')
      setLegacyDeleteTarget(null)
    }
  }

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
      showToast(t('cards_error_detail') + parseError(err), 'error')
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
      // Tanda 4: each statement consultation, no dedup (plan §3 Fase 7)
      telemetry.track('card_statement_viewed', {}, TELEMETRY_PRIORITY.MEDIUM)
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

  // Bug fix 2026-09-14: handler único para abrir el modal de pago de resumen.
  // El modal SIEMPRE arranca en el mismo estado limpio, garantizando que el
  // autofill del saldo a favor, el botón "Aplicar saldo" y los totales del ciclo
  // se comporten idéntico sin importar desde dónde se abra (botón del alert
  // anterior vs menú contextual de la tarjeta).
  // origen 'actual' -> usa monto_a_pagar_ars/usd (próximo resumen, menú original)
  // origen 'anterior' -> usa resumen_anterior_a_pagar_ars/usd (resumen vencido)
  const abrirPagarResumen = (
    tc: MapaTarjeta,
    origen: 'actual' | 'anterior'
  ) => {
    const venc = vencimientoByCard[tc.tarjeta_id]
    // Bug fix 2026-09-14: prefill del monto a pagar para resumen anterior.
    // Se usa resumen_anterior_total_ars (total del resumen, sin descontar favor)
    // para que el modal sepa exactamente cuánto hay que pagar, igual que el
    // menú del próximo resumen usa monto_a_pagar_ars (neto del favor del ciclo).
    // La logica interna del modal (addFavorLine, favorCubreTotal, faltaRepartir)
    // decide si el saldo a favor alcanza para cubrirlo o si hay que agregar billetera.
    const objetivoArs = origen === 'anterior'
      ? Number(venc?.resumen_anterior_total_ars ?? 0)
      : Number(venc?.resumen_actual_total_ars ?? 0)
    const objetivoUsd = origen === 'anterior'
      ? Number(venc?.resumen_anterior_total_usd ?? 0)
      : Number(venc?.resumen_actual_total_usd ?? 0)
    const favorArs = Math.max(0, Number(venc?.saldo_a_favor ?? 0))
    const favorUsd = Math.max(0, Number(venc?.saldo_a_favor_usd ?? 0))
    const faltaArs = Math.max(0, objetivoArs - favorArs)
    const faltaUsd = Math.max(0, objetivoUsd - favorUsd)
    setTargetCard(tc)
    setPagoObjetivo(origen)
    setObjetivoPagoARS(objetivoArs > 0 ? objetivoArs : null)
    setObjetivoPagoUSD(objetivoUsd > 0 ? objetivoUsd : null)
    setPagarLineas([{ id: 1, billetera_id: null, monto: faltaArs > 0 ? faltaArs.toString() : '' }])
    setPagarLineasUsd([{ id: 1, billetera_id: null, target_moneda_cuota: 'USD', monto: faltaUsd > 0 ? faltaUsd.toString() : '' }])
    nextLineIdArsRef.current = 2
    nextLineIdUsdRef2.current = 2
    setPagarBilleteraId(null)
    setResumenReal('')
    setSelectedCuotasAdelantar([])
    setMenuOpen(null)
    setShowPagarModal(true)
  }

  const criticalAlerts = useMemo(
    () => vencimientos.filter(v => (v.estado_urgencia_key === 'critical' || v.estado_urgencia_key === 'urgent') && Number(v.monto_a_pagar) > 0),
    [vencimientos]
  )

  // Bug fix 2026-09-14: alerts separados por resumen anterior vs actual para pagar
  // cada operatoria en forma aislada.
  const resumenAnteriorAlerts = useMemo(
    // Regla UX: el resumen anterior siempre se muestra si hay cuotas impagas,
    // independientemente del saldo a favor. La aplicacion del saldo a favor es
    // una decision del usuario al momento de pagar.
    // Prioridad: la que vence primero va primera (dias_para_vencimiento asc).
    () => vencimientos.filter(v =>
      Number(v.resumen_anterior_total_ars ?? 0) + Number(v.resumen_anterior_total_usd ?? 0) > 0
      || Number(v.resumen_anterior_a_pagar_ars ?? 0) + Number(v.resumen_anterior_a_pagar_usd ?? 0) > 0)
      .sort((a, b) => a.dias_para_vencimiento - b.dias_para_vencimiento),
    [vencimientos]
  )
  const resumenActualAlerts = useMemo(
    // Fix 2026-09-15: mostrar el TOTAL bruto del proximo resumen (cuotas impagas de
    // la ventana del ciclo actual). El neto post-favor asumia aplicacion automatica
    // del saldo a favor y confundia; la aplicacion del favor es decision del usuario
    // al pagar (mismo principio que el resumen anterior).
    // Prioridad: la que vence primero va primera (dias_para_vencimiento asc).
    () => vencimientos.filter(v => Number(v.resumen_actual_total_ars ?? 0) + Number(v.resumen_actual_total_usd ?? 0) > 0)
      .sort((a, b) => a.dias_para_vencimiento - b.dias_para_vencimiento),
    [vencimientos]
  )

  // Regla del dueno: la seccion de cards (Mis Tarjetas) se ordena por MAYOR
  // GASTO (consumido del limite en equivalente ARS), no por vencimiento.
  const sortedTarjetas = useMemo(() => {
    const cot = cotizacionUsd ?? 0
    return [...tarjetas].sort((a, b) => {
      const gastoA = Number(a.un_pago_consumido_ars ?? 0) + (Number(a.un_pago_consumido_usd ?? 0) * cot)
      const gastoB = Number(b.un_pago_consumido_ars ?? 0) + (Number(b.un_pago_consumido_usd ?? 0) * cot)
      if (gastoA !== gastoB) return gastoB - gastoA
      return a.nombre_tarjeta.localeCompare(b.nombre_tarjeta)
    })
  }, [tarjetas, cotizacionUsd])

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Helpers for form reset
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const resetForm = () => {
    setFormNombre(''); setFormBanco(''); setFormDiaVenc('10'); setFormDiaCierre('5')
    setFormLimiteUnPago(''); setFormLimiteCuotas(''); setFormColor(CARD_COLORS[0])
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
    setMenuOpen(null)
    setShowEditModal(true)
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Handlers
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleCreate = async () => {
    if (!formNombre.trim()) { showToast(t('cards_name_required'), 'error'); return }
    try {
      setFormSubmitting(true)
      await rpc('fn_crear_tarjeta_credito', {
        p_nombre_tarjeta: formNombre.trim(),
        // No persistir texto localizado: el banco vacio se guarda como null y la
        // UI lo oculta. Antes escribia t('cards_no_bank'), o sea que el dato en
        // la base dependia del idioma activo en ese momento.
        p_banco: formBanco.trim() || null,
        p_dia_vencimiento: parseInt(formDiaVenc) || 10,
        p_dia_cierre: parseInt(formDiaCierre) || 5,
        p_limite_un_pago: formLimiteUnPago ? parseFloat(formLimiteUnPago) : null,
        p_limite_cuotas: formLimiteCuotas ? parseFloat(formLimiteCuotas) : null,
        p_color: formColor,
      })
      showToast(t('cards_created_success'), 'success')
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
        p_recargo_dolar_pct: null,
      })
      showToast(t('cards_updated_success'), 'success')
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
    // En modo objetivo, la referencia es el total del resumen elegido (la RPC
    // capea el consumo de favor a esa ventana); sin objetivo, el ciclo entero.
    const vencHandle = vencimientoByCard[targetCard?.tarjeta_id ?? 0]
    const totalCicloARS_equivModal = pagoObjetivo === 'anterior'
      ? Number(vencHandle?.resumen_anterior_total_ars ?? 0) + Number(vencHandle?.resumen_anterior_total_usd ?? 0) * Number(targetCard?.cotizacion_usd ?? 1)
      : pagoObjetivo === 'actual'
        ? Number(vencHandle?.resumen_actual_total_ars ?? 0) + Number(vencHandle?.resumen_actual_total_usd ?? 0) * Number(targetCard?.cotizacion_usd ?? 1)
        : (resumenReal !== '' && parseFloat(resumenReal) > 0
          ? parseFloat(resumenReal)
          : ((vencHandle?.monto_ciclo_total_ars ?? 0) + (vencHandle?.monto_ciclo_total_usd ?? 0) * Number(targetCard?.cotizacion_usd ?? 1)))
    // Fix 2026-09-15: el favor es por moneda (ARS cubre cuotas ARS, USD cubre
    // USD). Exigir cobertura por moneda evita enviar pago vacio cuando el favor
    // ARS sobra pero faltan dolares.
    const objArsModal = pagoObjetivo === 'anterior'
      ? Number(vencHandle?.resumen_anterior_total_ars ?? 0)
      : pagoObjetivo === 'actual'
        ? Number(vencHandle?.resumen_actual_total_ars ?? 0)
        : null
    const objUsdModal = pagoObjetivo === 'anterior'
      ? Number(vencHandle?.resumen_anterior_total_usd ?? 0)
      : pagoObjetivo === 'actual'
        ? Number(vencHandle?.resumen_actual_total_usd ?? 0)
        : null
    const favorCubreTotalModal = objArsModal !== null
      ? (objArsModal + (objUsdModal ?? 0) > 0.01)
        && (objArsModal <= 0.01 || favorNumModal + 0.01 >= objArsModal)
        && ((objUsdModal ?? 0) <= 0.01 || favorNumUsdModal + 0.01 >= (objUsdModal ?? 0))
      : favorEquivModal >= totalCicloARS_equivModal && totalCicloARS_equivModal > 0

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
      // resumenRealNum: lo que el banco debito. La RPC lo persiste en p_caja
      // (trazabilidad) y crea automaticamente una Diferencia Tarjeta cuando
      // el consumo real de la app es menor al resumen real.
      const resumenRealNum = resumenReal !== '' ? parseFloat(resumenReal) : null
      // Pago total = patrimonio: lo que sale de la billetera + el saldo a favor
      // que se consume automaticamente para cubrir el ciclo.
      // Fix 2026-09-15: convertir a ARS-equiv las lineas en USD (billetera USD o
          // linea favor en USD) para que el excedente vs resumen real no mezcle
          // monedas.
          const cotHandle = Number(targetCard?.cotizacion_usd ?? 1)
          const totalPagarBilletera = validLineas.reduce((s, l) => {
            const m = Number(l.monto) || 0
            const w = l.billetera_id != null ? billeteras.find(b => b.billetera_id === l.billetera_id) : null
            const esUSD = (w != null && w.moneda === 'USD') || (w == null && l.moneda === 'USD')
            return s + (esUSD ? m * cotHandle : m)
          }, 0)
      const favorNumHandle = Math.max(0, Number(vencimientoByCard[targetCard.tarjeta_id]?.saldo_a_favor ?? 0))
      const pagoTotalHandle = totalPagarBilletera + favorNumHandle
      // Excedente: pago total por encima del resumen real. La RPC lo acredita
      // como saldo a favor (en vez de calcular el suyo).
      const montoFavorExplicito = resumenRealNum !== null
        ? Math.max(0, pagoTotalHandle - resumenRealNum)
        : null
      const v_primer_caja_id: number = await rpc<number>('fn_registrar_pago_tarjeta_multi', {
        p_tarjeta_id: targetCard.tarjeta_id,
        p_fecha_pago: pagarFecha,
        p_pagos: validLineas.map(l => {
          const obj: any = { billetera_id: l.billetera_id, monto: l.monto }
          if (l.billetera_id === null) obj.moneda = l.moneda
          if (l.target_moneda_cuota) obj.target_moneda_cuota = l.target_moneda_cuota
          return obj
        }),
        p_cuotas_adelantar: selectedCuotasAdelantar.length > 0 ? selectedCuotasAdelantar : null,
        p_resumen_real: resumenRealNum,
        p_monto_a_favor_explicito: montoFavorExplicito,
        // Liquidar SOLO las cuotas del resumen elegido (NULL = legacy).
        p_objetivo: pagoObjetivo,
      })
      // Tanda 4 telemetry: payment intent only (no amounts, plan §3 Fase 7).
      // PRD deviation: 'minimum' is not computable — the app has no
      // minimum-payment data, so the enum is full|partial.
      const isUsdLinea = (l: { billetera_id: number | null; moneda?: string | null }) => {
        const w = l.billetera_id != null ? billeteras.find(b => b.billetera_id === l.billetera_id) : null
        return (w != null && w.moneda === 'USD') || (w == null && l.moneda === 'USD')
      }
      const hasUsd = validLineas.some(isUsdLinea)
      const hasArs = validLineas.some(l => !isUsdLinea(l))
      telemetry.track('card_payment_completed', {
        payment_type: totalCicloARS_equivModal > 0.01 && pagoTotalHandle + 0.01 >= totalCicloARS_equivModal ? 'full' : 'partial',
        excess_positive_balance: montoFavorExplicito !== null && montoFavorExplicito > 0,
        excess_prepay_installments: selectedCuotasAdelantar.length > 0,
        mixed_currency: hasArs && hasUsd,
      }, TELEMETRY_PRIORITY.MEDIUM)
      // La Diferencia Tarjeta la crea automaticamente la RPC
      // (fn_registrar_pago_tarjeta_multi) cuando resumen_real > consumo_real.
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
      showToast(t('cards_archived_success'), 'success')
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
      showToast(t('cards_error_reactivate') + parseError(err), 'error')
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
    const semaforoLabel = usoPct >= 90 ? t('cards_usage_high') : usoPct >= 70 ? t('cards_usage_medium') : t('cards_usage_healthy')
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
            <CategoryIcon name="Settings" size={14} /> {t("card_configure_limits_analysis")}
          </div>
        ) : (
          <>
            <div className="tarjeta-progress-row">
              <span className="tarjeta-progress-label">{t("card_monthly_limit_used")}</span>
              <span className={`tarjeta-progress-pct ${progressClass === 'danger' ? 'text-coral' : ''}`}>
                {usoPct}% <span className="tarjeta-progress-pct-detail">({(tc.un_pago_consumido_usd ?? 0) > 0 ? t('card_monthly_limit_spent_multi', { ars: fmtMoneda(tc.un_pago_consumido_ars ?? 0, 'ARS'), usd: fmtMoneda(tc.un_pago_consumido_usd ?? 0, 'USD') }) : t('card_monthly_limit_spent_ars', { monto: fmtMoneda(tc.un_pago_consumido_ars ?? 0, 'ARS') })})</span>
              </span>
            </div>
            <div className="tarjeta-progress-bar">
              <div className={`tarjeta-progress-fill ${progressClass}`} style={{ width: `${usoPct}%` }} />
            </div>

            <div className="tarjeta-card-footer">
              <div className="tarjeta-footer-item">
                <CategoryIcon name="CircleDollarSign" size={14} /> {t('cards_available_label')}: <b>{fmtARS(tc.un_pago_disponible)}</b>
              </div>
              <div className="tarjeta-footer-item">
                <CategoryIcon name="ClipboardList" size={14} /> {t('cards_installments_label')}: <b>{fmtARS(tc.cuotas_disponible)}</b>
              </div>
            </div>
          </>
        )}

        {/* Menú contextual */}
        {menuOpen === tc.tarjeta_id && (
          <div className="tarjeta-context-menu" onClick={e => e.stopPropagation()}>
            <button className="tarjeta-context-btn" onClick={() => openEdit(tc)}><CategoryIcon name="Pencil" size={14} /> {t('btn_edit_card')}</button>
            <button className="tarjeta-context-btn" onClick={() => abrirPagarResumen(tc, 'actual')}><CategoryIcon name="CreditCard" size={14} /> {t('btn_pay_resumen')}</button>
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
          <PageBackButton
            variant="plain"
            className="tarjeta-detalle-back"
            onBack={() => setSelectedCard(null)}
          >
            <CategoryIcon name="ArrowLeft" size={18} />
          </PageBackButton>
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
                <button className="btn-pagar-resumen" onClick={() => abrirPagarResumen(selectedCard, 'actual')}>
                  {t('btn_pay_resumen')}
                </button>
              </div>
            )}
          </div>

          {/* Termómetro de Estrés */}
          <div className="termometro-widget">
            <div className="termometro-header">
              <span className="termometro-title"><CategoryIcon name="BarChart3" size={13} /> {t("card_stress_thermometer")}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {termometro && (
                  <span className={`termometro-badge ${termometro.estado_alerta}`}>
                    <CategoryIcon name={getSemaforoIcon(termometro.estado_alerta)} size={12} /> {getSemaforoLabel(termometro.estado_alerta)}
                  </span>
                )}
                <button
                  type="button"
                  className="termometro-info-btn"
                  style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '1px solid var(--color-border)', cursor: 'pointer' }}
                  onClick={() => { setTermoInfoOpen(o => !o) }}
                  aria-label={t('card_termometer_help_title')}
                >
                  <CategoryIcon name="Info" size={14} />
                </button>
              </span>
            </div>
            {termoInfoOpen && (
              <div className="termometro-info-box" style={{ margin: '8px 0', padding: '10px 12px', background: 'var(--color-bg-elevated, rgba(255,255,255,0.04))', borderRadius: 10, fontSize: 'calc(12px * var(--font-scale))', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                <b>{t('card_termometer_help_title')}</b>
                <div>• {t('card_termometer_help_indice')}</div>
                <div>• {t('card_termometer_help_cuota')}</div>
                <div>• {t('card_termometer_help_capacidad')}</div>
              </div>
            )}

            {loadingDetalle ? (
              <div className="tarjeta-skeleton" style={{ height: 40 }} />
            ) : termometro ? (
              <>
                <div className="termometro-bar-wrapper">
                  <div
                    className={`termometro-bar-fill ${termometro.estado_alerta}`}
                    style={{ width: `${termometro.indice_estres != null ? Math.min(100, Number(termometro.indice_estres)) : 0}%` }}
                  />
                </div>
                <div className="termometro-metrics">
                  <div className="termometro-metric">
                    <div className="termometro-metric-value">{termometro.indice_estres != null ? `${Number(termometro.indice_estres).toFixed(1)}%` : '—'}</div>
                    <div className="termometro-metric-label">{t("card_stress_index")}</div>
                  </div>
                  <div className="termometro-metric">
                    <div className="termometro-metric-value">{fmtMoneda(Number(termometro.cuota_proxima), ((termometro.moneda_proxima ?? 'ARS') as 'ARS'|'USD'))}</div>
                    <div className="termometro-metric-label">
                      {t("card_next_installment")}
                      {termometro.fecha_proxima && (
                        <span style={{ display: 'block', fontSize: '0.92em' }}>
                          {t('card_next_installment_due', { fecha: new Date(`${termometro.fecha_proxima}T12:00:00`).toLocaleDateString(lang === 'es' ? 'es-AR' : 'en-US') })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="termometro-metric">
                    <div className="termometro-metric-value">{fmtMoneda(Number(termometro.capacidad_pago_promedio), (localCurrency ?? 'ARS') as 'ARS'|'USD')}</div>
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
            <div className="tarjeta-detalle-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><CategoryIcon name="ShoppingBag" size={13} /> {t('cards_pending_installments')}</span>
              <button
                className="tarjetas-btn-new"
                style={{ width: 'auto', padding: '0 14px', height: 36, fontSize: 'calc(13px * var(--font-scale))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={openLegacyModal}
              >
                + {t('card_legacy_btn_entry')}
              </button>
            </div>
            {loadingDetalle ? (
              <div className="tarjeta-skeleton" style={{ height: 80 }} />
            ) : cuotasActivas.filter(c => !c.pagado).length === 0 ? (
              <div style={{ fontSize: 'calc(13px * var(--font-scale))', color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>
                {t('cards_no_pending_installments')}
              </div>
            ) : (
              <div className="historial-list">
                {(() => { const totalPorCarga = new Map<number, number>(); cuotasActivas.forEach(c => { if (c.carga_id != null && !c.pagado) totalPorCarga.set(c.carga_id, (totalPorCarga.get(c.carga_id) ?? 0) + 1) }); return cuotasActivas.filter(c => !c.pagado).map((c: any, idx: number) => {
                  const parts = c.fecha_estimada_pago ? c.fecha_estimada_pago.split('-') : []
                  const dueDateStr = parts[1] ? new Date(c.fecha_estimada_pago + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '--'
                  return (
                    <div key={c.cuota_id} className="historial-item" style={{ alignItems: 'center' }}>
                      <div className="historial-item-info">
                        <div className="historial-item-card">
                          {(!c.caja_id && !c.descripcion) ? t('msg_refinanciacion_pago_minimo') : (c.descripcion || c.detalle_movimiento) ? (
                            <>
                              {c.descripcion
                                // La categoria puede llegar como clave ('cat_x') o como
                                // compuesto ('padre › hijo'). Se traduce cada parte por
                                // separado; una parte que ya venga en texto plano queda igual.
                                ? String(c.descripcion).split(' › ').map((part: string) => t(part.trim())).join(' › ')
                                : c.detalle_movimiento}
                              {c.descripcion && !!c.detalle_movimiento && (
                                <span style={{ fontSize: '0.85em', color: 'var(--color-text-muted)' }}> ({c.detalle_movimiento})</span>
                              )}
                            </>
                          ) : t('msg_compra_en_cuotas_default')}
                        </div>
                        <div className="historial-item-source">{t('cards_installment_due', { position: c.posicion_cuota, total: c.total_cuotas, date: dueDateStr })}</div>
                      </div>
                      <div className="historial-item-monto" style={{ color: 'var(--coral)' }}>
                        {fmtMoneda(c.monto_cuota, (c.moneda ?? 'ARS') as 'ARS' | 'USD')}
                      </div>
                      {c.carga_id != null && idx === cuotasActivas.filter(x => !x.pagado).findIndex(x => x.carga_id === c.carga_id) && (
                        <button
                          type="button"
                          className="tarjeta-detalle-action-btn"
                          style={{ width: 26, height: 26, fontSize: 'calc(13px * var(--font-scale))' }}
                          onClick={() => setLegacyDeleteTarget({ cargaId: c.carga_id, n: totalPorCarga.get(c.carga_id) ?? 1 })}
                          title={t('card_legacy_delete_btn')}
                          aria-label={t('card_legacy_delete_btn')}
                        >
                          <CategoryIcon name="CircleX" size={14} />
                        </button>
                      )}
                    </div>
                  )
                });})()}
              </div>
            )}
          </div>

          {/* Historial de Pagos */}
          <div className="tarjeta-detalle-section">
            <div className="tarjeta-detalle-section-title"><CategoryIcon name="ScrollText" size={13} /> {t('cards_payment_history')}</div>
            {loadingDetalle ? (
              <div className="tarjeta-skeleton" style={{ height: 80 }} />
            ) : historial.length === 0 ? (
              <div style={{ fontSize: 'calc(13px * var(--font-scale))', color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>
                {t('cards_no_payments_recorded')}
              </div>
            ) : (
              <div className="historial-list">
                {historial.slice(0, 10).map(h => {
                  const parts = h.fecha ? h.fecha.split('-') : []
                  const day = parts[2] || '--'
                  const month = parts[1] ? new Date(h.fecha + 'T00:00:00').toLocaleDateString(locale, { month: 'short' }) : '--'
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

        {/* Modal de carga de cuotas historicas */}
        {showLegacyModal && (
          <div className="tarjeta-modal-overlay" onClick={() => setShowLegacyModal(false)}>
            <div className="tarjeta-modal" onClick={e => e.stopPropagation()}>
              <div className="tarjeta-modal-header">
                <span className="tarjeta-modal-title">{t('card_legacy_modal_title')}</span>
                <button className="tarjeta-modal-close" onClick={() => setShowLegacyModal(false)}>
                  <CategoryIcon name="CircleX" size={18} />
                </button>
              </div>
              <div className="tarjeta-modal-form">
                <label className="tarjeta-form-label" htmlFor="legacy-detalle">{t('card_legacy_field_detalle')} *</label>
                <input
                  id="legacy-detalle"
                  className="tarjeta-form-input"
                  value={legacyDetalle}
                  onChange={e => setLegacyDetalle(e.target.value)}
                  maxLength={80}
                  autoComplete="off"
                />{/* Categorias usuario solo */}
                <label className="tarjeta-form-label" htmlFor="legacy-cantidad">{t('card_legacy_field_cantidad')} *</label>
                <input
                  id="legacy-cantidad"
                  className="tarjeta-form-input"
                  type="number"
                  min={1}
                  max={120}
                  value={legacyCantidad}
                  onChange={e => setLegacyCantidad(e.target.value)}
                  inputMode="numeric"
                />
                <label className="tarjeta-form-label" htmlFor="legacy-monto">{t('card_legacy_field_monto')} *</label>
                <input
                  id="legacy-monto"
                  className="tarjeta-form-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={legacyMonto}
                  onChange={e => setLegacyMonto(e.target.value)}
                  inputMode="decimal"
                />
                <label className="tarjeta-form-label">{t('card_legacy_field_primer_venc')} *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    className="tarjeta-form-input"
                    value={legacyMes}
                    onChange={e => setLegacyMes(e.target.value)}
                    aria-label={t('card_legacy_field_mes')}
                  >
                    {Array.from({ length: 12 }, (_, m) => {
                      const nombre = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2026, m, 1))
                      return <option key={m + 1} value={String(m + 1).padStart(2, '0')}>{nombre}</option>
                    })}
                  </select>
                  <select
                    className="tarjeta-form-input"
                    value={legacyAnio}
                    onChange={e => setLegacyAnio(e.target.value)}
                    aria-label={t('card_legacy_field_anio')}
                  >
                    {(() => {
                      const y = new Date().getFullYear()
                      return Array.from({ length: 3 }, (_, i) => (
                        <option key={y + i} value={String(y + i)}>{y + i}</option>
                      ))
                    })()}
                  </select>
                </div>
                <label className="tarjeta-form-label" htmlFor="legacy-moneda">{t('card_legacy_field_moneda')}</label>
                <select
                  id="legacy-moneda"
                  className="tarjeta-form-input"
                  value={legacyMoneda}
                  onChange={e => setLegacyMoneda(e.target.value)}
                >
                  <option value={localCurrency || 'ARS'}>{(localCurrency || 'ARS') + ' (' + t('card_legacy_local_default') + ')'}</option>
                  <option value="USD">USD</option>
                </select>
                <button
                  className="btn-pagar-resumen"
                  style={{ marginTop: 12 }}
                  disabled={legacySubmitting || !legacyDetalle.trim() || !legacyCantidad || !legacyMonto}
                  onClick={handleLegacySubmit}
                >
                  {legacySubmitting ? t('btn_saving') : t('card_legacy_save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {legacyDeleteTarget && (
          <ConfirmModal
            isOpen={!!legacyDeleteTarget}
            title={t('card_legacy_delete_confirm_title')}
            message={t('card_legacy_delete_confirm_msg', { n: legacyDeleteTarget.n })}
            confirmText={t('card_legacy_delete_btn')}
            type="danger"
            onConfirm={handleLegacyDelete}
            onCancel={() => setLegacyDeleteTarget(null)}
          />
        )}
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
            objetivoPago={objetivoPagoARS}
            objetivoPagoUSD={objetivoPagoUSD}
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
            title={t('cards_archive')}
            message={`t("card_archive_confirm_pending", { name: targetCard?.nombre_tarjeta })`}
            confirmText={t('btn_archive')}
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
        <div className="tarjetas-view-title"><CategoryIcon name="CreditCard" size={22} /> {t('cards_title')}</div>
        <button className="tarjetas-btn-new" onClick={() => { resetForm(); setShowCreateModal(true) }}>
          {t('cards_new_btn')}
        </button>
      </div>

      <div className="tarjetas-scroll">

        {/* Widget Deuda Total */}
        {loading ? (
          <div className="tarjeta-skeleton" style={{ height: 80, marginBottom: 16 }} />
        ) : (
          <div className="tarjetas-debt-widget">
            <div>
              <div className="tarjetas-debt-label">{t('cards_debt_total')}</div>
              <div className="tarjetas-debt-amount">{fmtARS(totalPasivo)}</div>
              <div className="tarjetas-debt-meta">{tarjetas.length === 1 ? t('cards_active_one', { count: tarjetas.length }) : t('cards_active_other', { count: tarjetas.length })}</div>
            </div>
            <div className="tarjetas-debt-icon"><CategoryIcon name="CreditCard" size={36} /></div>
          </div>
        )}

        {/* Alertas de Vencimiento - Resumen anterior impago (prioridad de cobro) */}
        {resumenAnteriorAlerts.length > 0 && (
          <>
            <div className="tarjetas-section-title"><CategoryIcon name="AlertOctagon" size={13} /> {t('card_resumen_anterior_title')}</div>
            <div className="tarjetas-alerts">
              {resumenAnteriorAlerts.map(v => (
                <div
                  key={`anterior-${v.tarjeta_id}`}
                  className="tarjetas-alert-item critical"
                  onClick={() => {
                    const card = tarjetas.find(t => t.tarjeta_id === v.tarjeta_id)
                    if (card) setSelectedCard(card)
                  }}
                >
                  <div className="tarjetas-alert-dot" />
                  <div className="tarjetas-alert-info">
                    <div className="tarjetas-alert-name">{v.nombre_tarjeta}</div>
                    <div className="tarjetas-alert-msg">{t('card_resumen_vencido_alert')}</div>
                  </div>
                  <div className="tarjetas-alert-monto">
                    <div className="tarjetas-alert-monto-stack">
                      <div className="tarjetas-alert-monto-row">
                        <span className="tarjetas-alert-monto-label">{t('card_resumen_anterior_total_label')}:</span>
                        <span className="tarjetas-alert-monto-value">{cotizacionUsd == null
                          ? <span style={{ color: 'var(--color-warning, #ffc107)' }}>{t('cotizacion_no_soportada')}</span>
                          : fmtARS(Number(v.resumen_anterior_total_ars ?? 0) + (Number(v.resumen_anterior_total_usd ?? 0) * cotizacionUsd))}</span>
                      </div>
                      <div className="tarjetas-alert-monto-row">
                        <span className="tarjetas-alert-monto-label">{t('card_resumen_anterior_a_pagar_label')}:</span>
                        <span className="tarjetas-alert-monto-value">{cotizacionUsd == null
                          ? <span style={{ color: 'var(--color-warning, #ffc107)' }}>{t('cotizacion_no_soportada')}</span>
                          : fmtARS(Number(v.resumen_anterior_a_pagar_ars ?? 0) + (Number(v.resumen_anterior_a_pagar_usd ?? 0) * cotizacionUsd))}</span>
                      </div>
                      {Number(v.saldo_a_favor ?? 0) > 0 && Number(v.resumen_anterior_total_ars ?? 0) > Number(v.resumen_anterior_a_pagar_ars ?? 0) && (
                        <div className="tarjetas-alert-favor-chip">{t('card_resumen_anterior_covered_by_favor')}: {fmtARS(Number(v.saldo_a_favor))}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-pagar-resumen-anterior"
                      onClick={(e) => {
                        e.stopPropagation()
                        const card = tarjetas.find(t => t.tarjeta_id === v.tarjeta_id)
                        if (card) abrirPagarResumen(card, 'anterior')
                      }}
                    >
                      {t('card_pay_resumen_anterior_btn')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Alertas de Vencimiento - Resumen actual del mes */}
        {resumenActualAlerts.length > 0 && (
          <>
            <div className="tarjetas-section-title"><CategoryIcon name="AlertTriangle" size={13} /> {t('card_resumen_actual_title')}</div>
            <div className="tarjetas-alerts">
              {resumenActualAlerts.map(v => (
                <div
                  key={`actual-${v.tarjeta_id}`}
                  className={`tarjetas-alert-item ${v.estado_urgencia_key}`}
                  onClick={() => {
                    const card = tarjetas.find(t => t.tarjeta_id === v.tarjeta_id)
                    if (card) setSelectedCard(card)
                  }}
                >
                  <div className="tarjetas-alert-dot" />
                  <div className="tarjetas-alert-info">
                    <div className="tarjetas-alert-name">{v.nombre_tarjeta}</div>
                    <div className="tarjetas-alert-msg">{v.dias_para_vencimiento <= 0 ? t('card_resumen_vencido_alert') : getUrgencyMsg(v.mensaje_key, v.dias_para_vencimiento)}</div>
                  </div>
                  <div className="tarjetas-alert-monto">
                    <div className="tarjetas-alert-monto-value">{cotizacionUsd == null
                      ? <span style={{ color: 'var(--color-warning, #ffc107)' }}>{t('cotizacion_no_soportada')}</span>
                      : fmtARS(Number(v.resumen_actual_total_ars ?? 0) + (Number(v.resumen_actual_total_usd ?? 0) * cotizacionUsd))}</div>
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
            {t('cards_title')}
          </button>
          <button className={`tarjetas-tab ${activeTab === 'comparativa' ? 'active' : ''}`} onClick={() => setActiveTab('comparativa')}>
            <CategoryIcon name="BarChart3" size={13} /> {t('cards_tab_comparison')}
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

        {/* Tab Comparativa */}
        {activeTab === 'comparativa' && (
          <>
            {loading ? (
              <div className="tarjeta-skeleton" style={{ height: 200 }} />
            ) : comparativa.length === 0 ? (
              <div className="tarjetas-empty">
                <div className="tarjetas-empty-icon"><CategoryIcon name="BarChart3" size={56} /></div>
                <h3>{t('cards_no_comparison_data')}</h3>
                <p>{t("card_need_full_cycle_comparative")}</p>
              </div>
            ) : (
              <>
                {/* Two stacked lines, each explains one reference; the gap
                  between them is exactly the line break (owner). */}
              <div className="comparativa-legend">
                <span>{t('card_cmp_legend_up')}</span>
                <span>{t('card_cmp_legend_down')}</span>
              </div>
                <div className="comparativa-list">
                {comparativa.map(c => {
                  // Series (up to 12 fetched; the CHART shows the last 6).
                  // Owner rules: bars = max 6 although more data exists; the
                  // AVERAGE uses every available cycle (since first use, tail
                  // zeros trim) — capped at 12.
                  const serieFull = serieTarjetas
                    .filter(x => x.tarjeta_id === c.tarjeta_id)
                    .sort((x, y) => y.ciclo_index - x.ciclo_index)
                  const serie = serieFull.slice(0, 6)
                  const serieMax = Math.max(...serie.map(x => Number(x.total_ciclo)), 1)
                  const usoPrevio = serieFull.length > 1 && serieFull.slice(0, 5).some(x => Number(x.total_ciclo) > 0)
                  // Available window: drop the OLDEST leading run of zero
                  // cycles (no card usage yet); interior zeros are real.
                  let primerUso = serieFull.findIndex(x => Number(x.total_ciclo) > 0)
                  if (primerUso < 0) primerUso = serieFull.length
                  const serieDisponible = serieFull.slice(primerUso)
                  const tendencia = c.tendencia_key
                  const isSaving = c.variacion_porcentual < -20

                  return (
                    <div key={c.tarjeta_id} className="comparativa-item">
                      <div className="comparativa-header">
                        <div className="comparativa-name"><CategoryIcon name="CreditCard" size={14} /> {c.nombre_tarjeta}</div>
                        <div className={`comparativa-tendencia ${tendencia === 'trend_up' ? 'tendencia-up' : tendencia === 'trend_down' ? 'tendencia-down' : 'tendencia-stable'}`}>
                          {/* Trend icons: the arrow glyphs were stored mangled
                              (mojibake) and rendered as garbage on the user's
                              screens. */}
                          <CategoryIcon name={tendencia === 'trend_up' ? 'TrendingUp' : tendencia === 'trend_down' ? 'TrendingDown' : 'Minus'} size={14} />
                          {Math.abs(Number(c.variacion_porcentual)).toFixed(1)}%
                        </div>
                      </div>

                      <div className="comparativa-bars comparativa-bars-6">
                        {serie.map((x, pos) => {
                          const prevTotal = pos > 0 ? Number(serie[pos - 1].total_ciclo) : 0
                          const pctPrev = pos > 0 && prevTotal > 0
                            ? Math.round(((Number(x.total_ciclo) - prevTotal) / prevTotal) * 100)
                            : null
                          const media = serieDisponible.reduce((acc, y) => acc + Number(y.total_ciclo), 0) / Math.max(serieDisponible.length, 1)
                          const pctMedia = media > 0
                            ? Math.round(((Number(x.total_ciclo) - media) / media) * 100)
                            : null
                          const pctClass = (v: number | null) =>
                            v === null ? '' : v > 0 ? 'cmp-pct-up' : v < 0 ? 'cmp-pct-down' : ''
                          return (
                            <div key={x.ciclo_index} className="comparativa-bar-wrap">
                              {pctPrev !== null && (
                                <span className={`comparativa-bar-pct ${pctClass(pctPrev)}`}>
                                  {pctPrev > 0 ? '+' : ''}{pctPrev}%
                                </span>
                              )}
                              <div
                                className={`comparativa-bar ${x.ciclo_index === 0 ? `actual${isSaving ? ' saving' : ''}` : 'anterior'}`}
                                style={{ height: Math.max(4, (Number(x.total_ciclo) / serieMax) * 76) }}
                              />
                              <div className="comparativa-bar-label">
                                {new Date(`${x.fecha_inicio}T00:00:00`).toLocaleDateString(locale, { month: 'short' })}
                              </div>
                              {pctMedia !== null && (
                                <span className="comparativa-bar-mediapct">
                                  {pctMedia > 0 ? '+' : ''}{pctMedia}%
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <div className="comparativa-ciclo-montos">
                        <span>{t('card_cmp_cycle_ant')}</span>
                        <strong style={{ color: 'var(--color-text-muted)' }}>
                          {fmtMoneda(c.gasto_mes_anterior, (c.moneda ?? 'ARS') as 'ARS' | 'USD')}
                        </strong>
                        <span>→</span>
                        <span>{t('card_cmp_cycle_act')}</span>
                        <strong style={{ color: isSaving ? 'var(--color-mint)' : 'var(--color-coral)' }}>
                          {fmtMoneda(c.gasto_mes_actual, (c.moneda ?? 'ARS') as 'ARS' | 'USD')}
                        </strong>
                      </div>

                      {!usoPrevio && (
                        <p className="comparativa-first-cycle">{t('card_cmp_first_cycle')}</p>
                      )}


                    </div>
                  )
                })}
                </div>
              </>
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
          objetivoPago={objetivoPagoARS}
          objetivoPagoUSD={objetivoPagoUSD}
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
            title={t('cards_archive')}
            message={`t("card_archive_confirm_reversible", { name: targetCard?.nombre_tarjeta })`}
            confirmText={t('btn_archive')}
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
          <span className="tarjeta-modal-title">{isEdit ? <><CategoryIcon name="Pencil" size={18} /> {t('card_form_title_edit')}</> : <><CategoryIcon name="CreditCard" size={18} /> {t('card_form_title_new')}</>}</span>
          <button className="tarjeta-modal-close" onClick={onClose}><CategoryIcon name="CircleX" size={18} /></button>
        </div>

        <div className="tarjeta-modal-form">
          <div>
            <label className="tarjeta-form-label">{t('card_form_name_label')}</label>
            <input className="tarjeta-form-input" value={formNombre} onChange={e => setFormNombre(e.target.value)}
              placeholder={t('card_form_name_placeholder')} enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
          </div>
          <div>
            <label className="tarjeta-form-label">{t('card_form_bank_label')}</label>
            <input className="tarjeta-form-input" value={formBanco} onChange={e => setFormBanco(e.target.value)}
              placeholder={t('card_form_bank_placeholder')} enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
          </div>
          <div className="tarjeta-form-row">
            <div>
              <label className="tarjeta-form-label">{t("card_form_closing_day")}</label>
              <input className="tarjeta-form-input" type="number" min={1} max={31}
                value={formDiaCierre} onChange={e => setFormDiaCierre(e.target.value)}
                placeholder={t('card_form_closing_day_placeholder')} inputMode="numeric" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
            </div>
            <div>
              <label className="tarjeta-form-label">{t("card_form_due_day")}</label>
              <input className="tarjeta-form-input" type="number" min={1} max={31}
                value={formDiaVenc} onChange={e => setFormDiaVenc(e.target.value)}
                placeholder={t('card_form_due_day_placeholder')} inputMode="numeric" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
            </div>
          </div>
          <div className="tarjeta-form-row">
            <div>
              <label className="tarjeta-form-label">{t("card_form_monthly_limit_optional")}</label>
              <input className="tarjeta-form-input" type="number" min={0}
                value={formLimiteUnPago} onChange={e => setFormLimiteUnPago(e.target.value)}
                placeholder={t('card_form_limit_one_payment_placeholder')} inputMode="decimal" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
            </div>
            <div>
              <label className="tarjeta-form-label">{t("card_form_installments_limit_optional")}</label>
              <input className="tarjeta-form-input" type="number" min={0}
                value={formLimiteCuotas} onChange={e => setFormLimiteCuotas(e.target.value)}
                placeholder={t('card_form_limit_installments_placeholder')} inputMode="decimal" enterKeyHint="next" onKeyDown={handleKeyDown} onFocus={handleFocus} />
            </div>
          </div>
          <div>
            <label className="tarjeta-form-label">{t('card_form_color_label')}</label>
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
            <button type="button" className="btn-modal-archive" onClick={onArchive} title={t('cards_archive')}>
              <CategoryIcon name="Trash2" size={20} />
            </button>
          )}
          <button className="btn-modal-cancel" onClick={onClose}>{t('btn_cancel')}</button>
          <button className="btn-modal-submit" onClick={onSubmit} disabled={formSubmitting}>
            {formSubmitting ? t('cards_saving') : (isEdit ? t('cards_save_changes') : t('cards_create_btn'))}
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
  // Bug fix 2026-09-14: monto total a pagar del resumen que se esta pagando.
  // Cuando viene del alert de resumen anterior, se pasa el total del resumen anterior.
  // Cuando viene del menu de proximo resumen, se pasa null (usa ciclo entero).
  objetivoPago?: number | null
  objetivoPagoUSD?: number | null
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
  objetivoPago,
  objetivoPagoUSD,
  cicloARS,
  cicloUSD,
  necesitoARS,
  necesitoUSD,
}: PagarModalProps) {
  // La seccion "ARS" del payment es la moneda LOCAL del usuario (RON para un
  // user de Rumania); el literal 'ARS' fue hardcodeo de la era monounaria.
  const { localCurrency } = useNumberFormat()
  const localMon = localCurrency || 'ARS'
  // El locale activo: los montos y las fechas de este modal siguen el idioma
  // que el usuario está leyendo.
  const locale = useActiveLocale()
  // El equivalente en USD se muestra SIEMPRE con 2 decimales, como antes de
  // existir el segundo idioma. No usa `formatCurrency` a propósito: ese helper
  // respeta los decimales que el usuario configuró para USD, y este número
  // (el equivalente de un pago en pesos) tiene su propia regla. Solo cambia el
  // locale: el separador y el símbolo siguen al idioma activo.
  const fmtUSD = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(n))
  const nextLineIdRef = useRef(2)
  const allLines = useMemo(() => [...pagarLineas, ...pagarLineasUsd], [pagarLineas, pagarLineasUsd])
  // Totales separados por moneda según la vía elegida para las cuotas USD.
  // Cuando pagamos USD vía ARS, el total ARS sumado es la "huella" pagada, mientras
  // la deduación real para la sección USD es su equivalente en USD.
  const totalPagarPesos = pagarLineas.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0) + (sectionUsdPayIn === 'ARS' ? pagarLineasUsd.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0) : 0)
  const totalPagarUsd = sectionUsdPayIn === 'USD' ? pagarLineasUsd.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0) : 0
  const totalPagar = totalPagarPesos + totalPagarUsd
  // Fix 2026-09-15: equivalente ARS de lo pagado. totalPagar mezcla lineas ARS
  // y USD crudas; toda comparacion contra el ciclo (ARS-equiv) usa esto.
  const cotizacionUsdModal = Number(targetCard?.cotizacion_usd ?? 1)
  const totalPagarArsEquiv = sectionUsdPayIn === 'USD'
    ? totalPagarPesos + totalPagarUsd * cotizacionUsdModal
    : totalPagarPesos
  const lineasInvalidas = allLines.some(l => {
    // Linea de saldo a favor: siempre valida (no requiere billetera). Cuando
    // el total esta cubierto por favor, el pago se confirma sin elegir cuenta.
    if (l.origen === 'favor') return false
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
    // Fix 2026-09-15: en modo objetivo el prefill es el neto USD del objetivo
    // (objetivo - favor USD), no el neto legacy del ciclo completo.
    const isObjetivoInit = objetivoPago != null || (objetivoPagoUSD ?? 0) > 0
    const prefillMontoUSDInit = isObjetivoInit
      ? Math.max(0, Number(objetivoPagoUSD ?? 0) - Math.max(0, Number(saldoAFavorUsd || 0)))
      : Number(necesitoUSD ?? 0)
    setPagarLineasUsd([{ id: 1, billetera_id: null, target_moneda_cuota: 'USD', monto: prefillMontoUSDInit > 0 ? prefillMontoUSDInit.toString() : '' }])
    // Nota: en modo objetivo NO se crean lineas de saldo a favor. El backend
    // (p_objetivo) consume el favor automaticamente capeado a la ventana del
    // resumen; las lineas de billetera cubren solo la diferencia.
    fetchFutureCuotas()
    return () => { cancelled = true }
  }, [targetCard?.tarjeta_id, pagarFecha, setSelectedCuotasAdelantar, setResumenReal, setResumenRealOn])

  useEffect(() => {
    if (overpayMode === 'accumulate') {
      setSelectedCuotasAdelantar([])
    }
  }, [overpayMode, setSelectedCuotasAdelantar])

  // Bruto del ciclo (baseline del sobrante: el backend calcula pagado - liquidado_del_ciclo)
  // Si viene objetivoPago (pago por resumen anterior o actual), se usa ese monto como referencia.
  const enModoObjetivo = objetivoPago != null || (objetivoPagoUSD ?? 0) > 0
  // Fix 2026-09-15: objetivo en equivalente ARS completo (parte ARS + parte USD
  // cotizada). Antes solo la parte ARS entraba al ciclo y el sobrante daba
  // falso positivo cuando la parte USD se pagaba con billetera.
  const cicloBruto = enModoObjetivo
    ? Number(objetivoPago ?? 0) + Number(objetivoPagoUSD ?? 0) * cotizacionUsdModal
    : Number(resumenEstimado || 0)
  const favorNum = Math.max(0, Number(saldoAFavor || 0))
  const favorNumUsd = Math.max(0, Number(saldoAFavorUsd || 0))
  const realNum = resumenReal !== '' && parseFloat(resumenReal) > 0 ? parseFloat(resumenReal) : null
  // Fix 2026-09-15: con resumen real declarado, el objetivo de cubrimiento (para
  // el consumo de favor y el pagoTotal) pasa a ser el resumen real del banco.
  const targetCiclo = realNum !== null ? Math.max(realNum, cicloBruto) : cicloBruto
  // Neto = lo que falta de bolsillo después del saldo a favor (se consume automático)
  const netoRequerido = Math.max(0, cicloBruto - favorNum)
  // Falta repartir: efectivo que el usuario todavía debe distribuir (baseline neto; con resumen real: real - favor)
  const faltaBase = realNum !== null ? Math.max(0, realNum - favorNum) : netoRequerido
  const faltaRepartir = faltaBase - totalPagarArsEquiv
  // Pago total = patrimonio: lo que sale de la billetera + lo que se consume
  // del saldo a favor previo. El saldo a favor se consume automatico para
  // cubrir el ciclo si el pago de bolsillo no alcanza.
  // En modo objetivo, el favor se consume capeado al objetivo (el backend con
  // p_objetivo solo debita lo que la ventana del resumen necesita).
  // En modo legacy, si ya existe una linea favor explicita, esa linea ES el favor
  // consumido: no volver a sumar el saldo completo (doble conteo -> excedente fantasma).
  const favorLineasArs = pagarLineas
    .filter(l => l.origen === 'favor')
    .reduce((s, l) => s + (parseFloat(l.monto) || 0), 0)
  const pagoTotal = enModoObjetivo
    // Gap-fill como el backend: el favor consume solo lo que el pago de billetera
    // no cubre del objetivo (evita excedente fantasma cuando una seccion se paga
    // con billetera y la otra cubre el favor).
    ? totalPagarArsEquiv + Math.min(favorNum, Math.max(0, targetCiclo - totalPagarArsEquiv))
    : totalPagarArsEquiv + Math.max(0, favorNum - favorLineasArs)
  // Fix 2026-09-15: favor que queda sin consumir (el pool de billeteras cubre el
  // ciclo). Rueda al proximo resumen junto con el sobrante: comunicarlo en el
  // banner evita la confusion "solo sobra el excedente".
  const favorNoConsumido = favorNum - Math.min(favorNum, Math.max(0, targetCiclo - totalPagarArsEquiv))
  // Sobrante: pago total por encima de la referencia. La referencia es el
  // resumen real cuando esta declarado, o el ciclo cuando no.
  // El modal de overpay se muestra cuando hay excedente para que el user elija
  // si va a saldo a favor o se asigna a adelantar cuotas futuras.
  const sobrante = realNum !== null
    ? Math.max(0, pagoTotal - realNum)  // pago total vs resumen real
    : Math.max(0, pagoTotal - cicloBruto)  // pago total vs ciclo

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
  // En modo objetivo, el neto a cubrir con billetera es objetivo - favor
  // (el favor se consume automatico en el backend, no entra como linea).
  // Fix 2026-09-15: con resumen real declarado, la obligacion es el resumen del
  // banco (min(real, ciclo)): lo que el banco cobra manda. El faltante global se
  // muestra en la seccion ARS; la USD no exige reparto propio.
  const pagoCubiertoEquiv = pagoARS + favorNum + pagoUSD * cotizacion
  const faltaARS = enModoObjetivo
    ? (realNum !== null
      ? Math.max(0, Math.min(realNum, cicloBruto) - favorNum - pagoARS - pagoUSD * cotizacion)
      : Math.max(0, Math.max(0, Number(objetivoPago) - favorNum) - pagoARS))
    : Math.max(0, necesitoARS - pagoARS)
  const faltaUSD = enModoObjetivo
    ? (realNum !== null
      ? 0
      : Math.max(0, Math.max(0, Number(objetivoPagoUSD ?? 0) - favorNumUsd) - pagoUSD))
    : Math.max(0, necesitoUSD - pagoUSD)
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
  // Fix 2026-09-15: pozo unico para adelantar cuotas. El backend (bloque de
  // deficit del registrar) consume saldo a favor cuando el sobrante no alcanza,
  // asi que el presupuesto disponible es sobrante + favor sin consumir (ARS y
  // USD cotizada), no solo el excedente nuevo.
  const refUsdCicloAdel = enModoObjetivo ? Number(objetivoPagoUSD ?? 0) : necesitoUSD
  const favorNoConsumidoUsd = Math.max(0, favorNumUsd - Math.max(0, refUsdCicloAdel - pagoUSD))
  const presupuestoAdelantar = Math.max(0, sobrante) + favorNoConsumido + favorNoConsumidoUsd * cotizacion
  const overBudget = overpayMode === 'cancel' && selectedSumFuture > presupuestoAdelantar + 0.01

  // Fase 4 saldo a favor: total equivalente ARS del ciclo a pagar
  const favorEquiv = favorNum + (favorNumUsd * Number(targetCard?.cotizacion_usd ?? 1))
  const totalCicloARS_equiv = enModoObjetivo
    ? Number(objetivoPago ?? 0) + Number(objetivoPagoUSD ?? 0) * cotizacion
    : (realNum !== null
      ? realNum
      : (cicloARS + cicloUSD * Number(targetCard?.cotizacion_usd ?? 1)))
  const favorCubreTotal = favorEquiv >= totalCicloARS_equiv && totalCicloARS_equiv > 0

  // Fix 2026-09-18: los pagos parciales (pago minimo) vuelven a poder enviarse
  // desde la UI. El backend los soporta: marca las cuotas de la ventana y
  // refinancia el faltante como cuota del proximo ciclo (saldo refinanciado).
  // Se conservan las guardas de lineas invalidas y de presupuesto de adelanto.
  const faltaVentanaEquiv = Math.max(0, Math.max(0, cicloBruto - favorNum) - pagoCubiertoEquiv)
  const pagoParcial = totalPagarArsEquiv > 0 && faltaVentanaEquiv > 0.5
  const submitEnabled = favorCubreTotal || !allLinesEmpty
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
        const shouldResetMonto = l.billetera_id != null && w?.moneda !== localMon
        // Fix 2026-09-15: al pasar a pagar en pesos, convertir el prefill USD
        // existente (o vacio) al equivalente ARS exacto. Antes el prefill USD del
        // mount hacia que isEmpty sea false y el monto quedaba reinterpretado.
        const refNecesitoUSD = enModoObjetivo
          ? Math.max(0, Number(objetivoPagoUSD ?? 0) - Math.max(0, Number(saldoAFavorUsd || 0)))
          : necesitoUSD
        const esPrefillUSD = isEmpty || (l.billetera_id == null && Math.abs((parseFloat(l.monto) || 0) - refNecesitoUSD) < 0.005)
        if (i === 0 && esPrefillUSD && cotizacion > 0 && refNecesitoUSD > 0) {
          return { ...l, billetera_id: null, target_moneda_cuota: 'USD', monto: (refNecesitoUSD * cotizacion).toFixed(2) }
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
      moneda: localMon as string,
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
          <button className="tarjeta-modal-close" onClick={onClose}><CategoryIcon name="CircleX" size={18} /></button>
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

            {(enModoObjetivo || cicloARS > 0 || cicloUSD > 0) && (
              <div className="pay-total-header">
                <span className="pay-total-header-label">{t('pay_total_a_pagar_label')}</span>
                <span className="pay-total-header-montos">
                  {(!enModoObjetivo || Number(objetivoPago) > 0 || realNum !== null) && (
                    <span className="pay-total-header-ars">{fmtMoneda(realNum ?? (enModoObjetivo ? Number(objetivoPago) : cicloARS), localMon)}</span>
                  )}
                  {!enModoObjetivo && cicloARS > 0 && cicloUSD > 0 && (
                    <span className="pay-total-header-sep">·</span>
                  )}
                  {!enModoObjetivo && cicloUSD > 0 && (
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

            {!enModoObjetivo && (favorNum > 0 || favorNumUsd > 0) && (
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
              const availableWallets = linea.origen === 'favor' ? baseWallets : baseWallets.filter(b => b.moneda === localMon)
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
                            // Autollenado: al elegir billetera el importe toma el
                            // máximo pagable con esa billetera, acotado por lo que
                            // aún falta de la sección (las otras líneas ya cargadas
                            // se restan). El user puede editarlo después.
                            const w = billeteras.find(b => b.billetera_id === id)
                            const otras = pagarLineas
                              .filter((_, i) => i !== idx)
                              .reduce((s, l) => s + (parseFloat(l.monto) || 0), 0)
                            const faltaSeccion = enModoObjetivo
                              ? (realNum !== null
                                ? Math.max(0, Math.min(realNum, cicloBruto) - favorNum - otras - pagoUSD * cotizacion)
                                : Math.max(0, Math.max(0, Number(objetivoPago) - favorNum) - otras))
                              : Math.max(0, necesitoARS - otras)
                            const montoMax = w ? Math.max(0, Math.min(Number(w.saldo_actual), faltaSeccion)) : 0
                            updateLine(idx, {
                              billetera_id: id,
                              target_moneda_cuota: undefined,
                              monto: montoMax > 0 ? String(Math.floor(montoMax * 100) / 100) : '',
                            })
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
                const availableWallets = linea.origen === 'favor' ? baseWallets : baseWallets.filter(b => b.moneda === (sectionUsdPayIn === 'ARS' ? localMon : 'USD'))
                const payInPesos = sectionUsdPayIn === 'ARS'
                const cotizacion = Number(targetCard?.cotizacion_usd ?? 1)
                const montoNum = parseFloat(linea.monto) || 0
                const equivalenteUsd = payInPesos && cotizacion > 0 && montoNum > 0
                  ? montoNum / cotizacion
                  : 0
                // Fix 2026-09-15: referencia USD objetivo-aware para la sugerencia.
                const refNecesitoUSDSug = enModoObjetivo
                  ? Math.max(0, Number(objetivoPagoUSD ?? 0) - Math.max(0, Number(saldoAFavorUsd || 0)))
                  : necesitoUSD
                const emptyPrefillSuggestion = payInPesos && idx === 0 && linea.billetera_id == null && linea.monto === '' && refNecesitoUSDSug > 0 && cotizacion > 0
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
                              const target = payInPesos && w?.moneda === localMon ? 'USD' : undefined
                              // Autollenado espejo de la sección ARS: el faltante
                              // USD (neto post-favor) convertido a la moneda de
                              // la línea (ARS cuando se paga en pesos), acotado
                              // por el saldo de la billetera.
                              const otrasUsd = pagarLineasUsd
                                .filter((_, i) => i !== idx)
                                .reduce((s, l) => {
                                  const m = parseFloat(l.monto) || 0
                                  if (m <= 0) return s
                                  const lw = billeteras.find(b => b.billetera_id === l.billetera_id)
                                  if (lw?.moneda === 'USD') return s + m
                                  return s + (cotizacion > 0 ? m / cotizacion : 0)
                                }, 0)
                              const faltaUsdSeccion = enModoObjetivo
                                ? (realNum !== null
                                  ? 0
                                  : Math.max(0, Math.max(0, Number(objetivoPagoUSD ?? 0) - favorNumUsd) - otrasUsd))
                                : Math.max(0, necesitoUSD - otrasUsd)
                              const faltaSeccion = payInPesos ? faltaUsdSeccion * cotizacion : faltaUsdSeccion
                              const montoMax = w ? Math.max(0, Math.min(Number(w.saldo_actual), faltaSeccion)) : 0
                              updateLineUsd(idx, {
                                billetera_id: id,
                                target_moneda_cuota: target,
                                monto: montoMax > 0 ? String(Math.floor(montoMax * 100) / 100) : '',
                              })
                            }}
                            placeholder={t('pay_multi_wallet_placeholder')}
                            formatMonto={(val, moneda) => `${fmtMoneda(Number(val), (moneda ?? 'ARS') as 'ARS'|'USD')} ${moneda}`}
                          />
                          {payInPesos && montoNum > 0 && (
                            <div className="pay-multi-usd-preview">
                              {t('pay_resumen_usd_equiv_preview', { monto: fmtUSD(equivalenteUsd) })}
                            </div>
                          )}
                          {emptyPrefillSuggestion && (
                            <div className="pay-multi-usd-preview pay-multi-usd-preview--suggested">
                              {t('pay_resumen_usd_equiv_suggested', { ars: (refNecesitoUSDSug * cotizacion).toFixed(2), usd: fmtUSD(refNecesitoUSDSug) })}
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
          {pagoParcial && (
            <div className="pay-multi-overpay-warn">
              {t('pay_partial_refinancia', { monto: fmtARS(faltaVentanaEquiv) })}
            </div>
          )}
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
                {realNum !== null && faltaRepartir > 0.01 && (
                  <div className="pay-resumen-real-falta">{t('pay_resumen_real_falta', { falta: fmtARS(faltaRepartir) })}</div>
                )}
              </>
            )}
          </div>

          {sobrante > 0 && (
            <div className="overpay-section">
              <div className="overpay-banner">
                <CategoryIcon name="Info" size={14} /> {t('pay_overpay_detected', { sobrante: fmtARS(sobrante) })}
              </div>
              {favorNoConsumido + favorNoConsumidoUsd * cotizacion > 0.01 && (
                <div className="overpay-favor-note">
                  {overpayMode === 'accumulate'
                    ? t('pay_overpay_favor_total_proximo', { total: fmtARS(favorNoConsumido + favorNoConsumidoUsd * cotizacion + sobrante) })
                    : t('pay_overpay_favor_restante', { total: fmtARS(Math.max(0, favorNoConsumido + favorNoConsumidoUsd * cotizacion - Math.max(0, selectedSumFuture - sobrante))) })}
                </div>
              )}
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
                                ? new Date(c.fecha_estimada_pago + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })
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
