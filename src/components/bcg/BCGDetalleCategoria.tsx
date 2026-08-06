import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { BCG_CUADRANTES, classifyCuadrante, formatMoneyARS } from '@/lib/bcgUtils'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import type { BCGPoint } from './BCGScatterPlot'
import './BCGDetalleCategoria.css'

const SAVE_DEBOUNCE_MS = 300

export function BCGDetalleCategoria() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const point: BCGPoint | undefined = (location.state as any)?.point

  const [placer, setPlacer] = useState<number>(point?.coordenada_y ?? 5)
  const [flex, setFlex] = useState<number>(5) // la RPC de matriz no devuelve flex
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const timerRef = useRef<number | null>(null)
  const lastSaved = useRef<{ placer: number; flex: number } | null>(null)

  const guardar = useCallback(
    async (p: number, f: number) => {
      if (!id) return
      if (lastSaved.current && lastSaved.current.placer === p && lastSaved.current.flex === f) return
      setSaving(true)
      try {
        const { error } = await supabase.rpc('fn_actualizar_calificacion_bcg', {
          p_estructura_id: Number(id),
          p_placer: p,
          p_flexibilidad: f,
        })
        if (error) throw error
        lastSaved.current = { placer: p, flex: f }
        showToast(t('bcg_calificacion_guardada'), 'success')
        haptics.success()
      } catch (err: any) {
        showToast(parseError(err), 'error')
        haptics.error()
      } finally {
        setSaving(false)
      }
    },
    [id, showToast]
  )

  const handleSliderChange = (newPlacer: number, newFlex: number) => {
    setPlacer(newPlacer)
    setFlex(newFlex)
    setDirty(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      guardar(newPlacer, newFlex)
    }, SAVE_DEBOUNCE_MS)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  if (!id || !point) {
    return (
      <div className="bcg-detalle-empty">
        <span>📊</span>
        <p>{t("bcg_no_data")}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/analisis-emocional')}>
          {t('btn_back')}
        </button>
      </div>
    )
  }

  const c = classifyCuadrante(point.cuadrante_key)
  const esDefault = placer === 5 && flex === 5
  const esExtremo = placer === 0 && flex === 0

  // Clasificación en vivo: derivar según los valores locales
  const liveKey = placer > 5 && point.coordenada_x > 4
    ? 'bcg_star'
    : placer > 5 && point.coordenada_x <= 4
      ? 'bcg_cow'
      : placer <= 5 && point.coordenada_x <= 4
        ? 'bcg_dilemma'
        : 'bcg_dog'
  const liveC = classifyCuadrante(liveKey)

  return (
    <div className="bcg-detalle fade-in">
      <header className="bcg-detalle-header">
        <button
          className="bcg-detalle-back"
          onClick={() => {
            if (dirty) {
              const ok = window.confirm(t('bcg_detalle_undo_warning'))
              if (!ok) return
            }
            navigate(-1)
          }}
          aria-label={t('btn_back')}
        >
          ←
        </button>
        <div className="bcg-detalle-titulo">
          <span
            className="bcg-detalle-icono"
            style={{ background: `${point.color ?? '#6366F1'}33` }}
            aria-hidden="true"
          >
            <CategoryIcon name={point.icono} size={24} />
          </span>
          <div>
            <h1 className="font-display">{point.nombre}</h1>
            {point.rubro_padre && <p className="bcg-detalle-padre">{point.rubro_padre}</p>}
          </div>
        </div>
        {saving && <span className="bcg-detalle-saving" aria-live="polite">…</span>}
      </header>

      <section className="bcg-detalle-stats">
        <h2>{t('bcg_detalle_stats_titulo')}</h2>
        <div className="bcg-detalle-stats-grid">
          <div>
            <span>{t('bcg_detalle_total_label')}</span>
            <strong>{formatMoneyARS(0 /* se llenaría con datos reales de la subcuenta */)}</strong>
          </div>
          <div>
            <span>{t('bcg_detalle_frecuencia_label')}</span>
            <strong>{point.coordenada_x} / mes</strong>
          </div>
          <div>
            <span>{t('bcg_detalle_promedio_label')}</span>
            <strong>
              {point.coordenada_x > 0 ? formatMoneyARS(0) : '—'}
            </strong>
          </div>
          <div>
            <span>{t('bcg_detalle_cuadrante_label')}</span>
            <strong>
              {c?.emoji} {c ? t(c.labelKey) : '—'}
            </strong>
          </div>
        </div>
      </section>

      <section className="bcg-detalle-calificacion">
        <h2>{t('bcg_detalle_calificacion_titulo')}</h2>

        <div className="bcg-detalle-slider-row">
          <label htmlFor="placer-slider">
            <span className="bcg-detalle-slider-icon" aria-hidden="true">😊</span>
            {t('bcg_detalle_placer_label')}
          </label>
          <input
            id="placer-slider"
            type="range"
            min={0}
            max={10}
            step={1}
            value={placer}
            onChange={(e) => handleSliderChange(Number(e.target.value), flex)}
            onMouseUp={() => haptics.light()}
            onTouchEnd={() => haptics.light()}
            onKeyUp={() => haptics.light()}
            className="bcg-detalle-slider bcg-detalle-slider-placer"
            style={{ ['--val' as any]: `${(placer / 10) * 100}%` }}
          />
          <strong className="bcg-detalle-slider-value">{placer}/10</strong>
          <p className="bcg-detalle-help">{t('bcg_detalle_placer_help')}</p>
        </div>

        <div className="bcg-detalle-slider-row">
          <label htmlFor="flex-slider">
            <span className="bcg-detalle-slider-icon" aria-hidden="true">✂️</span>
            {t('bcg_detalle_flex_label')}
          </label>
          <input
            id="flex-slider"
            type="range"
            min={0}
            max={10}
            step={1}
            value={flex}
            onChange={(e) => handleSliderChange(placer, Number(e.target.value))}
            onMouseUp={() => haptics.light()}
            onTouchEnd={() => haptics.light()}
            onKeyUp={() => haptics.light()}
            className="bcg-detalle-slider bcg-detalle-slider-flex"
            style={{ ['--val' as any]: `${(flex / 10) * 100}%` }}
          />
          <strong className="bcg-detalle-slider-value">{flex}/10</strong>
          <p className="bcg-detalle-help">{t('bcg_detalle_flex_help')}</p>
        </div>
      </section>

      <section className="bcg-detalle-clasif">
        <h2>{t('bcg_detalle_clasif_titulo')}</h2>
        {esDefault ? (
          <div className="bcg-detalle-clasif-empty">{t('bcg_detalle_sin_calificar')}</div>
        ) : esExtremo ? (
          <div className="bcg-detalle-clasif-card bcg-detalle-clasif-extremo">
            <span className="bcg-detalle-clasif-emoji" aria-hidden="true">{liveC?.emoji}</span>
            <p>{t('bcg_clasif_extremo')}</p>
          </div>
        ) : (
          <div className={`bcg-detalle-clasif-card bcg-detalle-clasif-${liveKey.replace('bcg_', '')}`}>
            <span className="bcg-detalle-clasif-emoji" aria-hidden="true">{liveC?.emoji}</span>
            <strong>{liveC ? t(liveC.labelKey) : ''}</strong>
            <p>
              {t(`bcg_clasif_${liveKey.replace('bcg_', '')}` as any, {
                placer,
                frec: point.coordenada_x,
              })}
            </p>
          </div>
        )}
      </section>

      <section className="bcg-detalle-movs">
        <h2>{t('bcg_detalle_ultimos_movs')}</h2>
        <p className="bcg-muted">{t('bcg_detalle_sin_movs')}</p>
        {/* Próximamente (Etapa 5): fetch de los últimos 3 gastos en p_caja filtrados por estructura_egreso_id */}
        <button
          type="button"
          className="btn btn-secondary bcg-detalle-ver-todos"
          onClick={() => navigate(`/billeteras?categoria=${point.estructura_id}`)}
        >
          {t('btn_view_all')} →
        </button>
      </section>
    </div>
  )
}

export default BCGDetalleCategoria
