import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { BandejaWidget } from '@/components/saneamiento/BandejaWidget'
import { AtaqueWidget } from '@/components/saneamiento/AtaqueWidget'
import { CalendarioWidget } from '@/components/saneamiento/CalendarioWidget'
import { BandejaCuarentena } from '@/components/saneamiento/BandejaCuarentena'
import { PlanAtaque } from '@/components/saneamiento/PlanAtaque'
import { CalendarioFinanciero } from '@/components/saneamiento/CalendarioFinanciero'
import './SaneamientoPage.css'

export type VistaSaneamiento = 'dashboard' | 'bandeja' | 'ataque' | 'calendario'

export interface CuarentenaItem {
  pendiente_id: number
  origen: 'ocr' | 'recurrente' | 'voz' | string
  monto: number
  fecha: string
  detalle: string | null
  estructura_egreso_id: number | null
  categoria_nombre: string | null
  categoria_icono: string | null
  categoria_color: string | null
  billetera_id: number | null
  billetera_nombre: string | null
  recurrente_id: number | null
  metadata: Record<string, any>
  creado_at: string
}

export interface BolaNieveEstado {
  deuda_total: number
  pagado_total: number
  porcentaje_completado: number
  fecha_inicio: string
  fecha_fin_estimada: string
  dias_en_plan: number
  estrategia_activa: 'math' | 'emotional' | 'relationships'
}

export interface DeudaItem {
  deuda_id: number
  nombre_deuda: string
  tipo_deuda: string
  saldo_actual: number
  tna: number
  cuota_mensual: number
  vencimiento_proximo: string | null
  prioridad: number
}

export interface CalendarioEvento {
  evento_id: string
  tipo_evento: 'cuota_prestamo' | 'vencimiento_tarjeta' | 'gasto_recurrente'
  fecha: string
  nombre: string
  monto: number
  criticidad: 'critico' | 'normal'
  pagado: boolean
}

export function SaneamientoPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [vista, setVista] = useState<VistaSaneamiento>('dashboard')

  const [cuarentena, setCuarentena] = useState<CuarentenaItem[]>([])
  const [bolaNieve, setBolaNieve] = useState<BolaNieveEstado | null>(null)
  const [calendario, setCalendario] = useState<CalendarioEvento[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargarDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rCuarentena, rBola, rCalendario] = await Promise.all([
        rpc<CuarentenaItem[]>('fn_reporte_cuarentena_pendientes', { p_filtro_origen: 'todos' }),
        rpc<BolaNieveEstado>('fn_reporte_bola_nieve_estado'),
        rpc<CalendarioEvento[]>('fn_reporte_calendario_financiero', { p_dias_adelante: 30 }),
      ])
      setCuarentena(rCuarentena || [])
      setBolaNieve(rBola)
      setCalendario(rCalendario || [])
    } catch (err: any) {
      const msg = parseError(err)
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    cargarDashboard()
  }, [cargarDashboard])

  const irA = (v: VistaSaneamiento) => {
    haptics.light()
    setVista(v)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const volver = () => {
    haptics.light()
    setVista('dashboard')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleMovementAdded = useCallback(() => {
    window.dispatchEvent(new CustomEvent('movement-added'))
    cargarDashboard()
  }, [cargarDashboard])

  if (loading && !bolaNieve && cuarentena.length === 0 && calendario.length === 0) {
    return (
      <div className="page saneamiento-page saneamiento-loading">
        <div className="spinner" />
        <p>{t('saneamiento_loading')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page saneamiento-page saneamiento-error">
        <span>⚠️</span>
        <p>{error}</p>
        <button className="btn btn-secondary" onClick={cargarDashboard}>
          {t('saneamiento_btn_retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="page saneamiento-page fade-in">
      {vista === 'dashboard' && (
        <header className="saneamiento-header">
          <div>
            <span className="saneamiento-kicker">{t('saneamiento_kicker')}</span>
            <h1 className="font-display">{t('saneamiento_title')}</h1>
            <p>{t('saneamiento_subtitle')}</p>
          </div>
        </header>
      )}

      {vista !== 'dashboard' && (
        <button className="saneamiento-back-btn" onClick={volver}>
          {t('saneamiento_volver')}
        </button>
      )}

      {vista === 'dashboard' && (
        <section className="saneamiento-dashboard">
          <BandejaWidget items={cuarentena} onDetalle={() => irA('bandeja')} />
          <AtaqueWidget estado={bolaNieve} onDetalle={() => irA('ataque')} />
          <CalendarioWidget eventos={calendario} onDetalle={() => irA('calendario')} />
        </section>
      )}

      {vista === 'bandeja' && (
        <BandejaCuarentena
          onVolver={volver}
          onChange={() => handleMovementAdded()}
        />
      )}

      {vista === 'ataque' && (
        <PlanAtaque
          estadoInicial={bolaNieve}
          onVolver={volver}
          onChange={handleMovementAdded}
        />
      )}

      {vista === 'calendario' && (
        <CalendarioFinanciero
          eventosIniciales={calendario}
          onVolver={volver}
          onChange={handleMovementAdded}
        />
      )}
    </div>
  )
}

export default SaneamientoPage
