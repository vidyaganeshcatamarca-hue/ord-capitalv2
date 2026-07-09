import { t } from '@/locales/i18n'
import { InversionCard, type Inversion } from './InversionCard'
import './CarteraWidget.css'

export interface InversionResumen {
  inversion_id: number
  nombre_activo: string | null
  tipo_activo: 'plazo_fijo' | 'variable' | string
  monto_invertido_original: number | null
  valor_actual_teorico: number | null
  rendimiento_nominal: number | null
  rendimiento_real: number | null
  dias_desde_conciliacion: number | null
  estado_semaforo_key: 'green' | 'yellow' | 'red' | string
  estado_inversion: string | null
  tasa_anual_tna: number | null
  moneda: string | null
  fecha_inicio: string | null
  ultima_conciliacion: string | null
}

interface CarteraWidgetProps {
  inversiones: InversionResumen[]
  loading: boolean
  onUpdateValue: (inversionId: number) => void
  onLiquidate: (inversionId: number) => void
  onSelect?: (inversionId: number) => void
  onNew?: () => void
}

function normalizeInversion(inv: InversionResumen): Inversion {
  return {
    inversion_id: inv.inversion_id,
    nombre_activo: inv.nombre_activo || t('msg_no_investments'),
    tipo_activo: inv.tipo_activo || 'otro',
    monto_invertido_original: Number(inv.monto_invertido_original ?? 0),
    valor_actual_teorico: Number(inv.valor_actual_teorico ?? 0),
    rendimiento_nominal: Number(inv.rendimiento_nominal ?? 0),
    dias_desde_conciliacion: Number(inv.dias_desde_conciliacion ?? 0),
    estado_semaforo_key: inv.estado_semaforo_key || 'green',
    estado_inversion: inv.estado_inversion || 'activa',
    tasa_anual_tna: Number(inv.tasa_anual_tna ?? 0),
    moneda: inv.moneda || 'ARS',
    fecha_inicio: inv.fecha_inicio || '',
    ultima_conciliacion: inv.ultima_conciliacion || '',
  }
}

export function CarteraWidget({
  inversiones,
  loading,
  onUpdateValue,
  onLiquidate,
  onSelect,
  onNew,
}: CarteraWidgetProps) {
  if (loading) {
    return (
      <div className="cartera-widget cartera-widget--loading">
        <div className="cartera-spinner" aria-hidden="true" />
        <p className="cartera-widget-text">{t('loading')}</p>
      </div>
    )
  }

  if (inversiones.length === 0) {
    return (
      <div className="cartera-widget cartera-empty">
        <div className="cartera-empty-icon" aria-hidden="true">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </div>
        <h3 className="cartera-empty-title">{t('empty_title')}</h3>
        <p className="cartera-empty-subtitle">{t('empty_subtitle')}</p>
        {onNew && (
          <button
            type="button"
            className="cartera-empty-cta"
            onClick={onNew}
          >
            {t('btn_new')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="cartera-widget">
      <div className="cartera-grid">
        {inversiones.map((inv) => (
          <InversionCard
            key={inv.inversion_id}
            inversion={normalizeInversion(inv)}
            onSelect={onSelect}
            onUpdateValue={onUpdateValue}
            onLiquidate={onLiquidate}
          />
        ))}
      </div>
    </div>
  )
}

export default CarteraWidget
