import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { EditMovementModal } from '@/components/EditMovementModal/EditMovementModal'
import './Home.css'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return t('greeting_morning')
  if (h < 19) return t('greeting_afternoon')
  return t('greeting_night')
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
}

function DonutChart({ data, hideAmounts }: DonutChartProps) {
  const radius = 38
  const strokeWidth = 10
  const circumference = 2 * Math.PI * radius

  const total = data.reduce((sum, item) => sum + (Number(item.total_consumido) || 0), 0)
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
  const { user } = useAuth()
  const { showToast } = useToast()
  const [hideAmounts, setHideAmounts] = useState(false)
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
  const [showSubcategories, setShowSubcategories] = useState(false)
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [misterio, setMisterio] = useState<{ olvidos_pesos: number; olvidos_dolares: number } | null>(null)
  const [diaAncla, setDiaAncla] = useState<number>(1)

  // Modal de Conciliación
  const [selectedBilletera, setSelectedBilletera] = useState<any | null>(null)
  const [saldoReal, setSaldoReal] = useState<string>('0')

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
    if (!showSubcategories) {
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
          const siblings = siblingGroups[c.nombre_rubro_padre] || [idx]
          const position = siblings.indexOf(idx)
          const totalSiblings = siblings.length
          color = generateColorVariation(parentColor, position, totalSiblings)
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
  }, [showSubcategories, topCategorias, rankingCategorias])

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

  // Nombre Real para el Saludo (Observación 9)
  const nombreReal = user?.user_metadata?.nombre || user?.user_metadata?.full_name
  const saludoTexto = nombreReal ? `${getGreeting()}, ${nombreReal} 👋` : `${getGreeting()} 👋`

  // Crear mapa de monedas para los movimientos (caché en frontend)
  const walletCurrencyMap = useMemo(() => {
    const map: Record<string, string> = {}
    billeteras.forEach(b => {
      map[b.nombre] = b.moneda
    })
    return map
  }, [billeteras])

  // Cachear formateadores para evitar recreación Intl.NumberFormat (F-02)
  const formatters = useMemo(() => ({
    ARS: new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }),
    USD: new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    })
  }), [])

  const formatAmount = useCallback((monto: number, moneda: string) => {
    if (hideAmounts) return '***'
    const formatter = moneda === 'USD' ? formatters.USD : formatters.ARS
    return formatter.format(monto)
  }, [hideAmounts, formatters])

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
    setSaldoReal(billetera.saldo_actual.toString())
  }

  const handleConciliar = async () => {
    if (!selectedBilletera) return
    const saldoNum = parseFloat(saldoReal)
    if (isNaN(saldoNum)) {
      showToast(t('error_field_invalid', { field: 'Saldo Real' }), 'error')
      return
    }

    try {
      await rpc('fn_ejecutar_conciliacion', {
        p_billetera_id: selectedBilletera.billetera_id,
        p_saldo_real: saldoNum
      })
      
      const diff = saldoNum - parseFloat(selectedBilletera.saldo_actual)
      if (diff === 0) {
        showToast(t('success_conciliation_no_diff'), 'success')
      } else {
        showToast(t('success_conciliation_with_diff', { category: t('cat_mystery') }), 'success')
      }
      
      setSelectedBilletera(null)
      fetchData()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') {
      setSaldoReal('')
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value.trim() === '') {
      setSaldoReal('0')
    }
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

  if (loading && movimientos.length === 0 && billeteras.length === 0) {
    return (
      <div className="page flex items-center justify-center" style={{ minHeight: '80vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  const totalAlertas = alerts?.total_alertas ?? 0
  const patrimonioARS = patrimonio?.total_pesos ?? 0
  const patrimonioUSD = patrimonio?.total_dolares ?? 0
  const tieneFugaMisterio = 
    ((misterio?.olvidos_pesos ?? 0) > 0 || (misterio?.olvidos_dolares ?? 0) > 0) &&
    !fugasMisterioOcultado

  return (
    <div className="page">
      {/* ── HEADER ── */}
      <div className="home-header">
        <div>
          <p className="home-greeting">{saludoTexto}</p>
        </div>
        <div className="home-header-actions">
          <button
            className="home-icon-btn"
            onClick={() => setHideAmounts(!hideAmounts)}
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
              <span className="badge badge-red animate-pulse" style={{ position: 'absolute', top: -4, right: -4, fontSize: 10 }}>
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
                <span className="alert-item-label">⚠️ Días de Asfixia Financiera próximos</span>
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
                    {formatAmount(patrimonioARS, 'ARS')}
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
                <p className="home-patrimonio-usd font-mono" style={{ marginTop: '8px', textAlign: 'left' }}>
                  {hideAmounts ? '*** USD' : `U$S ${patrimonioUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              )}
              <div className="home-patrimonio-badge" style={{ marginTop: '12px' }}>
                <span className="dot dot-green" />
                <span className="text-xs text-muted">{t('hero_sync_ok')}</span>
              </div>
            </div>
          </div>

          {/* ── SECCIÓN DE BILLETERAS ── */}
          <div className="section home-section-billeteras" style={{ paddingTop: 0, paddingLeft: 0, paddingRight: 0, paddingBottom: '4px' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="section-title">{t('section_my_wallets')}</span>
              <span className="text-xs text-muted scroll-hint-mobile">{t('horizontal_scroll_hint')}</span>
            </div>
            
            {billeteras.length === 0 ? (
              <div className="card p-5 text-center">
                <p className="text-sm text-muted">{t('wallets_empty')}</p>
              </div>
            ) : (
              <div className="billeteras-horizontal-scroll">
                {billeteras.map(b => {
                  const sem = getSemaforoDetails(b.ultima_conciliacion_at)
                  return (
                    <div key={b.billetera_id} className="billetera-card card">
                      <div className="billetera-card-header">
                        <span className="billetera-emoji-badge">{b.icono || '💵'}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {/* Explicación textual sutil al lado del semáforo (Observación 3) */}
                          <span style={{ fontSize: '10px', fontWeight: 600, color: `var(--text-3)` }}>
                            {sem.text}
                          </span>
                          <span className={`dot dot-${sem.color}`} title={`Conciliado: ${sem.text}`} />
                        </div>
                      </div>
                      <div className="billetera-card-main">
                        <p className="billetera-card-name">{b.nombre}</p>
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
                <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--coral)', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                {(() => {
                  const today = new Date()
                  const year = today.getFullYear()
                  const month = today.getMonth()
                  const day = today.getDate()
                  let start: Date
                  let end: Date
                  if (day >= diaAncla) {
                    start = new Date(year, month, diaAncla)
                    end = new Date(year, month + 1, diaAncla - 1)
                  } else {
                    start = new Date(year, month - 1, diaAncla)
                    end = new Date(year, month, diaAncla - 1)
                  }
                  const formatShortDate = (d: Date) => {
                    const dd = String(d.getDate()).padStart(2, '0')
                    const mm = String(d.getMonth() + 1).padStart(2, '0')
                    return `${dd}/${mm}`
                  }
                  return t('section_expense_distribution_cycle', {
                    start: formatShortDate(start),
                    end: formatShortDate(end)
                  })
                })()}
              </span>
              <div className="segmented-control" style={{ maxWidth: '200px' }}>
                <button
                  type="button"
                  className={`segmented-item ${!showSubcategories ? 'active' : ''}`}
                  onClick={() => setShowSubcategories(false)}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  {t('segmented_only_parents')}
                </button>
                <button
                  type="button"
                  className={`segmented-item ${showSubcategories ? 'active' : ''}`}
                  onClick={() => setShowSubcategories(true)}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  {t('segmented_all')}
                </button>
              </div>
            </div>
            
            {activeCategoriasData.length === 0 ? (
              <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
                <div className="empty-state">
                  <span className="empty-state-icon">📊</span>
                  <h3>{t('donut_empty_title')}</h3>
                  <p>{t('donut_empty_desc')}</p>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <div className="donut-section-wrapper">
                  <DonutChart data={activeCategoriasData} hideAmounts={hideAmounts} />
                  <div className="category-breakdown-list" style={{ flex: 1, width: '100%' }}>
                    {activeCategoriasData.map((c, i) => (
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
                              fontSize: '14px',
                              flexShrink: 0
                            }}>
                              <span style={{ filter: 'brightness(0)' }}>{c.icono || '🏷️'}</span>
                            </span>
                            <span className="category-name">{t(c.nombre_categoria)}</span>
                          </div>
                          <div className="category-amount-wrap">
                            <span className="category-amount">{formatAmount(c.total_consumido, 'ARS')}</span>
                            <span className="category-percentage">{c.porcentaje_del_total.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="category-progress-bar-bg">
                          <div
                            className="category-progress-bar-fill"
                            style={{
                              width: `${c.porcentaje_del_total}%`,
                              backgroundColor: c.color || 'var(--mint)'
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── FEED RECIENTE ── */}
          <div className="section home-section-feed" style={{ paddingTop: 0, paddingLeft: 0, paddingRight: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="section-title">{t('section_recent_activity')}</span>
            </div>
            
            {movimientos.length === 0 ? (
              <div className="card">
                <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                  <span className="empty-state-icon">💸</span>
                  <h3>{t('activity_empty_title')}</h3>
                  <p>{t('activity_empty_desc_prefix')}<strong style={{ color: 'var(--mint)' }}>+</strong>{t('activity_empty_desc_suffix')}</p>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <div className="timeline-feed">
                  {movimientos.map((m) => {
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
                          <span style={m.color_categoria ? { filter: 'brightness(0)' } : {}}>{m.icono_categoria || '💰'}</span>
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
                                m.nombre_billetera
                              ) : (
                                <>
                                  {m.nombre_billetera}
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
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── MODAL CONCILIACIÓN RÁPIDA ── */}
      {selectedBilletera && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setSelectedBilletera(null)} />
          <div className="bottom-sheet add-movement-sheet">
            <div className="bottom-sheet-handle" />
            <div style={{ padding: 'var(--space-2) var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h3 className="font-display" style={{ fontSize: '18px', margin: 0 }}>
                  {t('reconcile_wallet_title', { nombre: selectedBilletera.nombre })}
                </h3>
                <button type="button" className="text-xs text-muted" onClick={() => setSelectedBilletera(null)}>{t('btn_close')}</button>
              </div>

              <div className="card mb-3" style={{ background: 'var(--surface-2)', textAlign: 'center', padding: 'var(--space-3)' }}>
                <p className="text-xs text-muted uppercase tracking-wider mb-1">{t('reconcile_theoretical_balance')}</p>
                <p className="font-mono font-bold" style={{ fontSize: '22px', color: 'var(--text)' }}>
                  {formatAmount(selectedBilletera.saldo_actual, selectedBilletera.moneda)}
                </p>
              </div>

              <div className="form-group mb-4">
                <label className="text-xs text-muted mb-2 block font-semibold">{t('reconcile_real_balance')}</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                    {selectedBilletera.moneda === 'USD' ? 'U$S' : '$'}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control font-mono"
                    style={{ paddingLeft: 45, fontSize: '18px', fontWeight: 'bold' }}
                    value={saldoReal}
                    onChange={(e) => setSaldoReal(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button className="btn btn-secondary flex-1" onClick={() => setSelectedBilletera(null)}>
                  {t('btn_cancel')}
                </button>
                <button className="btn btn-primary flex-1" onClick={handleConciliar}>
                  {t('btn_confirm_adjustment')}
                </button>
              </div>
            </div>
          </div>
        </>
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
    </div>
  )
}
