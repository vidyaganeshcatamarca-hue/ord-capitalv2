import { useCallback, useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency, formatDateShort } from '@/lib/format'
import { haptics } from '@/lib/haptics'
import { SimularPagoModal } from './SimularPagoModal'
import { ConfirmarPagoModal } from './ConfirmarPagoModal'
import type { BolaNieveEstado, DeudaItem } from '@/pages/Saneamiento/SaneamientoPage'

type Estrategia = 'math' | 'emotional' | 'relationships'

interface PlanAtaqueProps {
  estadoInicial: BolaNieveEstado | null
  onVolver: () => void
  onChange: () => void
}

const ESTRATEGIAS: { key: Estrategia; label: string; desc: string }[] = [
  { key: 'math', label: 'saneamiento_estrategia_math', desc: 'saneamiento_estrategia_math_desc' },
  { key: 'emotional', label: 'saneamiento_estrategia_emotional', desc: 'saneamiento_estrategia_emotional_desc' },
  { key: 'relationships', label: 'saneamiento_estrategia_relationships', desc: 'saneamiento_estrategia_relationships_desc' },
]

export function PlanAtaque({ estadoInicial, onVolver, onChange }: PlanAtaqueProps) {
  const { showToast } = useToast()

  const [estrategia, setEstrategia] = useState<Estrategia>(estadoInicial?.estrategia_activa || 'math')
  const [estado, setEstado] = useState<BolaNieveEstado | null>(estadoInicial)
  const [deudas, setDeudas] = useState<DeudaItem[]>([])
  const [loading, setLoading] = useState(true)

  const [deudaSimular, setDeudaSimular] = useState<DeudaItem | null>(null)
  const [deudaPagar, setDeudaPagar] = useState<DeudaItem | null>(null)
  const [montoExtra, setMontoExtra] = useState<number>(0)
  const [simulacion, setSimulacion] = useState<any | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [rEstado, rDeudas] = await Promise.all([
        rpc<BolaNieveEstado>('fn_reporte_bola_nieve_estado'),
        rpc<DeudaItem[]>('fn_reporte_bola_nieve_estrategia', { p_estrategia: estrategia }),
      ])
      setEstado(rEstado)
      setDeudas(rDeudas || [])
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [estrategia, showToast])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cambiarEstrategia = async (nueva: Estrategia) => {
    if (nueva === estrategia) return
    try {
      await rpc('fn_actualizar_estrategia_bola_nieve', { p_estrategia: nueva })
      haptics.light()
      setEstrategia(nueva)
      showToast(t('saneamiento_estrategia_cambiada'), 'success')
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleSimular = async (deuda: DeudaItem, monto: number) => {
    try {
      const res = await rpc('fn_simular_pago_extra', { p_deuda_id: deuda.deuda_id, p_monto_extra: monto })
      setSimulacion(res)
      setDeudaSimular(deuda)
      setMontoExtra(monto)
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const handleConfirmarPago = async (billeteraOrigenId: number, fecha: string, nota: string) => {
    if (!deudaPagar) return
    try {
      await rpc('fn_registrar_pago_extra_deuda', {
        p_deuda_id: deudaPagar.deuda_id,
        p_monto: montoExtra,
        p_billetera_origen_id: billeteraOrigenId,
        p_fecha: fecha,
        p_nota: nota,
      })
      showToast(t('saneamiento_toast_pago_extra', { meses: String(simulacion?.meses_ahorrados || 0) }), 'success')
      setDeudaPagar(null)
      setSimulacion(null)
      onChange()
      cargar()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const pct = Math.min(100, Math.max(0, Number(estado?.porcentaje_completado) || 0))

  return (
    <section className="saneamiento-seccion">
      <h2 className="saneamiento-seccion-titulo">{t('saneamiento_ataquewidget_titulo')}</h2>

      {estado && (
        <div className="saneamiento-card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 'calc(14px * var(--font-scale))' }}>{t('saneamiento_ataquewidget_deuda_total')}</span>
            <span style={{ fontSize: 'calc(24px * var(--font-scale))', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
              {formatCurrency(estado.deuda_total, 'ARS')}
            </span>
          </div>
          <div className="saneamiento-progress-bg" style={{ margin: '12px 0' }}>
            <div
              className="saneamiento-progress-fill"
              style={{ width: `${pct}%`, background: pct >= 70 ? 'var(--mint)' : pct >= 40 ? 'var(--amber)' : 'var(--coral)' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'calc(13px * var(--font-scale))', color: 'var(--text-secondary)' }}>
            <span>{pct}% {t('saneamiento_ataquewidget_pagado')}</span>
            <span>{formatCurrency(estado.pagado_total, 'ARS')}</span>
          </div>
          {estado.fecha_fin_estimada && (
            <p style={{ margin: '12px 0 0', fontSize: 'calc(13px * var(--font-scale))', color: 'var(--text-secondary)' }}>
              {t('saneamiento_ataquewidget_fin_estimada')}: {formatDateShort(estado.fecha_fin_estimada)}
            </p>
          )}
        </div>
      )}

      <div className="saneamiento-estrategias">
        {ESTRATEGIAS.map((e) => (
          <button
            key={e.key}
            className={`saneamiento-estrategia ${estrategia === e.key ? 'active' : ''}`}
            onClick={() => cambiarEstrategia(e.key)}
          >
            <strong>{t(e.label)}</strong>
            <span>{t(e.desc)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="saneamiento-loading-mini"><div className="spinner" /></div>
      ) : deudas.length === 0 ? (
        <div className="saneamiento-empty">
          <span className="saneamiento-empty-icon">🏆</span>
          <h3>{t('saneamiento_ataque_sin_deudas_titulo')}</h3>
          <p>{t('saneamiento_ataque_sin_deudas_desc')}</p>
        </div>
      ) : (
        <div className="saneamiento-lista">
          {deudas.map((d) => (
            <DeudaCard
              key={d.deuda_id}
              deuda={d}
              onSimular={handleSimular}
              onPagar={(monto) => {
                setDeudaPagar(d)
                setMontoExtra(monto)
              }}
            />
          ))}
        </div>
      )}

      {deudaSimular && simulacion && (
        <SimularPagoModal
          deuda={deudaSimular}
          monto={montoExtra}
          simulacion={simulacion}
          isOpen={true}
          onClose={() => { setDeudaSimular(null); setSimulacion(null) }}
          onConfirmar={() => {
            setDeudaPagar(deudaSimular)
            setDeudaSimular(null)
            setSimulacion(null)
          }}
        />
      )}

      {deudaPagar && (
        <ConfirmarPagoModal
          deuda={deudaPagar}
          monto={montoExtra}
          isOpen={true}
          onClose={() => setDeudaPagar(null)}
          onConfirmar={handleConfirmarPago}
        />
      )}
    </section>
  )
}

interface DeudaCardProps {
  deuda: DeudaItem
  onSimular: (deuda: DeudaItem, monto: number) => void
  onPagar: (monto: number) => void
}

function DeudaCard({ deuda, onSimular, onPagar }: DeudaCardProps) {
  const [monto, setMonto] = useState<string>('')

  const handleSimularClick = () => {
    const val = parseFloat(monto.replace(',', '.'))
    if (!val || val <= 0) return
    onSimular(deuda, val)
  }

  return (
    <div className="saneamiento-item">
      <div className="saneamiento-item-main">
        <div className="saneamiento-item-info">
          <div className="saneamiento-item-titulo">
            <span className="saneamiento-prioridad">#{deuda.prioridad}</span>
            <span>{deuda.nombre_deuda}</span>
            <span className="saneamiento-badge" style={{ background: 'rgba(160,160,160,0.15)', color: 'var(--text-secondary)' }}>
              {deuda.tipo_deuda}
            </span>
          </div>
          <p className="saneamiento-item-meta">
            {t('saneamiento_saldo')}: {formatCurrency(deuda.saldo_actual, 'ARS')} · TNA: {deuda.tna}%<br />
            {t('saneamiento_cuota_mensual')}: {formatCurrency(deuda.cuota_mensual, 'ARS')}
            {deuda.vencimiento_proximo && <> · {t('saneamiento_vencimiento')}: {formatDateShort(deuda.vencimiento_proximo)}</>}
          </p>
        </div>
      </div>
      <div className="saneamiento-item-actions">
        <input
          type="number"
          className="saneamiento-input-sm"
          placeholder={t('saneamiento_input_extra_placeholder')}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        <button className="saneamiento-btn-editar" onClick={handleSimularClick}>
          📊 {t('saneamiento_simular')}
        </button>
      </div>
    </div>
  )
}
