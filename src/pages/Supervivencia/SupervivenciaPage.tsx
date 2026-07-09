import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { EscudoTiempoWidget } from '@/components/supervivencia/EscudoTiempoWidget'
import { SafeToSpendWidget } from '@/components/supervivencia/SafeToSpendWidget'
import { LicuadoraWidget } from '@/components/supervivencia/LicuadoraWidget'
import { RadarAsfixiaWidget } from '@/components/supervivencia/RadarAsfixiaWidget'
import { PodoraResumenWidget } from '@/components/supervivencia/PodoraResumenWidget'
import { EscudoTiempoDetalle } from '@/components/supervivencia/EscudoTiempoDetalle'
import { SafeToSpendDetalle } from '@/components/supervivencia/SafeToSpendDetalle'
import { LicuadoraDetalle } from '@/components/supervivencia/LicuadoraDetalle'
import { RadarAsfixiaDetalle } from '@/components/supervivencia/RadarAsfixiaDetalle'
import { WarRoomInfoModal } from '@/components/supervivencia/WarRoomInfoModal'
import './SupervivenciaPage.css'

export type Vista =
  | 'dashboard'
  | 'escudo'
  | 'safe'
  | 'licuadora'
  | 'radar'

export interface EscudoData {
  arsenal_total: number
  deuda_total: number
  deuda_60_dias: number
  capital_real: number
  capital_corto_plazo: number
  burn_rate_actual: number
  burn_rate_supervivencia: number
  dias_actual_deuda_total: number
  dias_actual_deuda_corta: number
  dias_supervivencia_deuda_total: number
  dias_supervivencia_deuda_corta: number
  ventana_dias_usada: number
  estado_alerta_key: 'critical' | 'warning' | 'safe'
}

export interface SafeData {
  saldo_operativo: number
  blindaje_fijos_7d: number
  blindaje_deudas_7d: number
  capital_libre_semana: number
  dias_restantes_mes: number
  safe_to_spend_diario: number
  umbral_deseo_diario: number
  estado_semaforo_key: 'red' | 'yellow' | 'green'
  mensaje_sistema_key: string
}

export interface LicuadoraData {
  actual: {
    patrimonio_neto_ars: number
    patrimonio_neto_usd: number
    cotizacion_usd: number
    activo_total_ars: number
    pasivo_total_ars: number
  }
  desglose_activos: {
    billeteras: { ars: number; usd: number }
    inversiones: { ars: number; usd: number }
    sobres: { ars: number; usd: number }
  }
  evolucion: {
    variacion_nominal_12m: number
    inflacion_acumulada_12m: number
    variacion_real_12m: number
    veredicto: 'wealth_gained' | 'wealth_matched' | 'wealth_lost'
    mensaje_key: string
  }
}

export interface RadarData {
  dia: string
  saldo_proyectado: number
  ingreso_esperado: number
  egreso_tarjeta: number
  egreso_goteo: number
  estado_dia: 'red' | 'yellow' | 'green'
  evento_texto: string | null
}

export interface PodoraData {
  candidatos: Array<{
    estructura_id: number
    nombre: string
    icono: string
    color: string
    gasto_prom_90d: number
    utilidad_placer: number
    flexibilidad_recorte: number
  }>
  metas: Array<{
    billetera_id: number
    nombre: string
    monto_meta: number
    saldo_actual: number
    dias_restantes: number
  }>
  tiene_metas: boolean
  linea_base: {
    arsenal_total: number
    deuda_total: number
    burn_rate_supervivencia: number
    escudo_dias_actual: number
  }
}

export function SupervivenciaPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [vista, setVista] = useState<Vista>('dashboard')
  const [showInfo, setShowInfo] = useState(false)

  const [escudo, setEscudo] = useState<EscudoData | null>(null)
  const [safe, setSafe] = useState<SafeData | null>(null)
  const [licuadora, setLicuadora] = useState<LicuadoraData | null>(null)
  const [radar, setRadar] = useState<RadarData[]>([])
  const [podora, setPodora] = useState<PodoraData | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rEscudo, rSafe, rLicu, rRadar, rPodora] = await Promise.all([
        supabase.rpc('fn_reporte_escudo_tiempo'),
        supabase.rpc('fn_reporte_safe_to_spend'),
        supabase.rpc('fn_reporte_patrimonio_neto_consolidado'),
        supabase.rpc('fn_reporte_radar_asfixia'),
        supabase.rpc('fn_reporte_podadora_bcg'),
      ])
      if (rEscudo.error) throw rEscudo.error
      if (rSafe.error) throw rSafe.error
      if (rLicu.error) throw rLicu.error
      if (rRadar.error) throw rRadar.error
      if (rPodora.error) throw rPodora.error

      const escRow = (rEscudo.data as any[])?.[0] ?? null
      if (escRow) {
        setEscudo({
          arsenal_total: Number(escRow.arsenal_total ?? 0),
          deuda_total: Number(escRow.deuda_total ?? 0),
          deuda_60_dias: Number(escRow.deuda_60_dias ?? 0),
          capital_real: Number(escRow.capital_real ?? 0),
          capital_corto_plazo: Number(escRow.capital_corto_plazo ?? 0),
          burn_rate_actual: Number(escRow.burn_rate_actual ?? 0),
          burn_rate_supervivencia: Number(escRow.burn_rate_supervivencia ?? 0),
          dias_actual_deuda_total: Number(escRow.dias_actual_deuda_total ?? 0),
          dias_actual_deuda_corta: Number(escRow.dias_actual_deuda_corta ?? 0),
          dias_supervivencia_deuda_total: Number(escRow.dias_supervivencia_deuda_total ?? 0),
          dias_supervivencia_deuda_corta: Number(escRow.dias_supervivencia_deuda_corta ?? 0),
          ventana_dias_usada: Number(escRow.ventana_dias_usada ?? 0),
          estado_alerta_key: (escRow.estado_alerta_key ?? 'critical') as EscudoData['estado_alerta_key'],
        })
      }

      const safeRow = (rSafe.data as any[])?.[0] ?? null
      if (safeRow) {
        setSafe({
          saldo_operativo: Number(safeRow.saldo_operativo ?? 0),
          blindaje_fijos_7d: Number(safeRow.blindaje_fijos_7d ?? 0),
          blindaje_deudas_7d: Number(safeRow.blindaje_deudas_7d ?? 0),
          capital_libre_semana: Number(safeRow.capital_libre_semana ?? 0),
          dias_restantes_mes: Number(safeRow.dias_restantes_mes ?? 0),
          safe_to_spend_diario: Number(safeRow.safe_to_spend_diario ?? 0),
          umbral_deseo_diario: Number(safeRow.umbral_deseo_diario ?? 0),
          estado_semaforo_key: (safeRow.estado_semaforo_key ?? 'red') as SafeData['estado_semaforo_key'],
          mensaje_sistema_key: String(safeRow.mensaje_sistema_key ?? ''),
        })
      }

      if (rLicu.data) setLicuadora(rLicu.data as LicuadoraData)
      setRadar(((rRadar.data ?? []) as any[]).map((row) => ({
        dia: String(row.dia ?? ''),
        saldo_proyectado: Number(row.saldo_proyectado ?? 0),
        ingreso_esperado: Number(row.ingreso_esperado ?? 0),
        egreso_tarjeta: Number(row.egreso_tarjeta ?? 0),
        egreso_goteo: Number(row.egreso_goteo ?? 0),
        estado_dia: (row.estado_dia ?? 'green') as RadarData['estado_dia'],
        evento_texto: row.evento_texto ?? null,
      })))
      if (rPodora.data) setPodora(rPodora.data as PodoraData)
    } catch (err: any) {
      setError(parseError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const irA = (v: Vista) => {
    haptics.light()
    setVista(v)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const volver = () => {
    haptics.light()
    setVista('dashboard')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const recargarEscudo = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_reporte_escudo_tiempo')
    if (error) {
      showToast(parseError(error), 'error')
      return
    }
    const escRow = (data as any[])?.[0] ?? null
    if (escRow) {
      setEscudo({
        arsenal_total: Number(escRow.arsenal_total ?? 0),
        deuda_total: Number(escRow.deuda_total ?? 0),
        deuda_60_dias: Number(escRow.deuda_60_dias ?? 0),
        capital_real: Number(escRow.capital_real ?? 0),
        capital_corto_plazo: Number(escRow.capital_corto_plazo ?? 0),
        burn_rate_actual: Number(escRow.burn_rate_actual ?? 0),
        burn_rate_supervivencia: Number(escRow.burn_rate_supervivencia ?? 0),
        dias_actual_deuda_total: Number(escRow.dias_actual_deuda_total ?? 0),
        dias_actual_deuda_corta: Number(escRow.dias_actual_deuda_corta ?? 0),
        dias_supervivencia_deuda_total: Number(escRow.dias_supervivencia_deuda_total ?? 0),
        dias_supervivencia_deuda_corta: Number(escRow.dias_supervivencia_deuda_corta ?? 0),
        ventana_dias_usada: Number(escRow.ventana_dias_usada ?? 0),
        estado_alerta_key: (escRow.estado_alerta_key ?? 'critical') as EscudoData['estado_alerta_key'],
      })
    }
  }, [showToast])

  if (loading && !escudo) {
    return (
      <div className="page war-page war-loading">
        <div className="spinner" />
        <p>{t('war_room_loading')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page war-page war-error">
        <span>⚠️</span>
        <p>{error}</p>
        <button className="btn btn-secondary" onClick={cargar}>
          {t('war_room_btn_retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="page war-page fade-in">
      {vista === 'dashboard' && (
        <header className="war-header">
          <div>
            <span className="war-kicker">{t('war_room_kicker')}</span>
            <h1 className="font-display">{t('war_room_title')}</h1>
            <p>{t('war_room_subtitle')}</p>
          </div>
          <button
            className="war-info-btn"
            onClick={() => {
              haptics.light()
              setShowInfo(true)
            }}
            aria-label={t('war_room_info_button')}
          >
            ℹ️
          </button>
        </header>
      )}

      {vista !== 'dashboard' && (
        <button className="war-back-btn" onClick={volver}>
          {t('war_room_volver')}
        </button>
      )}

      {vista === 'dashboard' && (
        <section className="war-dashboard">
          <EscudoTiempoWidget escudo={escudo} onDetalle={() => irA('escudo')} />
          <SafeToSpendWidget safe={safe} onDetalle={() => irA('safe')} />
          <LicuadoraWidget licuadora={licuadora} onDetalle={() => irA('licuadora')} />
          <RadarAsfixiaWidget radar={radar} onDetalle={() => irA('radar')} />
          <PodoraResumenWidget
            podora={podora}
            onIrABcg={() => {
              haptics.light()
              navigate('/analisis-emocional')
            }}
          />
        </section>
      )}

      {vista === 'escudo' && escudo && (
        <EscudoTiempoDetalle escudo={escudo} onRecargar={recargarEscudo} showToast={showToast} />
      )}

      {vista === 'safe' && safe && (
        <SafeToSpendDetalle safe={safe} />
      )}

      {vista === 'licuadora' && licuadora && (
        <LicuadoraDetalle licuadora={licuadora} onIrAInversiones={() => navigate('/billeteras')} />
      )}

      {vista === 'radar' && (
        <RadarAsfixiaDetalle radar={radar} />
      )}

      {showInfo && <WarRoomInfoModal onClose={() => setShowInfo(false)} />}
    </div>
  )
}

export default SupervivenciaPage
