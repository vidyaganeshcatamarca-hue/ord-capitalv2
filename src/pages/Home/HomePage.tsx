import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { EditMovementModal } from '@/components/EditMovementModal/EditMovementModal'
import { ReconcileWalletModal } from '@/components/ReconcileWalletModal/ReconcileWalletModal'
import { useNumberFormat } from '@/hooks/useNumberFormat'
import { useCountUp } from '@/hooks/useCountUp'
import { useHideAmounts } from '@/hooks/useHideAmounts'
import { generateColorShade } from '@/lib/colorUtils'
import './Home.css'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return t('greeting_morning')
  if (h < 19) return t('greeting_afternoon')
  return t('greeting_night')
}

type HomePeriodPreset = 'today' | 'week' | 'month' | 'custom'
type HomeCategoryLevel = 'parents' | 'all'

type HomeFilters = {
  preset: HomePeriodPreset
  fechaInicio: string
  fechaFin: string
  billeteraId: number | null
  nivelCategorias: HomeCategoryLevel
}

const HOME_PREFERENCES_KEY_PREFIX = 'home_preferences:'
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatShortDateValue(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
}

function getBudgetCycleRange(referenceDate: Date, diaAncla: number, offsetMonths = 0) {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth() + offsetMonths
  const day = referenceDate.getDate()
  const normalizedAnchor = Math.max(1, Math.min(28, diaAncla || 1))
  const startsThisMonth = day >= normalizedAnchor
  const startMonth = startsThisMonth ? month : month - 1
  const start = new Date(year, startMonth, normalizedAnchor)
  const end = new Date(year, startMonth + 1, normalizedAnchor - 1)
  return { fechaInicio: toDateInputValue(start), fechaFin: toDateInputValue(end) }
}

function getPresetRange(preset: HomePeriodPreset, diaAncla: number) {
  const today = new Date()
  if (preset === 'today') {
    const value = toDateInputValue(today)
    return { fechaInicio: value, fechaFin: value }
  }

  if (preset === 'week') {
    const day = today.getDay()
    const diffToMonday = day === 0 ? -6 : 1 - day
    const monday = new Date(today)
    monday.setDate(today.getDate() + diffToMonday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { fechaInicio: toDateInputValue(monday), fechaFin: toDateInputValue(sunday) }
  }

  return getBudgetCycleRange(today, diaAncla)
}

function getDefaultHomeFilters(diaAncla: number): HomeFilters {
  const range = getPresetRange('month', diaAncla)
  return { preset: 'month', ...range, billeteraId: null, nivelCategorias: 'parents' }
}

function isValidDateInput(value: unknown): value is string {
  return typeof value === 'string' && DATE_INPUT_PATTERN.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}

function parseHomePreferences(value: unknown, diaAncla: number, activeWalletIds: Set<number>): HomeFilters | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const preferences = value as Record<string, unknown>
  const preset = preferences.periodo
  const categoryLevel = preferences.nivel_categorias
  const walletIdValue = preferences.billetera_id

  if (!['today', 'week', 'month', 'custom'].includes(String(preset))) return null
  if (!['parents', 'all'].includes(String(categoryLevel))) return null

  const billeteraId = walletIdValue === null || walletIdValue === undefined
    ? null
    : Number(walletIdValue)
  if (billeteraId !== null && (!Number.isInteger(billeteraId) || !activeWalletIds.has(billeteraId))) return null

  if (preset === 'custom') {
    const fechaInicio = preferences.fecha_inicio
    const fechaFin = preferences.fecha_fin
    if (!isValidDateInput(fechaInicio) || !isValidDateInput(fechaFin) || fechaInicio > fechaFin) return null
    return { preset, fechaInicio, fechaFin, billeteraId, nivelCategorias: categoryLevel as HomeCategoryLevel }
  }

  return {
    preset: preset as HomePeriodPreset,
    ...getPresetRange(preset as HomePeriodPreset, diaAncla),
    billeteraId,
    nivelCategorias: categoryLevel as HomeCategoryLevel
  }
}

function serializeHomePreferences(filters: HomeFilters) {
  return {
    periodo: filters.preset,
    fecha_inicio: filters.fechaInicio,
    fecha_fin: filters.fechaFin,
    billetera_id: filters.billeteraId,
    nivel_categorias: filters.nivelCategorias
  }
}

function hasValidHomeFilterRange(filters: HomeFilters) {
  return isValidDateInput(filters.fechaInicio)
    && isValidDateInput(filters.fechaFin)
    && filters.fechaInicio <= filters.fechaFin
}

function getShortcutRange(shortcut: 'yesterday' | 'year' | 'previous_month', diaAncla: number) {
  const today = new Date()
  if (shortcut === 'yesterday') {
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const value = toDateInputValue(yesterday)
    return { fechaInicio: value, fechaFin: value }
  }

  if (shortcut === 'year') {
    return {
      fechaInicio: toDateInputValue(new Date(today.getFullYear(), 0, 1)),
      fechaFin: toDateInputValue(new Date(today.getFullYear(), 11, 31))
    }
  }

  return getBudgetCycleRange(today, diaAncla, -1)
}

// ── Color derivation utilities (mirrors fn_generar_variacion_color SQL logic) ──
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const cmax = Math.max(r, g, b)
  const cmin = Math.min(r, g, b)
  const delta = cmax - cmin
  let h = 0, s = 0
  const l = (cmax + cmin) / 2
  if (delta !== 0) {
    s = l < 0.5 ? delta / (cmax + cmin) : delta / (2 - cmax - cmin)
    if (cmax === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
    else if (cmax === g) h = ((b - r) / delta + 2) / 6
    else h = ((r - g) / delta + 4) / 6
  }
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const htr = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 0.5) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = htr(p, q, h + 1 / 3)
    g = htr(p, q, h)
    b = htr(p, q, h - 1 / 3)
  }
  const toHex = (x: number) => Math.min(255, Math.max(0, Math.round(x * 255))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Genera una variación tonal de un color base para la posición dada dentro del grupo */
function generateColorVariation(baseHex: string, position: number, total: number): string {
  try {
    if (!baseHex || baseHex.length < 7 || !baseHex.startsWith('#')) return baseHex
    const [h, s] = hexToHsl(baseHex)
    // Distribuye en rango [0.25, 0.75] igual que el SQL (asegura legibilidad en tema oscuro)
    const newL = total > 1 ? 0.25 + (position * 0.5 / (total - 1)) : 0.5
    return hslToHex(h, s, newL)
  } catch {
    return baseHex
  }
}

interface DonutChartProps {
  data: any[]
  hideAmounts: boolean
  total?: number
}

function DonutChart({ data, hideAmounts, total: totalOverride }: DonutChartProps) {
  const radius = 38
  const strokeWidth = 10
  const circumference = 2 * Math.PI * radius

  const total = typeof totalOverride === 'number'
    ? totalOverride
    : data.reduce((sum, item) => sum + (Number(item.total_consumido) || 0), 0)
  if (total === 0) return null

  let accumulatedPercent = 0

  return (
    <div className="donut-chart-container">
      <svg viewBox="0 0 100 100" className="donut-chart-svg">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="transparent"
          stroke="var(--surface)"
          strokeWidth={strokeWidth}
        />
        {(() => {
          let accumulatedPercent = 0
          const activeSegments = data.filter(item => (Number(item.porcentaje_del_total) || 0) > 0)
          const gap = activeSegments.length > 1 ? 2.5 : 0

          return data.map((item, idx) => {
            const percentage = Number(item.porcentaje_del_total) || 0
            if (percentage <= 0) return null
            const strokeLength = Math.max(0, (percentage / 100) * circumference - gap)
            const strokeOffset = - (accumulatedPercent / 100) * circumference
            accumulatedPercent += percentage

            return (
              <circle
                key={idx}
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke={item.color || 'var(--mint)'}
                strokeWidth={strokeWidth}
                strokeDasharray={`${strokeLength} ${circumference}`}
                strokeDashoffset={strokeOffset}
                transform="rotate(-90 50 50)"
                style={{
                  transition: 'stroke-dashoffset 0.5s ease',
                }}
              />
            )
          })
        })()}
      </svg>
      <div className="donut-center-text">
        <span className="donut-center-label">{t('donut_total_expense')}</span>
        <span className="donut-center-amount font-mono">
          {hideAmounts ? '***' : `$${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
        </span>
      </div>
    </div>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const { user, nombreUsuario } = useAuth()
  const { showToast } = useToast()
  const { hideAmounts, toggleEyeHide } = useHideAmounts(user?.id)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [movementToDelete, setMovementToDelete] = useState<number | null>(null)
  const [movementToEdit, setMovementToEdit] = useState<any | null>(null)

  const [fugasMisterioOcultado, setFugasMisterioOcultado] = useState(() => {
    return localStorage.getItem('ocultar_fugas_misterio') === 'true'
  })

  const handleOcultarFugasMisterio = () => {
    localStorage.setItem('ocultar_fugas_misterio', 'true')
    setFugasMisterioOcultado(true)
    showToast(t('fugas_misterio_ocultado_toast'), 'info')
  }

  // Datos de Base de Datos
  const [patrimonio, setPatrimonio] = useState<{ total_pesos: number; total_dolares: number } | null>(null)
  const [modoPresupuesto, setModoPresupuesto] = useState<'base_cero' | 'anticipado'>('base_cero')
  const [saldoHero, setSaldoHero] = useState<{ title: string; amount: number; isRed: boolean } | null>(null)
  const [alerts, setAlerts] = useState<{
    total_alertas: number
    egresos_cuarentena: number
    ingresos_cuarentena: number
    billeteras_rojas: number
    vencimientos_3_dias: any[]
    dias_asfixia_proximos: number
  } | null>(null)
  const [billeteras, setBilleteras] = useState<any[]>([])
  const [topCategorias, setTopCategorias] = useState<any[]>([])
  const [rankingCategorias, setRankingCategorias] = useState<any[]>([])
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [misterio, setMisterio] = useState<{ olvidos_pesos: number; olvidos_dolares: number } | null>(null)
  const [diaAncla, setDiaAncla] = useState<number>(1)
  const [homeFilters, setHomeFilters] = useState<HomeFilters>(() => getDefaultHomeFilters(1))
  const [filteredDataLoading, setFilteredDataLoading] = useState(false)
  const latestHomeFiltersRef = useRef(homeFilters)
  const homePreferencesDirtyRef = useRef(false)
  const homePreferencesHydratedUserRef = useRef<string | null>(null)

  // Paginación de actividad reciente
  const ACTIVITY_PAGE_SIZE = 20
  const [activityOffset, setActivityOffset] = useState(0)
  const [loadingMoreMovimientos, setLoadingMoreMovimientos] = useState(false)
  const [hasMoreMovimientos, setHasMoreMovimientos] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const pageTopRef = useRef<HTMLDivElement>(null)

  // Modal de Conciliación
  const [selectedBilletera, setSelectedBilletera] = useState<any | null>(null)
  const [showAllTopCategories, setShowAllTopCategories] = useState(false)

  // ── Filter for Recent Activity ──
  const [filterTarget, setFilterTarget] = useState<{
    type: 'rubro' | 'subcuenta'
    name: string
    ids: number[]
  } | null>(null)
  const [showFilterPicker, setShowFilterPicker] = useState(false)
  const [expandedFilterRubro, setExpandedFilterRubro] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [
        patrimonioRes,
        alertsRes,
        billeterasRes,
        topCategoriasRes,
        rankingCategoriasRes,
        movimientosRes,
        misterioRes,
        saldoAsignarRes,
        configRes
      ] = await Promise.all([
        rpc<{ total_pesos: number; total_dolares: number }[]>('fn_reporte_patrimonio_neto').catch(() => [] as any[]),
        rpc<any>('fn_reporte_alertas_home').catch(() => null),
        rpc<any[]>('fn_obtener_billeteras_activas').catch(() => [] as any[]),
        rpc<any[]>('fn_reporte_top_categorias_mes').catch(() => [] as any[]),
        rpc<any[]>('fn_reporte_ranking_categorias').catch(() => [] as any[]),
        rpc<any[]>('fn_reporte_movimientos_recientes', { p_limit: 20, p_offset: 0 }).catch(() => [] as any[]),
        rpc<{ olvidos_pesos: number; olvidos_dolares: number }[]>('fn_reporte_desviacion_misterio').catch(() => [] as any[]),
        rpc<number>('fn_obtener_saldo_a_asignar', { p_mes_periodo: new Date().toISOString().split('T')[0] }).catch(() => 0),
        rpc<any[]>('fn_obtener_config_presupuesto').catch(() => [] as any[])
      ])

      if (patrimonioRes && patrimonioRes.length > 0) {
        setPatrimonio(patrimonioRes[0])
      }
      setAlerts(alertsRes)
      setBilleteras(billeterasRes)
      setTopCategorias(topCategoriasRes)
      setRankingCategorias(rankingCategoriasRes)
      setMovimientos(movimientosRes)
      if (misterioRes && misterioRes.length > 0) {
        setMisterio(misterioRes[0])
      }

      // Obtener modo de presupuesto real de base de datos
      const cfg = configRes && configRes.length > 0 ? configRes[0] : null
      const modoReal = cfg?.modo_presupuesto || 'base_cero'
      setModoPresupuesto(modoReal)
      setDiaAncla(cfg?.dia_ancla_ciclo || 1)

      if (modoReal === 'base_cero') {
        const val = typeof saldoAsignarRes === 'number' ? saldoAsignarRes : 0
        setSaldoHero({ title: 'hero_title_to_assign', amount: val, isRed: val < 0 })
      } else {
        // En modo libertad (anticipado) no mostramos el saldo hero a la derecha
        setSaldoHero(null)
      }
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const activeCategoriasData = useMemo(() => {
    if (homeFilters.nivelCategorias === 'parents') {
      return topCategorias.map(c => ({
        ...c,
        total_consumido: Number(c.total_consumido) || 0,
        porcentaje_del_total: Number(c.porcentaje_del_total) || 0
      }))
    }

    // Construir mapa de nombre de rubro padre → color del padre (desde topCategorias)
    const parentColorMap: Record<string, string> = {}
    topCategorias.forEach(p => {
      if (p.nombre_categoria && p.color) {
        parentColorMap[p.nombre_categoria] = p.color
      }
    })

    // Agrupar hijos por padre para calcular posición dentro del grupo
    const siblingGroups: Record<string, number[]> = {}
    rankingCategorias.forEach((c, idx) => {
      if (c.nombre_rubro_padre) {
        if (!siblingGroups[c.nombre_rubro_padre]) siblingGroups[c.nombre_rubro_padre] = []
        siblingGroups[c.nombre_rubro_padre].push(idx)
      }
    })

    const total = rankingCategorias.reduce((sum, c) => sum + (Number(c.total_consumido) || 0), 0)

    return rankingCategorias.map((c, idx) => {
      let color = c.color

      // Si el hijo tiene un padre, derivar el color desde el color del padre
      // usando la posición del hijo dentro de su grupo de hermanos
      if (c.nombre_rubro_padre) {
        const parentColor = parentColorMap[c.nombre_rubro_padre]
        if (parentColor) {
          if (c.nombre_cuenta === t('no_detail')) {
            color = parentColor
          } else {
            const siblings = siblingGroups[c.nombre_rubro_padre] || [idx]
            const position = siblings.indexOf(idx)
            const totalSiblings = siblings.length
            color = generateColorVariation(parentColor, position, totalSiblings)
          }
        }
      }

      return {
        nombre_categoria: c.nombre_cuenta,
        icono: c.icono,
        color,
        total_consumido: Number(c.total_consumido),
        porcentaje_del_total: total > 0 ? (Number(c.total_consumido) / total) * 100 : 0
      }
    })
  }, [topCategorias, rankingCategorias, homeFilters.nivelCategorias])

  const fetchFilteredDashboardData = useCallback(async (filters: HomeFilters) => {
    if (!filters.fechaInicio || !filters.fechaFin || filters.fechaInicio > filters.fechaFin) return

    try {
      setFilteredDataLoading(true)
      const [topCategoriasRes, rankingCategoriasRes, movimientosRes] = await Promise.all([
        rpc<any[]>('fn_reporte_top_categorias_mes', {
          p_fecha_inicio: filters.fechaInicio,
          p_fecha_fin: filters.fechaFin,
          p_billetera_id: filters.billeteraId
        }).catch(() => [] as any[]),
        rpc<any[]>('fn_reporte_ranking_categorias', {
          p_fecha_inicio: filters.fechaInicio,
          p_fecha_fin: filters.fechaFin,
          p_billetera_id: filters.billeteraId
        }).catch(() => [] as any[]),
        rpc<any[]>('fn_reporte_movimientos_recientes', {
          p_limit: ACTIVITY_PAGE_SIZE,
          p_offset: 0,
          p_fecha_inicio: filters.fechaInicio,
          p_fecha_fin: filters.fechaFin,
          p_billetera_id: filters.billeteraId
        }).catch(() => [] as any[])
      ])

      setTopCategorias(topCategoriasRes)
      setRankingCategorias(rankingCategoriasRes)
      setMovimientos(movimientosRes)
      setActivityOffset(0)
      setHasMoreMovimientos(movimientosRes.length === ACTIVITY_PAGE_SIZE)
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setFilteredDataLoading(false)
    }
  }, [showToast])

  const loadMoreMovimientos = useCallback(async () => {
    if (loadingMoreMovimientos) return
    const filters = latestHomeFiltersRef.current
    const nextOffset = activityOffset + ACTIVITY_PAGE_SIZE
    try {
      setLoadingMoreMovimientos(true)
      const moreRes = await rpc<any[]>('fn_reporte_movimientos_recientes', {
        p_limit: ACTIVITY_PAGE_SIZE,
        p_offset: nextOffset,
        p_fecha_inicio: filters.fechaInicio,
        p_fecha_fin: filters.fechaFin,
        p_billetera_id: filters.billeteraId
      }).catch(() => [] as any[])
      setMovimientos(prev => [...prev, ...moreRes])
      setActivityOffset(nextOffset)
      setHasMoreMovimientos(moreRes.length === ACTIVITY_PAGE_SIZE)
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoadingMoreMovimientos(false)
    }
  }, [activityOffset, loadingMoreMovimientos, showToast])

  const cacheHomePreferences = useCallback((filters: HomeFilters) => {
    if (!user?.id) return

    localStorage.setItem(`${HOME_PREFERENCES_KEY_PREFIX}${user.id}`, JSON.stringify(serializeHomePreferences(filters)))
    localStorage.setItem(`${HOME_PREFERENCES_KEY_PREFIX}pending:${user.id}`, 'true')
    homePreferencesDirtyRef.current = true
  }, [user?.id])

  const updateHomeFilters = useCallback((filters: HomeFilters) => {
    setHomeFilters(filters)
    if (!hasValidHomeFilterRange(filters)) return

    latestHomeFiltersRef.current = filters
    cacheHomePreferences(filters)
  }, [cacheHomePreferences])

  const flushHomePreferences = useCallback(async () => {
    if (!user?.id || !homePreferencesDirtyRef.current) return

    const filtersToPersist = latestHomeFiltersRef.current
    const serializedPreferences = serializeHomePreferences(filtersToPersist)
    const serializedSnapshot = JSON.stringify(serializedPreferences)
    const cacheKey = `${HOME_PREFERENCES_KEY_PREFIX}${user.id}`
    const pendingKey = `${HOME_PREFERENCES_KEY_PREFIX}pending:${user.id}`

    try {
      await rpc('fn_actualizar_preferencia_usuario', { p_home_preferencias: serializedPreferences })
      const preferenceResponse = await rpc<{ home_preferencias: unknown }[]>('fn_obtener_preferencias_usuario')

      // Do not replace a newer local selection made while the request was in flight.
      if (JSON.stringify(serializeHomePreferences(latestHomeFiltersRef.current)) !== serializedSnapshot) return

      const persistedPreferences = preferenceResponse?.[0]?.home_preferencias
      if (persistedPreferences && typeof persistedPreferences === 'object') {
        localStorage.setItem(cacheKey, JSON.stringify(persistedPreferences))
      }
      localStorage.removeItem(pendingKey)
      homePreferencesDirtyRef.current = false
    } catch {
      // The cache and pending marker are intentionally retained for the next session.
    }
  }, [user?.id])

  useEffect(() => {
    localStorage.setItem('has_seen_coachmarks', 'true')
    fetchData()

    const handleSuccess = () => {
      fetchData()
    }
    const handleFugasChanged = () => {
      setFugasMisterioOcultado(localStorage.getItem('ocultar_fugas_misterio') === 'true')
    }
    window.addEventListener('movement-added', handleSuccess)
    window.addEventListener('fugas-config-changed', handleFugasChanged)
    return () => {
      window.removeEventListener('movement-added', handleSuccess)
      window.removeEventListener('fugas-config-changed', handleFugasChanged)
    }
  }, [fetchData])

  useEffect(() => {
    setHomeFilters((current) => {
      if (current.preset !== 'month') return current
      const nextRange = getPresetRange('month', diaAncla)
      if (current.fechaInicio === nextRange.fechaInicio && current.fechaFin === nextRange.fechaFin) return current
      return { ...current, ...nextRange }
    })
  }, [diaAncla])

  useEffect(() => {
    if (hasValidHomeFilterRange(homeFilters)) {
      latestHomeFiltersRef.current = homeFilters
    }
  }, [homeFilters])

  useEffect(() => {
    if (loading || !user?.id || homePreferencesHydratedUserRef.current === user.id) return

    homePreferencesHydratedUserRef.current = user.id
    const activeWalletIds = new Set(billeteras.map((billetera) => Number(billetera.billetera_id)))
    const cacheKey = `${HOME_PREFERENCES_KEY_PREFIX}${user.id}`
    const pendingKey = `${HOME_PREFERENCES_KEY_PREFIX}pending:${user.id}`
    const hasPendingPreferences = localStorage.getItem(pendingKey) === 'true'

    try {
      const cachedPreferences = localStorage.getItem(cacheKey)
      if (cachedPreferences) {
        const cachedFilters = parseHomePreferences(JSON.parse(cachedPreferences), diaAncla, activeWalletIds)
        if (cachedFilters) {
          latestHomeFiltersRef.current = cachedFilters
          setHomeFilters(cachedFilters)
        }
      }
    } catch {
      localStorage.removeItem(cacheKey)
    }

    if (hasPendingPreferences) {
      homePreferencesDirtyRef.current = true
      return
    }

    void (async () => {
      try {
        const preferenceResponse = await rpc<{ home_preferencias: unknown }[]>('fn_obtener_preferencias_usuario')
        const remoteFilters = parseHomePreferences(preferenceResponse?.[0]?.home_preferencias, diaAncla, activeWalletIds)
        if (!remoteFilters) return

        latestHomeFiltersRef.current = remoteFilters
        setHomeFilters(remoteFilters)
        localStorage.setItem(cacheKey, JSON.stringify(serializeHomePreferences(remoteFilters)))
      } catch {
        // A local/default selection keeps Home usable when preferences cannot be read.
      }
    })()
  }, [billeteras, diaAncla, loading, user?.id])

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') void flushHomePreferences()
    }
    const flushOnPageHide = () => {
      void flushHomePreferences()
    }

    document.addEventListener('visibilitychange', flushWhenHidden)
    window.addEventListener('pagehide', flushOnPageHide)
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden)
      window.removeEventListener('pagehide', flushOnPageHide)
      void flushHomePreferences()
    }
  }, [flushHomePreferences])

  useEffect(() => {
    if (loading) return
    fetchFilteredDashboardData(homeFilters)
  }, [homeFilters, fetchFilteredDashboardData, loading])

  // Mostrar FAB de volver-al-top cuando el usuario ha expandido la actividad y scrolleado
  useEffect(() => {
    const el = pageTopRef.current
    if (!el) return
    const handleScroll = () => {
      const scrollY = el.scrollTop
      setShowBackToTop(activityOffset > 0 && scrollY > 300)
    }
    handleScroll()
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [activityOffset])

  // Nombre Real para el Saludo (Observación 9)
  const saludoTexto = nombreUsuario ? `${getGreeting()}, ${nombreUsuario} 👋` : `${getGreeting()} 👋`

  // Crear mapa de monedas para los movimientos (caché en frontend)
  const walletCurrencyMap = useMemo(() => {
    const map: Record<string, string> = {}
    billeteras.forEach(b => {
      map[b.nombre] = b.moneda
    })
    return map
  }, [billeteras])

  // Formateo de montos respetando decimales del usuario (useNumberFormat)
  const { formatMonto: formatMontoBase } = useNumberFormat()
  const formatAmount = useCallback((monto: number, moneda: string) => {
    if (hideAmounts) return '***'
    return formatMontoBase(monto, moneda)
  }, [hideAmounts, formatMontoBase])

  // Semáforo con días detallados (Observación 3)
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

  const openConciliacion = (billetera: any) => {
    setSelectedBilletera(billetera)
  }

  const handleDeleteMovement = (id: number) => {
    setMovementToDelete(id)
  }

  const confirmDeleteMovement = async () => {
    if (movementToDelete === null) return
    const id = movementToDelete
    setMovementToDelete(null)
    try {
      await rpc('fn_eliminar_movimiento_caja', { p_caja_id: id })
      showToast(t('success_movement_deleted'), 'success')
      fetchData()
      window.dispatchEvent(new CustomEvent('movement-added'))
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  // ─── Hooks que SIEMPRE deben correr (incluso durante loading) ───
  // Regla de hooks: los hooks deben llamarse en el mismo orden y misma
  // cantidad en cada render. Si los movemos despues del return temprano
  // del spinner, la primera render (loading=true) llama N hooks y la
  // segunda (datos cargados) llama N+K → React error #310.
  const totalAlertas = alerts?.total_alertas ?? 0
  const patrimonioARS = patrimonio?.total_pesos ?? 0
  const patrimonioUSD = patrimonio?.total_dolares ?? 0
  // Animacion tipo velocimetro para el hero card. En el primer mount
  // arranca desde 0 (efecto aceleracion); en renders siguientes con
  // target cambiante, reanuda desde el valor actual.
  const animatedPatrimonioARS = useCountUp(patrimonioARS, { duration: 700 })
  const tieneFugaMisterio =
    ((misterio?.olvidos_pesos ?? 0) > 0 || (misterio?.olvidos_dolares ?? 0) > 0) &&
    !fugasMisterioOcultado
  const filterRangeInvalid = !homeFilters.fechaInicio || !homeFilters.fechaFin || homeFilters.fechaInicio > homeFilters.fechaFin

  const filteredMovimientos = useMemo(() => {
    if (!filterTarget) return movimientos
    return movimientos.filter(m => filterTarget.ids.includes(m.estructura_egreso_id))
  }, [movimientos, filterTarget])

  if (loading && movimientos.length === 0 && billeteras.length === 0) {
    return (
      <div className="page flex items-center justify-center" style={{ minHeight: '80vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  const visibleBilleteras = homeFilters.billeteraId === null
    ? billeteras
    : billeteras.filter((b) => b.billetera_id === homeFilters.billeteraId)

  const handlePeriodChange = (preset: HomePeriodPreset) => {
    if (preset === 'custom') {
      updateHomeFilters({ ...homeFilters, preset: 'custom' })
      return
    }
    const range = getPresetRange(preset, diaAncla)
    updateHomeFilters({ ...homeFilters, preset, ...range })
  }

  const handleShortcutRange = (shortcut: 'yesterday' | 'year' | 'previous_month') => {
    const range = getShortcutRange(shortcut, diaAncla)
    updateHomeFilters({ ...homeFilters, preset: 'custom', ...range })
  }

  return (
    <div className="page" ref={pageTopRef}>
      {/* ── HEADER ── */}
      <div className="home-header">
        <div>
          <p className="home-greeting">{saludoTexto}</p>
        </div>
        <div className="home-header-actions">
          <button
            className="home-icon-btn"
            onClick={toggleEyeHide}
            aria-label={hideAmounts ? 'Mostrar montos' : 'Ocultar montos'}
          >
            {hideAmounts ? '🙈' : '👁️'}
          </button>
          <button
            className="home-icon-btn home-bell-target"
            onClick={() => setAlertsOpen(!alertsOpen)}
            aria-label="Alertas"
            style={{ position: 'relative' }}
          >
            🔔
            {totalAlertas > 0 && (
              <span className="badge badge-red animate-pulse" style={{ position: 'absolute', top: -4, right: -4, fontSize: 'calc(10px * var(--font-scale))' }}>
                {totalAlertas}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── ALERTS PANEL ── */}
      {alertsOpen && alerts && (
        <div className="section" style={{ paddingTop: 0 }}>
          <div className="home-alerts-panel">
            <div className="home-alerts-header">
              <span className="home-alerts-title">Alertas Activas ({totalAlertas})</span>
              <button className="text-xs text-muted" onClick={() => setAlertsOpen(false)}>Cerrar ✕</button>
            </div>
            {alerts.egresos_cuarentena > 0 && (
              <div className="alert-item-row" style={{ cursor: 'pointer' }} onClick={() => navigate('/cuarentena')}>
                <span className="alert-item-label">📥 Transacciones en Cuarentena</span>
                <span className="alert-item-badge">{alerts.egresos_cuarentena}</span>
              </div>
            )}
            {alerts.billeteras_rojas > 0 && (
              <div className="alert-item-row" style={{ borderLeftColor: 'var(--coral)' }}>
                <span className="alert-item-label">🔴 Cuentas desconciliadas / en rojo</span>
                <span className="alert-item-badge">{alerts.billeteras_rojas}</span>
              </div>
            )}
            {alerts.dias_asfixia_proximos > 0 && (
              <div className="alert-item-row" style={{ borderLeftColor: 'var(--coral)' }}>
                <span className="alert-item-label">{t("home_alert_asfixia")}</span>
                <span className="alert-item-badge">{alerts.dias_asfixia_proximos}</span>
              </div>
            )}
            {alerts.vencimientos_3_dias && alerts.vencimientos_3_dias.length > 0 && (
              <div className="alert-vencimientos-list">
                <p className="text-xs text-muted font-semibold mt-1">{t('alert_upcoming_card_dues')}</p>
                {alerts.vencimientos_3_dias.map((v: any, i: number) => (
                  <div key={i} className="alert-vencimiento-card">
                    <span>💳 {v.tarjeta} {t('alert_card_due_in_days', { dias: v.dias })}</span>
                    <span className="font-mono font-semibold">{formatAmount(v.monto, 'ARS')}</span>
                  </div>
                ))}
              </div>
            )}
            {totalAlertas === 0 && (
              <p className="text-xs text-muted text-center py-2">{t('alert_all_ok_no_alerts')}</p>
            )}
          </div>
        </div>
      )}

      {/* Layout Principal de Dos Columnas en PC (Observación 1) */}
      <div className="home-dashboard-layout">
        
        {/* Columna Izquierda: Total y Cuentas */}
        <div className="home-dashboard-left-col">
          {/* ── TOTAL HERO (Observación 2) ── */}
          <div className="section home-section-total" style={{ paddingLeft: 0, paddingRight: 0, paddingTop: '4px', paddingBottom: '4px' }}>
            <div className="home-patrimonio card gradient-hero">
              <div className="home-patrimonio-top-flex">
                <div className="home-patrimonio-main-info">
                  <p className="home-patrimonio-label">{t('hero_title_total')}</p>
                  <p className="home-patrimonio-ars font-display animate-count">
                    {formatAmount(animatedPatrimonioARS, 'ARS')}
                  </p>
                </div>
                {saldoHero && (
                  <div className="home-patrimonio-extra-info">
                    <p className="home-patrimonio-label-right">{t(saldoHero.title)}</p>
                    <p className="home-patrimonio-extra-amount font-mono" style={{ color: saldoHero.isRed ? 'var(--coral)' : 'var(--mint)' }}>
                      {formatAmount(saldoHero.amount, 'ARS')}
                    </p>
                  </div>
                )}
              </div>
              {/* Ocultar dólares si es cero */}
              {patrimonioUSD > 0 && (
                <p className="home-patrimonio-usd font-mono" style={{ marginTop: '4px', textAlign: 'left' }}>
                  {hideAmounts ? '*** USD' : `U$S ${patrimonioUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              )}
              <div className="home-patrimonio-badge" style={{ marginTop: '8px' }}>
                <span className="dot dot-green" />
                <span className="text-xs text-muted">{t('hero_sync_ok')}</span>
              </div>
            </div>
          </div>

          {/* ── SECCIÓN DE BILLETERAS ── */}
          <div className="section home-section-billeteras" style={{ paddingTop: 0, paddingLeft: 0, paddingRight: 0, paddingBottom: '4px' }}>
            <div className="home-wallets-header mb-3">
              <div className="home-wallet-title-filter">
                <span className="section-title">{t('section_my_wallets')}</span>
                <label className="home-wallet-inline-filter">
                  <span className="sr-only">{t('home_filter_wallet_label')}</span>
                  <select
                    value={homeFilters.billeteraId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value
                      updateHomeFilters({ ...homeFilters, billeteraId: value ? Number(value) : null })
                    }}
                  >
                    <option value="">{t('home_filter_wallet_all')}</option>
                    {billeteras.map((b) => (
                      <option key={b.billetera_id} value={b.billetera_id}>{t(b.nombre)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <span className="text-xs text-muted scroll-hint-mobile">{t('horizontal_scroll_hint')}</span>
            </div>
            
            {visibleBilleteras.length === 0 ? (
              <div className="card p-5 text-center">
                <p className="text-sm text-muted">{t('wallets_empty')}</p>
              </div>
            ) : (
              <div className="billeteras-horizontal-scroll">
                {visibleBilleteras.map(b => {
                  const sem = getSemaforoDetails(b.ultima_conciliacion_at)
                  return (
                    <div key={b.billetera_id} className="billetera-card card">
                      <div className="billetera-card-header">
                        <span className="billetera-emoji-badge">{b.icono || '💵'}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {/* Explicación textual sutil al lado del semáforo (Observación 3) */}
                          <span style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 600, color: `var(--text-3)` }}>
                            {sem.text}
                          </span>
                          <span className={`dot dot-${sem.color}`} title={`Conciliado: ${sem.text}`} />
                        </div>
                      </div>
                      <div className="billetera-card-main">
                        <p className="billetera-card-name">{t(b.nombre)}</p>
                        <p className="billetera-card-saldo font-mono">{formatAmount(b.saldo_actual, b.moneda)}</p>
                        <span className="billetera-last-conciliated">
                          {sem.days !== null ? t('wallet_adjusted_days_ago', { days: sem.days }) : t('wallet_never_reconciled')}
                        </span>
                      </div>
                      <button className="btn-conciliar-action text-xs" onClick={() => openConciliacion(b)}>
                        {t('btn_reconcile')}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── MISTERIO WARNING ── */}
          {tieneFugaMisterio && (
            <div className="section home-section-fugas" style={{ paddingTop: 0, paddingLeft: 0, paddingRight: 0 }}>
              <div className="card" style={{ position: 'relative', background: 'rgba(255, 107, 107, 0.08)', borderColor: 'rgba(255, 107, 107, 0.3)', padding: 'var(--space-4)' }}>
                {/* RECORDATORIO: Mapear preferencia global 'ocultar_fugas_misterio' a base de datos en Fase de Configuración Global */}
                <button
                  type="button"
                  className="fugas-misterio-ocultar-btn"
                  onClick={handleOcultarFugasMisterio}
                  title={t('fugas_misterio_ocultar_tooltip')}
                  aria-label={t('fugas_misterio_ocultar_tooltip')}
                >
                  👁️
                </button>
                <h4 style={{ margin: 0, fontSize: 'calc(14px * var(--font-scale))', color: 'var(--coral)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {t('mystery_leak_warning')}
                </h4>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  {t('mystery_leak_desc_prefix')}{' '}
                  <strong style={{ color: 'var(--text)' }}>
                    {misterio?.olvidos_pesos ? formatAmount(misterio.olvidos_pesos, 'ARS') : ''}
                    {misterio?.olvidos_pesos && misterio?.olvidos_dolares ? ' y ' : ''}
                    {misterio?.olvidos_dolares ? formatAmount(misterio.olvidos_dolares, 'USD') : ''}
                  </strong>{' '}
                  {t('mystery_leak_desc_suffix')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Columna Derecha: Categorías y Actividad */}
        <div className="home-dashboard-right-col">
          {/* ── ANILLO / TOP CATEGORÍAS ── */}
          <div className="section home-section-donut" style={{ paddingTop: '4px', paddingLeft: 0, paddingRight: 0, paddingBottom: '4px' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="section-title">
                {t('section_expense_distribution_cycle', {
                  start: formatShortDateValue(homeFilters.fechaInicio),
                  end: formatShortDateValue(homeFilters.fechaFin)
                })}
              </span>
              <div className="segmented-control" style={{ maxWidth: '200px' }}>
                <button
                  type="button"
                  className={`segmented-item ${homeFilters.nivelCategorias === 'parents' ? 'active' : ''}`}
                  onClick={() => updateHomeFilters({ ...homeFilters, nivelCategorias: 'parents' })}
                  style={{ fontSize: 'calc(11px * var(--font-scale))', padding: '4px 8px' }}
                >
                  {t('segmented_only_parents')}
                </button>
                <button
                  type="button"
                  className={`segmented-item ${homeFilters.nivelCategorias === 'all' ? 'active' : ''}`}
                  onClick={() => updateHomeFilters({ ...homeFilters, nivelCategorias: 'all' })}
                  style={{ fontSize: 'calc(11px * var(--font-scale))', padding: '4px 8px' }}
                >
                  {t('segmented_all')}
                </button>
              </div>
            </div>

            <div className="card home-donut-card">
              <div className="home-period-tabs" role="group" aria-label={t('section_expense_distribution')}>
                {(['today', 'week', 'month', 'custom'] as HomePeriodPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`home-period-tab ${homeFilters.preset === preset ? 'active' : ''}`}
                    onClick={() => handlePeriodChange(preset)}
                    aria-pressed={homeFilters.preset === preset}
                  >
                    {t(`home_filter_period_${preset}`)}
                  </button>
                ))}
              </div>

              {homeFilters.preset === 'custom' && (
                <div className="home-custom-range">
                  <label>
                    <span>{t('home_filter_from')}</span>
                    <input
                      type="date"
                      value={homeFilters.fechaInicio}
                      onChange={(event) => updateHomeFilters({ ...homeFilters, fechaInicio: event.target.value })}
                      aria-invalid={filterRangeInvalid}
                    />
                  </label>
                  <label>
                    <span>{t('home_filter_to')}</span>
                    <input
                      type="date"
                      value={homeFilters.fechaFin}
                      onChange={(event) => updateHomeFilters({ ...homeFilters, fechaFin: event.target.value })}
                      aria-invalid={filterRangeInvalid}
                    />
                  </label>
                  <div className="home-range-shortcuts" aria-label={t('home_filter_period_custom')}>
                    <button type="button" onClick={() => handleShortcutRange('yesterday')}>{t('home_filter_shortcut_yesterday')}</button>
                    <button type="button" onClick={() => handleShortcutRange('previous_month')}>{t('home_filter_shortcut_previous_month')}</button>
                    <button type="button" onClick={() => handleShortcutRange('year')}>{t('home_filter_shortcut_year')}</button>
                  </div>
                  {filterRangeInvalid && (
                    <p className="home-filter-error" role="alert">{t('home_filters_invalid_range')}</p>
                  )}
                </div>
              )}

              {filteredDataLoading && <div className="home-filter-loading" aria-live="polite" />}

              {activeCategoriasData.length === 0 && !filteredDataLoading ? (
                <div className="empty-state">
                  <span className="empty-state-icon">📊</span>
                  <h3>{t('donut_empty_title')}</h3>
                  <p>{t('donut_empty_desc')}</p>
                </div>
              ) : (() => {
                const rawDataset = activeCategoriasData

                const totalConsumidoSum = rawDataset.reduce(
                  (sum: number, cat: any) => sum + (Number(cat.total_consumido) || 0), 0
                )

                const parentColorMap: Record<string, string> = {}

                topCategorias.forEach((tc: any) => {
                  if (tc.nombre_categoria && tc.color) {
                    const rawName = tc.nombre_categoria.toLowerCase().trim()
                    parentColorMap[rawName] = tc.color
                    const baseName = rawName.split('-')[0].trim()
                    if (baseName && !parentColorMap[baseName]) {
                      parentColorMap[baseName] = tc.color
                    }
                    const translated = t(tc.nombre_categoria).toLowerCase().trim()
                    if (translated) {
                      parentColorMap[translated] = tc.color
                      const baseTrans = translated.split('-')[0].trim()
                      if (baseTrans && !parentColorMap[baseTrans]) {
                        parentColorMap[baseTrans] = tc.color
                      }
                    }
                  }
                })

                rankingCategorias.forEach((rc: any) => {
                  if (rc.nombre_rubro_padre && rc.color) {
                    const rawName = rc.nombre_rubro_padre.toLowerCase().trim()
                    if (!parentColorMap[rawName]) parentColorMap[rawName] = rc.color
                    const baseName = rawName.split('-')[0].trim()
                    if (baseName && !parentColorMap[baseName]) parentColorMap[baseName] = rc.color
                  }
                  if (rc.estructura_id && rc.color && rc.es_padre) {
                    parentColorMap[`id:${rc.estructura_id}`] = rc.color
                  }
                })

                const parentGroupCounts: Record<string, number> = {}
                const parentGroupIndices: Record<string, number> = {}

                rawDataset.forEach((cat: any) => {
                  const parentName = cat.nombre_rubro_padre || cat.nombre_categoria || cat.nombre_cuenta || 'general'
                  const key = parentName.toLowerCase().trim()
                  parentGroupCounts[key] = (parentGroupCounts[key] || 0) + 1
                })

                const sortedCategories = rawDataset
                  .map((cat: any) => {
                    const nombre = cat.nombre_categoria || cat.nombre_cuenta || ''
                    const parentName = cat.nombre_rubro_padre || nombre
                    const parentKey = parentName.toLowerCase().trim()
                    const baseName = parentKey.split('-')[0].trim()

                    const baseColor = parentColorMap[`id:${cat.estructura_id}`]
                      || parentColorMap[parentKey]
                      || parentColorMap[baseName]
                      || cat.color
                      || 'var(--surface-3)'

                    const isSubaccount = Boolean(cat.nombre_rubro_padre || cat.es_padre === false)

                    const indexInGroup = parentGroupIndices[parentKey] || 0
                    parentGroupIndices[parentKey] = indexInGroup + 1
                    const groupCount = parentGroupCounts[parentKey] || 1

                    const finalColor = (nombre === t('no_detail'))
                      ? baseColor
                      : isSubaccount
                        ? generateColorShade(baseColor, indexInGroup, groupCount)
                        : (cat.color || baseColor)

                    const totalConsumido = Number(cat.total_consumido) || 0
                    const porcentaje = (cat.porcentaje_del_total !== undefined && cat.porcentaje_del_total !== null)
                      ? Number(cat.porcentaje_del_total)
                      : (totalConsumidoSum > 0 ? (totalConsumido / totalConsumidoSum) * 100 : 0)

                    return {
                      ...cat,
                      nombre_categoria: nombre,
                      nombre_cuenta: nombre,
                      total_consumido: totalConsumido,
                      porcentaje_del_total: porcentaje,
                      color: finalColor,
                      icono: cat.icono || '🏷️'
                    }
                  })
                  .sort((a: any, b: any) => b.total_consumido - a.total_consumido)

                const displayedCategories = showAllTopCategories ? sortedCategories : sortedCategories.slice(0, 3)
                const canExpand = sortedCategories.length > 3

                const donutSlice = sortedCategories.slice(0, 7)
                const donutSliceSum = donutSlice.reduce(
                  (sum: number, cat: any) => sum + (Number(cat.total_consumido) || 0), 0
                )
                const donutData = donutSlice.map((c: any) => {
                  const consumed = Number(c.total_consumido) || 0
                  return {
                    ...c,
                    porcentaje_del_total: donutSliceSum > 0 ? (consumed / donutSliceSum) * 100 : 0
                  }
                })

                return (
                  <div className="donut-section-wrapper">
                    <DonutChart
                      data={donutData}
                      total={totalConsumidoSum}
                      hideAmounts={hideAmounts}
                    />
                    <div className="category-breakdown-list" style={{ flex: 1, width: '100%' }}>
                      {(canExpand || showAllTopCategories) && (
                        <div className="category-breakdown-top-action" style={{
                          display: 'flex',
                          justifyContent: 'flex-start',
                          alignItems: 'center',
                          marginBottom: '8px',
                          width: '100%'
                        }}>
                          <button
                            type="button"
                            className="btn-see-all-toggle"
                            style={{
                              background: 'rgba(0, 229, 153, 0.12)',
                              color: 'var(--mint)',
                              border: '1px solid rgba(0, 229, 153, 0.25)',
                              borderRadius: '16px',
                              padding: '4px 12px',
                              fontSize: 'calc(0.78rem * var(--font-scale))',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={() => setShowAllTopCategories(!showAllTopCategories)}
                          >
                            <span>{showAllTopCategories ? '▲' : '▼'}</span>
                            <span>
                              {showAllTopCategories
                                ? t('donut_show_less_categories')
                                : t('donut_see_all_categories', { count: sortedCategories.length })}
                            </span>
                          </button>
                        </div>
                      )}
                      {displayedCategories.map((c, i) => {
                        const pct = Number(c.porcentaje_del_total) || 0
                        return (
                          <div key={i} className="category-breakdown-item">
                            <div className="category-info-row">
                              <div className="category-label-wrap">
                                <span className="category-icon-badge" style={{
                                  backgroundColor: c.color || 'var(--surface-3)',
                                  borderColor: c.color || 'var(--border)',
                                  color: '#000000',
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 'calc(14px * var(--font-scale))',
                                  flexShrink: 0
                                }}>
                                  <span>{c.icono || '🏷️'}</span>
                                </span>
                                <span className="category-name">{c.nombre_categoria ? t(c.nombre_categoria) : ''}</span>
                              </div>
                              <div className="category-amount-wrap">
                                <span className="category-amount">{formatAmount(c.total_consumido, 'ARS')}</span>
                                <span className="category-percentage">{pct.toFixed(0)}%</span>
                              </div>
                            </div>
                            <div className="category-progress-bar-bg">
                              <div
                                className="category-progress-bar-fill"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: c.color || 'var(--mint)'
                                }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* ── FEED RECIENTE ── */}
          <div className="section home-section-feed" style={{ paddingTop: 0, paddingLeft: 0, paddingRight: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="section-title">{t('section_recent_activity')}</span>
              <button
                type="button"
                className="home-filter-btn"
                onClick={() => setShowFilterPicker(true)}
              >
                {t('filter')}{filterTarget ? ` · ${filterTarget.name}` : ''}
              </button>
            </div>
            
            {filteredMovimientos.length === 0 ? (
              <div className="card">
                <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                  <span className="empty-state-icon">💸</span>
                  <h3>{filterTarget ? t('filter_all_movements') : t('activity_empty_title')}</h3>
                  {!filterTarget && <p>{t('activity_empty_desc_prefix')}<strong style={{ color: 'var(--mint)' }}>+</strong>{t('activity_empty_desc_suffix')}</p>}
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <div className="timeline-feed">
                  {filteredMovimientos.map((m) => {
                    const moneda = walletCurrencyMap[m.nombre_billetera] ?? 'ARS'
                    const esEgreso = m.monto < 0
                    return (
                      <div key={m.p_caja_id} className="timeline-item" onClick={() => setMovementToEdit(m)} style={{ cursor: 'pointer' }}>
                        <div
                          className="timeline-item-icon"
                          style={{
                            backgroundColor: m.color_categoria || 'var(--surface-2)',
                            borderColor: m.color_categoria || 'var(--border)',
                            color: '#000000',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <span>{m.icono_categoria || '💰'}</span>
                        </div>
                        <div className="timeline-item-details">
                          <div className="timeline-item-title-row">
                            <span className="timeline-item-category">{m.nombre_categoria ? t(m.nombre_categoria) : t('movement_category_general')}</span>
                            <span className={`timeline-item-amount ${esEgreso ? 'negative' : 'positive'}`}>
                              {m.monto > 0 ? '+' : ''}
                              {formatAmount(m.monto, moneda)}
                            </span>
                          </div>
                          <div className="timeline-item-subtext-row">
                            <span className="timeline-item-detail">
                              {esEgreso && !m.billetera_origen_id && m.nombre_billetera ? (
                                t(m.nombre_billetera)
                              ) : (
                                <>
                                  {m.nombre_billetera ? t(m.nombre_billetera) : ''}
                                  {m.detalle ? ` · ${t(m.detalle)}` : ''}
                                </>
                              )}
                            </span>
                             <span>{(() => {
                               const parts = m.fecha.split('-');
                               const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                               return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
                             })()}</span>
                          </div>
                        </div>
                        <button
                          className="timeline-item-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteMovement(m.p_caja_id)
                          }}
                          title={t('btn_delete_movement')}
                          aria-label={t('btn_delete_movement')}
                        >
                          🗑️
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* Botón Ver más */}
                {hasMoreMovimientos ? (
                  <button
                    className="activity-see-more-btn"
                    onClick={loadMoreMovimientos}
                    disabled={loadingMoreMovimientos}
                    aria-label={t('activity_see_more')}
                  >
                    {loadingMoreMovimientos ? t('activity_loading_more') : `${t('activity_see_more')} ↓`}
                  </button>
                ) : (
                  activityOffset > 0 && (
                    <p className="activity-no-more-label">{t('activity_no_more')}</p>
                  )
                )}
              </div>
            )}
          </div>

          {/* FAB volver al top (visible solo cuando hay movimientos expandidos) */}
          <button
            className={`activity-back-to-top-fab${showBackToTop ? ' visible' : ''}`}
            onClick={() => {
              // 1. Cerrar los detalles extras: resetear a los 20 movimientos iniciales
              if (activityOffset > 0) {
                fetchFilteredDashboardData(homeFilters)
              }
              // 2. Llevar al top del contenedor scrollable
              pageTopRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
              // 3. Ocultar la flecha
              setShowBackToTop(false)
            }}
            title={t('activity_back_to_top')}
            aria-label={t('activity_back_to_top')}
          >
            ↑
          </button>
        </div>

      </div>

      {/* ── MODAL CONCILIACIÓN RÁPIDA ── */}
      {selectedBilletera && (
        <ReconcileWalletModal
          billetera={selectedBilletera}
          formatAmount={formatAmount}
          onClose={() => setSelectedBilletera(null)}
          onSuccess={fetchData}
        />
      )}
      {/* ── MODAL: CONFIRM ELIMINAR ── */}
      <ConfirmModal
        isOpen={movementToDelete !== null}
        title={t('delete_movement_title')}
        message={t('confirm_delete_movement')}
        confirmText={t('btn_delete')}
        cancelText={t('btn_cancel')}
        type="danger"
        onConfirm={confirmDeleteMovement}
        onCancel={() => setMovementToDelete(null)}
      />
      {movementToEdit && (
        <EditMovementModal
          movement={movementToEdit}
          onClose={() => setMovementToEdit(null)}
          onSuccess={() => {
            fetchData()
            window.dispatchEvent(new CustomEvent('movement-added'))
          }}
        />
      )}

      {/* ── FILTER PICKER MODAL ── */}
      {showFilterPicker && (
        <div className="home-filter-overlay" onClick={() => setShowFilterPicker(false)}>
          <div className="home-filter-picker" onClick={(e) => e.stopPropagation()}>
            <div className="home-filter-picker-header">
              <span className="home-filter-picker-title">{t('filter_select_rubro')}</span>
              <button className="home-filter-picker-close" onClick={() => setShowFilterPicker(false)}>✕</button>
            </div>

            {filterTarget && (
              <button
                className="home-filter-clear-btn"
                onClick={() => { setFilterTarget(null); setShowFilterPicker(false) }}
              >
                {t('filter_clear')}
              </button>
            )}

            <div className="home-filter-picker-list">
              {topCategorias.map((rubro: any) => {
                const rubroName = rubro.nombre_categoria
                const isExpanded = expandedFilterRubro === rubroName
                const children = rankingCategorias.filter(
                  (r: any) => r.nombre_rubro_padre === rubroName
                )
                const childIds = children.map((c: any) => Number(c.estructura_id))

                return (
                  <div key={rubroName} className="home-filter-rubro-group">
                    <div className="home-filter-rubro-row">
                      <button
                        className="home-filter-rubro-btn"
                        onClick={() => {
                          setFilterTarget({ type: 'rubro', name: t(rubroName), ids: childIds.length > 0 ? childIds : [Number(rubro.estructura_id)] })
                          setShowFilterPicker(false)
                        }}
                      >
                        <span className="home-filter-rubro-icon">{rubro.icono || '🏷️'}</span>
                        <span className="home-filter-rubro-name">{t(rubroName)}</span>
                      </button>
                      {children.length > 0 && (
                        <button
                          className="home-filter-expand-btn"
                          onClick={() => setExpandedFilterRubro(isExpanded ? null : rubroName)}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      )}
                    </div>
                    {isExpanded && children.length > 0 && (
                      <div className="home-filter-children">
                        <button
                          className="home-filter-child-btn"
                          onClick={() => {
                            setFilterTarget({ type: 'rubro', name: `${t(rubroName)} (${t('filter_all')})`, ids: childIds })
                            setShowFilterPicker(false)
                          }}
                        >
                          ↳ {t('filter_all')}
                        </button>
                        {children.map((child: any) => (
                          <button
                            key={child.estructura_id}
                            className="home-filter-child-btn"
                            onClick={() => {
                              setFilterTarget({ type: 'subcuenta', name: t(child.nombre_cuenta), ids: [Number(child.estructura_id)] })
                              setShowFilterPicker(false)
                            }}
                          >
                            <span>{child.icono || '  ↳'}</span>
                            <span>{t(child.nombre_cuenta)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
