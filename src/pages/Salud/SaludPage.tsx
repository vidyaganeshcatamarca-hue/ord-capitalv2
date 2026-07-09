import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { ScoreHero } from '@/components/salud/ScoreHero'
import { InsightsList, type HealthInsight } from '@/components/salud/InsightsList'
import { PilaresList, type HealthPillarRow } from '@/components/salud/PilaresList'
import { HistoricoScoreChart, type HealthHistoryPoint } from '@/components/salud/HistoricoScoreChart'
import type { HealthDimensions, HealthPillarKey } from '@/components/salud/ScoreRadar'
import './SaludPage.css'

interface HealthScoreResponse {
  score_global: number
  estado: string
  dimensiones: Partial<Record<HealthPillarKey, number | string | null>>
  datos_detalle?: Record<string, unknown>
}

const EMPTY_DIMENSIONS: HealthDimensions = {
  proteccion: 0,
  presupuesto: 0,
  deuda: 0,
  crecimiento: 0,
  ahorro: 0,
}

const PILLAR_CONFIG: Array<{ key: HealthPillarKey; weight: number; route: string }> = [
  { key: 'proteccion', weight: 15, route: '/supervivencia' },
  { key: 'presupuesto', weight: 25, route: '/presupuesto' },
  { key: 'deuda', weight: 25, route: '/saneamiento' },
  { key: 'crecimiento', weight: 15, route: '/inversiones' },
  { key: 'ahorro', weight: 20, route: '/billeteras' },
]

function normalizeScore(raw: HealthScoreResponse | null): HealthScoreResponse | null {
  if (!raw) return null
  const dimensiones = raw.dimensiones ?? {}
  return {
    ...raw,
    score_global: Number(raw.score_global ?? 0),
    estado: raw.estado || 'health_critical',
    dimensiones: {
      proteccion: Number(dimensiones.proteccion ?? 0),
      presupuesto: Number(dimensiones.presupuesto ?? 0),
      deuda: Number(dimensiones.deuda ?? 0),
      crecimiento: Number(dimensiones.crecimiento ?? 0),
      ahorro: Number(dimensiones.ahorro ?? 0),
    },
  }
}

function normalizeInsights(raw: unknown): HealthInsight[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => ({
    priority: String(item?.priority ?? 'low'),
    dimension: String(item?.dimension ?? 'general'),
    message_key: String(item?.message_key ?? 'health_insights_unavailable'),
    params: item?.params && typeof item.params === 'object' ? item.params : {},
    action_route: String(item?.action_route ?? '/'),
  }))
}

function normalizeHistory(raw: unknown): HealthHistoryPoint[] {
  if (!Array.isArray(raw)) return []
  return raw.map((point) => ({
    fecha: String(point?.fecha ?? ''),
    score_global: Number(point?.score_global ?? 0),
    estado_key: String(point?.estado_key ?? 'health_critical'),
  })).filter((point) => point.fecha.length > 0)
}

function normalizeRoute(route: string) {
  if (route === '/fondos' || route === '/sobres') return '/billeteras'
  if (route === '/bola-nieve') return '/saneamiento'
  if (route === '/presupuestos') return '/presupuesto'
  if (['/', '/billeteras', '/presupuesto', '/saneamiento', '/supervivencia', '/inversiones'].includes(route)) {
    return route
  }
  return '/'
}

function dimensionsFrom(score: HealthScoreResponse | null): HealthDimensions {
  if (!score) return EMPTY_DIMENSIONS
  return score.dimensiones as HealthDimensions
}

function scoreDelta(history: HealthHistoryPoint[], currentScore: number | null) {
  if (currentScore === null || history.length === 0) return null
  const previous = history[history.length - 1]
  if (!previous) return null
  return currentScore - previous.score_global
}

export function SaludPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [score, setScore] = useState<HealthScoreResponse | null>(null)
  const [insights, setInsights] = useState<HealthInsight[]>([])
  const [history, setHistory] = useState<HealthHistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [insightsError, setInsightsError] = useState(false)
  const [historyError, setHistoryError] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setInsightsError(false)
    setHistoryError(false)

    try {
      const [scoreRes, insightsRes, historyRes] = await Promise.all([
        supabase.rpc('fn_reporte_score_salud_financiera'),
        supabase.rpc('fn_generar_insights_salud'),
        supabase.rpc('fn_reporte_historico_score', { p_dias_atras: 180 }),
      ])

      if (scoreRes.error) throw scoreRes.error
      setScore(normalizeScore(scoreRes.data as HealthScoreResponse))

      if (insightsRes.error) {
        setInsights([])
        setInsightsError(true)
      } else {
        setInsights(normalizeInsights(insightsRes.data))
      }

      if (historyRes.error) {
        setHistory([])
        setHistoryError(true)
      } else {
        setHistory(normalizeHistory(historyRes.data))
      }
    } catch (err) {
      const message = parseError(err) || t('error_generic')
      setError(message)
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const dimensions = dimensionsFrom(score)
  const currentScore = score ? Number(score.score_global) : null
  const pillars = useMemo<HealthPillarRow[]>(() => PILLAR_CONFIG.map((pillar) => ({
    ...pillar,
    score: dimensions[pillar.key],
  })), [dimensions])

  const handleNavigate = (route: string) => {
    haptics.light()
    navigate(normalizeRoute(route))
  }

  if (loading) {
    return (
      <main className="page salud-page salud-page--loading" aria-busy="true">
        <div className="salud-spinner" aria-hidden="true" />
        <p>{t('loading')}</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page salud-page salud-page--error" role="alert">
        <p>{error}</p>
        <button type="button" className="salud-retry" onClick={loadData}>{t('health_retry')}</button>
      </main>
    )
  }

  return (
    <main className="page salud-page">
      <header className="salud-header">
        <p className="salud-kicker">{t('menu_salud')}</p>
        <h1>{t('health_title')}</h1>
        <p>{t('health_subtitle')}</p>
      </header>

      <ScoreHero
        score={currentScore}
        estado={score?.estado ?? 'health_critical'}
        dimensiones={dimensions}
        delta={scoreDelta(history, currentScore)}
      />

      <div className="salud-grid">
        <InsightsList insights={insights} unavailable={insightsError} onNavigate={handleNavigate} />
        <PilaresList pillars={pillars} onNavigate={handleNavigate} />
      </div>

      <HistoricoScoreChart points={history} error={historyError} onRetry={loadData} />
    </main>
  )
}

export default SaludPage
