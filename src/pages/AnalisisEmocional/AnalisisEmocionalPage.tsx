import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { useHogar } from '@/contexts/HogarContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { BCGScatterPlot, type BCGPoint } from '@/components/bcg/BCGScatterPlot'
import { BCGCuadranteAcordeon } from '@/components/bcg/BCGCuadranteAcordeon'
import { BCGResumenCuadrantes, type ResumenCuadrante } from '@/components/bcg/BCGResumenCuadrantes'
import { BCGSelectMes } from '@/components/bcg/BCGSelectMes'
import { BCGPodora } from '@/components/bcg/BCGPodora'
import { BCGHormigas } from '@/components/bcg/BCGHormigas'
import './AnalisisEmocionalPage.css'

type BcgTab = 'matriz' | 'podadora' | 'hormigas'

interface HormigaResumen {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  color: string
  frecuencia_mensual: number
  gasto_mensual_estimado: number
  impacto_anual: number
  porcentaje_del_ingreso: number
}

interface PodoraCandidato {
  estructura_id: number
  nombre: string
  icono: string
  color: string
  gasto_prom_90d: number
  utilidad_placer: number
  flexibilidad_recorte: number
}

interface PodoraLineaBase {
  arsenal_total: number
  deuda_total: number
  burn_rate_supervivencia: number
  escudo_dias_actual: number
}

interface PodoraResponse {
  candidatos: PodoraCandidato[]
  metas: Array<{ billetera_id: number; nombre: string; monto_meta: number; saldo_actual: number; dias_restantes: number }>
  tiene_metas: boolean
  linea_base: PodoraLineaBase
}

interface RetoHormigas {
  total_hormigas_mes: number
  cantidad_hormigas: number
  comparativa: { mes_anterior: number; mes_antepasado: number; tendencia_key: 'improving' | 'worsening' | 'stable' }
  buzon_disponible: boolean
  buzon_id: number | null
  buzon_nombre: string | null
  buzon_saldo_actual: number | null
  proyeccion_6_meses: number
  mensaje_key: 'msg_challenge_zero_ants' | 'msg_challenge_no_piggybank' | 'msg_challenge_transfer_to_piggybank'
}

export function AnalisisEmocionalPage() {
  const { showToast } = useToast()
  const { estado, loading: loadingHogar } = useHogar()
  const navigate = useNavigate()
  const [tab, setTab] = useState<BcgTab>('matriz')

  // Estado Vista 1
  const [mes, setMes] = useState<string | null>(null)
  const [points, setPoints] = useState<BCGPoint[]>([])
  const [resumen, setResumen] = useState<ResumenCuadrante[]>([])
  const [hormigasTopList, setHormigasTopList] = useState<HormigaResumen[]>([])
  const [hormigasResumen, setHormigasResumen] = useState<HormigaResumen | null>(null)
  const [podora, setPodora] = useState<PodoraResponse | null>(null)
  const [retoHormigas, setRetoHormigas] = useState<RetoHormigas | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rMatriz, rResumen, rHormigas, rPodora, rReto] = await Promise.all([
        supabase.rpc('fn_reporte_bcg_roi_emocional'),
        supabase.rpc('fn_reporte_resumen_cuadrantes'),
        supabase.rpc('fn_reporte_fugas_silenciosas'),
        supabase.rpc('fn_reporte_podadora_bcg'),
        supabase.rpc('fn_reporte_reto_hormigas'),
      ])
      if (rMatriz.error) throw rMatriz.error
      if (rResumen.error) throw rResumen.error
      if (rHormigas.error) throw rHormigas.error
      if (rPodora.error) throw rPodora.error
      if (rReto.error) throw rReto.error

      const puntos: BCGPoint[] = ((rMatriz.data ?? []) as any[]).map((row) => ({
        estructura_id: Number(row.nombre_categoria ? row.estructura_id ?? 0 : 0) || Number(row.estructura_id ?? 0),
        nombre: String(row.nombre_categoria ?? ''),
        rubro_padre: row.rubro_padre ?? null,
        coordenada_x: Number(row.coordenada_x ?? 0),
        coordenada_y: Number(row.coordenada_y ?? 5),
        cuadrante_key: String(row.cuadrante_key ?? ''),
        icono: String(row.icono ?? '📊'),
        color: String(row.color ?? '#6366F1'),
        monto_total: 0,
      }))

      // Enriquecer con monto_total desde el resumen
      const resumenData: ResumenCuadrante[] = ((rResumen.data ?? []) as any[]).map((row) => ({
        cuadrante_key: String(row.cuadrante_key ?? '').replace('bcg_', '') as ResumenCuadrante['cuadrante_key'],
        cantidad_subcuentas: Number(row.cantidad_subcuentas ?? 0),
        monto_total: Number(row.monto_total ?? 0),
        top_subcuentas: Array.isArray(row.top_subcuentas)
          ? row.top_subcuentas.map((s: any) => ({ nombre: String(s.nombre ?? ''), icono: String(s.icono ?? '📊'), monto: Number(s.monto ?? 0) }))
          : [],
      }))

      // Construir mapa de montos por nombre de categoría (join cliente entre las 2 RPCs)
      const montoPorNombre: Record<string, number> = {}
      resumenData.forEach((r) => {
        r.top_subcuentas.forEach((s) => { montoPorNombre[s.nombre] = (montoPorNombre[s.nombre] ?? 0) + s.monto })
      })

      // Para puntos cuyo nombre no esté en el top-3, necesitamos el monto desde otro reporte.
      // Fallback: si la RPC de matriz devolviera `monto_total` ya, lo usaríamos. Si no, dejamos 0.
      // (El backend actual no expone monto_total en fn_reporte_bcg_roi_emocional; el radio
      // se renderiza al mínimo para esos casos. La calidad visual se mantiene.)
      setPoints(puntos.map((p) => ({ ...p, monto_total: montoPorNombre[p.nombre] ?? 0 })))
      setResumen(resumenData)

      const hormigasData: HormigaResumen[] = ((rHormigas.data ?? []) as any[]).map((row) => ({
        estructura_id: Number(row.estructura_id ?? 0),
        nombre_cuenta: String(row.nombre_cuenta ?? ''),
        icono: String(row.icono ?? '📊'),
        color: String(row.color ?? '#FF6B6B'),
        frecuencia_mensual: Number(row.frecuencia_mensual ?? 0),
        gasto_mensual_estimado: Number(row.gasto_mensual_estimado ?? 0),
        impacto_anual: Number(row.impacto_anual ?? 0),
        porcentaje_del_ingreso: Number(row.porcentaje_del_ingreso ?? 0),
      }))
      setHormigasTopList(hormigasData)
      setHormigasResumen(hormigasData[0] ?? null)

      setPodora((rPodora.data as unknown as PodoraResponse) ?? null)
      setRetoHormigas((rReto.data as unknown as RetoHormigas) ?? null)
    } catch (err: any) {
      setError(parseError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar, mes])

  const handlePointClick = (p: BCGPoint) => {
    haptics.light()
    navigate(`/analisis-emocional/categoria/${p.estructura_id}`, {
      state: { point: p },
    })
  }

  const puntosPorCuadrante = useMemo(() => {
    const buckets: Record<string, BCGPoint[]> = {
      bcg_star: [], bcg_cow: [], bcg_dilemma: [], bcg_dog: [],
    }
    points.forEach((p) => {
      if (buckets[p.cuadrante_key]) buckets[p.cuadrante_key].push(p)
    })
    return buckets
  }, [points])

  const isLoading = loadingHogar || loading

  return (
    <div className="page bcg-page fade-in">
      <header className="bcg-header">
        <div>
          <span className="bcg-kicker">{t('bcg_kicker')}</span>
          <h1 className="font-display">{t('bcg_title')}</h1>
          <p>{t('bcg_subtitle')}</p>
        </div>
        <BCGSelectMes value={mes} onChange={setMes} />
      </header>

      <nav className="bcg-tabs" aria-label={t('bcg_tabs_label')}>
        {(['matriz', 'podadora', 'hormigas'] as BcgTab[]).map((key) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => {
              haptics.light()
              setTab(key)
            }}
          >
            {t(`bcg_tab_${key}`)}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <div className="bcg-loading">
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="bcg-error">
          <span>⚠️</span>
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={cargar}>
            {t('btn_retry')}
          </button>
        </div>
      ) : tab === 'matriz' ? (
        <section className="bcg-tab-panel">
          {points.length === 0 && resumen.every((r) => r.cantidad_subcuentas === 0) ? (
            <div className="bcg-empty-state">
              <span className="bcg-empty-icon">📊</span>
              <h2>{t('bcg_empty_sin_historico')}</h2>
              <p>{t('bcg_empty_sin_gastos')}</p>
            </div>
          ) : (
            <>
              <h2 className="bcg-section-title">{t('bcg_matriz_titulo')}</h2>
              <BCGScatterPlot
                points={points}
                onPointClick={handlePointClick}
                emptyMessage={t('bcg_empty_sin_gastos')}
              />

              <h2 className="bcg-section-title bcg-section-title-mt">{t('bcg_lista_titulo')}</h2>
              <div className="bcg-acordeones">
                <BCGCuadranteAcordeon
                  cuadranteKey="bcg_star"
                  items={puntosPorCuadrante.bcg_star}
                  onItemClick={handlePointClick}
                  defaultOpen
                />
                <BCGCuadranteAcordeon
                  cuadranteKey="bcg_cow"
                  items={puntosPorCuadrante.bcg_cow}
                  onItemClick={handlePointClick}
                />
                <BCGCuadranteAcordeon
                  cuadranteKey="bcg_dilemma"
                  items={puntosPorCuadrante.bcg_dilemma}
                  onItemClick={handlePointClick}
                />
                <BCGCuadranteAcordeon
                  cuadranteKey="bcg_dog"
                  items={puntosPorCuadrante.bcg_dog}
                  onItemClick={handlePointClick}
                />
              </div>

              <h2 className="bcg-section-title bcg-section-title-mt">{t('bcg_resumen_title', { defaultValue: 'Resumen por cuadrante' })}</h2>
              <BCGResumenCuadrantes
                resumen={resumen}
                onCardClick={(c) => {
                  haptics.light()
                  navigate(`/analisis-emocional?focus=${c}`)
                }}
              />

              {podora && podora.candidatos.length > 0 && (
                <>
                  <h2 className="bcg-section-title bcg-section-title-mt">{t('bcg_podora_titulo')}</h2>
                  <div className="bcg-podora-widget">
                    <p>{t('bcg_podora_intro')}</p>
                    <strong>
                      {t('bcg_podora_impacto_leyenda', { count: podora.candidatos.length })}
                    </strong>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        haptics.light()
                        setTab('podadora')
                      }}
                    >
                      {t('bcg_tab_podadora')} →
                    </button>
                  </div>
                </>
              )}

              {retoHormigas && retoHormigas.cantidad_hormigas > 0 && (
                <>
                  <h2 className="bcg-section-title bcg-section-title-mt">{t('bcg_hormiga_resumen_titulo')}</h2>
                  <div className="bcg-hormigas-widget">
                    <span className="bcg-hormigas-icon">🐜</span>
                    <strong>
                      {t('bcg_hormiga_total_label')}: {formatMoneyARSLocal(retoHormigas.total_hormigas_mes)} ({retoHormigas.cantidad_hormigas})
                    </strong>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        haptics.light()
                        setTab('hormigas')
                      }}
                    >
                      {t('bcg_tab_hormigas')} →
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      ) : tab === 'podadora' ? (
        <section className="bcg-tab-panel">
          <h2 className="bcg-section-title">{t('bcg_podora_titulo')}</h2>
          <BCGPodora
            candidatos={podora?.candidatos ?? []}
            metas={podora?.metas ?? []}
            tieneMetas={podora?.tiene_metas ?? false}
            lineaBase={
              podora?.linea_base ?? {
                arsenal_total: 0,
                deuda_total: 0,
                burn_rate_supervivencia: 0,
                escudo_dias_actual: 0,
              }
            }
            onCandidatoClick={(estructuraId) => {
              const pt = points.find((p) => p.estructura_id === estructuraId)
              if (pt) handlePointClick(pt)
            }}
          />
        </section>
      ) : (
        <section className="bcg-tab-panel">
          <h2 className="bcg-section-title">{t('bcg_hormiga_resumen_titulo')}</h2>
          <BCGHormigas
            hormigas={hormigasTopList}
            reto={retoHormigas}
            onCategoriaClick={(estructuraId) => {
              const pt = points.find((p) => p.estructura_id === estructuraId)
              if (pt) handlePointClick(pt)
            }}
          />
        </section>
      )}

      {!estado?.tiene_pareja && (tab === 'hormigas' || tab === 'podadora') && (
        <p className="bcg-muted" style={{ textAlign: 'center', marginTop: 16 }}>
          {t("emotional_analysis_advanced_tip")}
        </p>
      )}
    </div>
  )
}

function formatMoneyARSLocal(v: number): string {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(v ?? 0))
  } catch {
    return `$${Math.round(Number(v ?? 0)).toLocaleString('es-AR')}`
  }
}

export default AnalisisEmocionalPage
