import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency, formatDateShort } from '@/lib/format'
import { ConfirmarPagoModal } from './ConfirmarPagoModal'
import type { CalendarioEvento, DeudaItem } from '@/pages/Saneamiento/SaneamientoPage'

interface CalendarioFinancieroProps {
  eventosIniciales: CalendarioEvento[]
  onVolver: () => void
  onChange: () => void
}

export function CalendarioFinanciero({ eventosIniciales, onVolver, onChange }: CalendarioFinancieroProps) {
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [dias, setDias] = useState<30 | 60>(30)
  const [eventos, setEventos] = useState<CalendarioEvento[]>(eventosIniciales)
  const [loading, setLoading] = useState(false)
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)

  const [deudaPagar, setDeudaPagar] = useState<DeudaItem | null>(null)
  const [montoPago, setMontoPago] = useState<number>(0)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await rpc<CalendarioEvento[]>('fn_reporte_calendario_financiero', { p_dias_adelante: dias })
      setEventos(res || [])
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [dias, showToast])

  useEffect(() => {
    if (dias === 30 && eventosIniciales.length > 0) return
    cargar()
  }, [dias, cargar, eventosIniciales.length])

  const eventosPorDia = useMemo(() => {
    const map: Record<string, CalendarioEvento[]> = {}
    eventos.forEach((e) => {
      const key = e.fecha
      if (!map[key]) map[key] = []
      map[key].push(e)
    })
    return map
  }, [eventos])

  const totalPorDia = useMemo(() => {
    const totals: Record<string, number> = {}
    Object.entries(eventosPorDia).forEach(([key, list]) => {
      totals[key] = list.reduce((acc, e) => acc + Number(e.monto), 0)
    })
    return totals
  }, [eventosPorDia])

  const diasGrid = useMemo(() => {
    const start = new Date()
    const days: Date[] = []
    for (let i = 0; i < dias; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(d)
    }
    return days
  }, [dias])

  const marcarPagado = (evento: CalendarioEvento) => {
    if (evento.tipo_evento === 'cuota_prestamo') {
      const deudaId = Number(evento.evento_id.replace('prestamo_', ''))
      setDeudaPagar({
        deuda_id: deudaId,
        nombre_deuda: evento.nombre,
        tipo_deuda: 'prestamo',
        saldo_actual: evento.monto,
        tna: 0,
        cuota_mensual: evento.monto,
        vencimiento_proximo: evento.fecha,
        prioridad: 0,
      })
      setMontoPago(evento.monto)
    } else if (evento.tipo_evento === 'vencimiento_tarjeta') {
      navigate('/tarjetas')
    } else {
      showToast(t('saneamiento_calendario_recurrente_info'), 'info')
    }
  }

  const handleConfirmarPago = async (billeteraOrigenId: number, fecha: string, nota: string) => {
    if (!deudaPagar) return
    try {
      await rpc('fn_registrar_pago_extra_deuda', {
        p_deuda_id: deudaPagar.deuda_id,
        p_monto: montoPago,
        p_billetera_origen_id: billeteraOrigenId,
        p_fecha: fecha,
        p_nota: nota,
      })
      showToast(t('saneamiento_toast_pago_registrado'), 'success')
      setDeudaPagar(null)
      onChange()
      cargar()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    }
  }

  const getColorDia = (key: string) => {
    const total = totalPorDia[key] || 0
    if (total > 50000) return 'var(--coral)'
    if (total >= 10000) return 'var(--amber)'
    return 'transparent'
  }

  return (
    <section className="saneamiento-seccion">
      <h2 className="saneamiento-seccion-titulo">{t('saneamiento_calendariowidget_titulo')}</h2>

      <div className="saneamiento-toggle">
        <button className={dias === 30 ? 'active' : ''} onClick={() => setDias(30)}>30 {t('saneamiento_dias')}</button>
        <button className={dias === 60 ? 'active' : ''} onClick={() => setDias(60)}>60 {t('saneamiento_dias')}</button>
      </div>

      {loading ? (
        <div className="saneamiento-loading-mini"><div className="spinner" /></div>
      ) : eventos.length === 0 ? (
        <div className="saneamiento-empty">
          <span className="saneamiento-empty-icon">✅</span>
          <h3>{t('saneamiento_calendario_vacio_titulo')}</h3>
          <p>{t('saneamiento_calendario_vacio_desc', { dias: String(dias) })}</p>
        </div>
      ) : (
        <>
          <div className="saneamiento-heatmap">
            {diasGrid.map((d) => {
              const key = d.toISOString().split('T')[0]
              const total = totalPorDia[key] || 0
              return (
                <button
                  key={key}
                  className={`saneamiento-dia ${diaSeleccionado === key ? 'selected' : ''}`}
                  style={{ background: getColorDia(key) }}
                  onClick={() => setDiaSeleccionado(diaSeleccionado === key ? null : key)}
                >
                  <span className="saneamiento-dia-numero">{d.getDate()}</span>
                  {total > 0 && <span className="saneamiento-dia-dot" />}
                </button>
              )
            })}
          </div>

          <div className="saneamiento-leyenda">
            <span><span className="dot coral" /> {t('saneamiento_leyenda_critico')}</span>
            <span><span className="dot amber" /> {t('saneamiento_leyenda_normal')}</span>
            <span><span className="dot empty" /> {t('saneamiento_leyenda_libre')}</span>
          </div>

          <h3 className="saneamiento-subtitulo">{t('saneamiento_proximos_vencimientos')}</h3>
          <div className="saneamiento-lista">
            {eventos
              .filter((e) => !diaSeleccionado || e.fecha === diaSeleccionado)
              .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
              .map((e) => (
                <div key={e.evento_id} className="saneamiento-item">
                  <div className="saneamiento-item-main">
                    <div className="saneamiento-item-info">
                      <div className="saneamiento-item-titulo">
                        <span className="dot" style={{ background: e.criticidad === 'critico' ? 'var(--coral)' : 'var(--amber)' }} />
                        <span>{e.nombre}</span>
                        <span className="saneamiento-badge" style={{ background: 'rgba(160,160,160,0.15)', color: 'var(--text-secondary)' }}>
                          {t(`saneamiento_tipo_${e.tipo_evento}`)}
                        </span>
                      </div>
                      <p className="saneamiento-item-meta">
                        {formatDateShort(e.fecha)} · {formatCurrency(e.monto, 'ARS')}
                      </p>
                    </div>
                  </div>
                  <div className="saneamiento-item-actions">
                    <button className="saneamiento-btn-aprobar" onClick={() => marcarPagado(e)}>
                      ✅ {t('saneamiento_marcar_pagado')}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {deudaPagar && (
        <ConfirmarPagoModal
          deuda={deudaPagar}
          monto={montoPago}
          isOpen={true}
          onClose={() => setDeudaPagar(null)}
          onConfirmar={handleConfirmarPago}
        />
      )}
    </section>
  )
}
