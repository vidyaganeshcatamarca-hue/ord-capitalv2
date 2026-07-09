import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import type { EscudoData } from '@/pages/Supervivencia/SupervivenciaPage'
import { ConfigGastosFijosModal } from './ConfigGastosFijosModal'
import './EscudoTiempoDetalle.css'

interface EscudoTiempoDetalleProps {
  escudo: EscudoData
  onRecargar: () => Promise<void>
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

interface SimuladorResponse {
  escenario_base: { nombre_key: string; descripcion_key: string; dias: number; params: Record<string, any> }
  escenario_sin_ingreso: { nombre_key: string; descripcion_key: string; dias: number; impacto: number; params: Record<string, any> }
  escenario_gastos_20: { nombre_key: string; descripcion_key: string; dias: number; impacto: number; params: Record<string, any> }
  escenario_emergencia: { nombre_key: string; descripcion_key: string; dias: number; impacto: number; params: Record<string, any> }
  datos_base: { liquidez_total: number; gastos_fijos_mensuales: number; ingreso_mensual_promedio: number }
}

interface Escenario {
  key: 'base' | 'sin_ingreso' | 'gastos_20' | 'emergencia'
  nombre: string
  descripcion: string
  dias: number
  impacto: number
  esNegativo: boolean
  esBase: boolean
}

function formatMoneyARS(v: number): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(v)
  } catch {
    return `$${Math.round(v).toLocaleString('es-AR')}`
  }
}

function mapearEscenarios(s: SimuladorResponse): Escenario[] {
  return [
    {
      key: 'base',
      nombre: t(s.escenario_base.nombre_key),
      descripcion: t(s.escenario_base.descripcion_key),
      dias: s.escenario_base.dias,
      impacto: 0,
      esNegativo: false,
      esBase: true,
    },
    {
      key: 'sin_ingreso',
      nombre: t(s.escenario_sin_ingreso.nombre_key),
      descripcion: t(s.escenario_sin_ingreso.descripcion_key),
      dias: s.escenario_sin_ingreso.dias,
      impacto: s.escenario_sin_ingreso.impacto,
      esNegativo: s.escenario_sin_ingreso.impacto > 0,
      esBase: false,
    },
    {
      key: 'gastos_20',
      nombre: t(s.escenario_gastos_20.nombre_key),
      descripcion: t(s.escenario_gastos_20.descripcion_key),
      dias: s.escenario_gastos_20.dias,
      impacto: s.escenario_gastos_20.impacto,
      esNegativo: s.escenario_gastos_20.impacto > 0,
      esBase: false,
    },
    {
      key: 'emergencia',
      nombre: t(s.escenario_emergencia.nombre_key),
      descripcion: t(s.escenario_emergencia.descripcion_key),
      dias: s.escenario_emergencia.dias,
      impacto: s.escenario_emergencia.impacto,
      esNegativo: s.escenario_emergencia.impacto > 0,
      esBase: false,
    },
  ]
}

export function EscudoTiempoDetalle({ escudo, onRecargar, showToast }: EscudoTiempoDetalleProps) {
  const navigate = useNavigate()
  const [simulador, setSimulador] = useState<Escenario[]>([])
  const [datosBase, setDatosBase] = useState<SimuladorResponse['datos_base'] | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [loadingSim, setLoadingSim] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      setLoadingSim(true)
      const { data, error } = await supabase.rpc('fn_reporte_simulador_escenarios')
      if (error) {
        showToast(error.message, 'error')
        setLoadingSim(false)
        return
      }
      const resp = data as SimuladorResponse
      setSimulador(mapearEscenarios(resp))
      setDatosBase(resp.datos_base)
      setLoadingSim(false)
    }
    cargar()
  }, [showToast])

  const handleGuardado = async () => {
    await onRecargar()
  }

  return (
    <section className="escudo-detalle">
      <header className="escudo-detalle-header">
        <span className="escudo-detalle-kicker">{t('war_escudo_detalle_kicker')}</span>
        <h2 className="font-display">{t('war_escudo_detalle_titulo')}</h2>
      </header>

      <div className="escudo-barra-grande">
        <div className="escudo-barra-fill" style={{ width: `${Math.min(100, (escudo.dias_supervivencia_deuda_total / 180) * 100)}%` }} />
        <div className="escudo-barra-texto">
          <span className="escudo-barra-num">{escudo.dias_supervivencia_deuda_total}</span>
          <span className="escudo-barra-unidad">{t('war_escudo_unidad_dias')}</span>
        </div>
      </div>

      <ul className="escudo-detalle-lista">
        <li>
          <span>💰 {t('war_escudo_label_liquidez')}</span>
          <strong>{formatMoneyARS(escudo.arsenal_total)}</strong>
        </li>
        <li>
          <span>💳 {t('war_escudo_label_deuda')}</span>
          <strong>{formatMoneyARS(escudo.deuda_total)}</strong>
        </li>
        <li>
          <span>📉 {t('war_escudo_detalle_burn_supervivencia')}</span>
          <strong>{formatMoneyARS(escudo.burn_rate_supervivencia)}/día</strong>
        </li>
        <li>
          <span>📅 {t('war_escudo_detalle_ventana', { dias: escudo.ventana_dias_usada })}</span>
          <strong>{t('war_escudo_label_autonomia')} {escudo.dias_supervivencia_deuda_total}</strong>
        </li>
      </ul>

      <button
        type="button"
        className="btn btn-secondary escudo-config-cta"
        onClick={() => {
          haptics.light()
          setShowConfig(true)
        }}
      >
        {t('war_escudo_config_cta')}
      </button>

      {datosBase && datosBase.gastos_fijos_mensuales > 0 && escudo.dias_supervivencia_deuda_total < 180 && (
        <p className="escudo-recomendacion">
          {t('war_escudo_recomendacion', {
            monto: formatMoneyARS(datosBase.gastos_fijos_mensuales * 6),
          })}
        </p>
      )}
      {escudo.dias_supervivencia_deuda_total >= 180 && (
        <p className="escudo-recomendacion escudo-recomendacion-ok">
          {t('war_escudo_recomendacion_ok')}
        </p>
      )}

      <section className="escudo-simulador">
        <h3>{t('war_escudo_simulador_titulo')}</h3>
        <p className="escudo-simulador-intro">{t('war_escudo_simulador_intro')}</p>

        {loadingSim ? (
          <div className="escudo-sim-loading"><div className="spinner" /></div>
        ) : (
          <div className="escudo-escenarios">
            {simulador.map((esc) => (
              <article
                key={esc.key}
                className={`escudo-escenario ${esc.esBase ? 'es-base' : ''} ${esc.esNegativo ? 'shake' : ''}`}
              >
                <header className="escudo-escenario-header">
                  <span className="escudo-escenario-nombre">{esc.nombre}</span>
                </header>
                <p className="escudo-escenario-desc">{esc.descripcion}</p>
                <div className="escudo-escenario-datos">
                  <div className="escudo-escenario-dato">
                    <span>{t('war_escudo_simulador_nuevo_escudo')}</span>
                    <strong className="escudo-escenario-dias">{esc.dias} días</strong>
                  </div>
                  {!esc.esBase && (
                    <div className="escudo-escenario-dato">
                      <span>{t('war_escudo_simulador_impacto')}</span>
                      <strong className={esc.impacto > 0 ? 'impacto-negativo' : 'impacto-cero'}>
                        {esc.impacto === 0
                          ? t('sim_scenario_impacto_cero')
                          : esc.impacto > 0
                            ? t('sim_scenario_impacto_negativo', { dias: esc.impacto })
                            : t('sim_scenario_impacto_positivo', { dias: Math.abs(esc.impacto) })}
                      </strong>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showConfig && (
        <ConfigGastosFijosModal
          onClose={() => setShowConfig(false)}
          onGuardado={handleGuardado}
          showToast={showToast}
        />
      )}

      <button
        type="button"
        className="btn btn-primary escudo-fondo-cta"
        onClick={() => {
          haptics.light()
          navigate('/billeteras')
        }}
      >
        {t('war_escudo_cta_fondo')}
      </button>
    </section>
  )
}
