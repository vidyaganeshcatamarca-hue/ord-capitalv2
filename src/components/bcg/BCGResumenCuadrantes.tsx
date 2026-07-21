import { t } from '@/locales/i18n'
import { formatMoneyARS, BCG_CUADRANTES } from '@/lib/bcgUtils'
import './BCGResumenCuadrantes.css'

export interface ResumenCuadrante {
  cuadrante_key: 'star' | 'cow' | 'dilemma' | 'dog'
  cantidad_subcuentas: number
  monto_total: number
  top_subcuentas: Array<{ nombre: string; icono: string; monto: number }>
}

interface BCGResumenCuadrantesProps {
  resumen: ResumenCuadrante[]
  onCardClick?: (cuadrante: string) => void
}

const CUADRANTE_TO_BCG: Record<ResumenCuadrante['cuadrante_key'], keyof typeof BCG_CUADRANTES> = {
  star: 'bcg_star',
  cow: 'bcg_cow',
  dilemma: 'bcg_dilemma',
  dog: 'bcg_dog',
}

const CUADRANTE_ORDER: ResumenCuadrante['cuadrante_key'][] = ['dog', 'star', 'dilemma', 'cow']

const MESSAGES: Record<ResumenCuadrante['cuadrante_key'], (monto: string) => string> = {
  dog: (m) => `${t('bcg_dog_desc', { m })}`,
  star: (m) => `Aportan valor y suman ${m}`,
  dilemma: (m) => `Compras impulsivas por ${m}`,
  cow: (m) => `Inversiones puntuales por ${m}`,
}

export function BCGResumenCuadrantes({ resumen, onCardClick }: BCGResumenCuadrantesProps) {
  const order: ResumenCuadrante[] = CUADRANTE_ORDER.map((key) => {
    return resumen.find((r) => r.cuadrante_key === key) ?? {
      cuadrante_key: key,
      cantidad_subcuentas: 0,
      monto_total: 0,
      top_subcuentas: [],
    }
  })

  return (
    <div className="bcg-resumen-grid">
      {order.map((r) => {
        const bcgKey = CUADRANTE_TO_BCG[r.cuadrante_key]
        const c = BCG_CUADRANTES[bcgKey]
        const montoFmt = formatMoneyARS(r.monto_total)
        return (
          <button
            key={r.cuadrante_key}
            type="button"
            className={`bcg-resumen-card bcg-resumen-${r.cuadrante_key}`}
            onClick={() => onCardClick?.(r.cuadrante_key)}
            disabled={r.cantidad_subcuentas === 0}
          >
            <span className="bcg-resumen-emoji" aria-hidden="true">{c.emoji}</span>
            <span className="bcg-resumen-label">{t(`bcg_cuadrante_${r.cuadrante_key === 'star' ? 'star' : r.cuadrante_key === 'cow' ? 'cow' : r.cuadrante_key === 'dilemma' ? 'dilemma' : 'dog'}`)}</span>
            <strong className="bcg-resumen-monto">{montoFmt}</strong>
            <span className="bcg-resumen-msg">
              {r.cantidad_subcuentas === 0 ? '—' : MESSAGES[r.cuadrante_key](montoFmt)}
            </span>
            <span className="bcg-resumen-cta">{r.cantidad_subcuentas > 0 ? `${r.cantidad_subcuentas} ›` : '—'}</span>
          </button>
        )
      })}
    </div>
  )
}

export default BCGResumenCuadrantes
