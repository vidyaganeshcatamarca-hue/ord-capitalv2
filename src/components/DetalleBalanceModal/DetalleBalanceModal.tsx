import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import './DetalleBalanceModal.css'

interface DesgloseCategoria {
  estructura_id: number
  nombre_categoria: string
  icono: string
  color: string
  total_categoria: number
  pagado_creador: number
  pagado_invitado: number
  esperado_creador: number
  esperado_invitado: number
  diferencia_creador: number
  diferencia_invitado: number
}

interface DetalleBalanceModalProps {
  isOpen: boolean
  onClose: () => void
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

const getSemaforo = (diferencia: number, total: number): 'verde' | 'amarillo' | 'rojo' => {
  if (total <= 0) return 'verde'
  const pct = Math.abs(diferencia) / total
  if (pct < 0.05) return 'verde'
  if (pct < 0.15) return 'amarillo'
  return 'rojo'
}

export function DetalleBalanceModal({ isOpen, onClose }: DetalleBalanceModalProps) {
  const { showToast } = useToast()
  const [categorias, setCategorias] = useState<DesgloseCategoria[]>([])
  const [loading, setLoading] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('fn_reporte_desglose_balance')
      if (rpcError) throw rpcError
      setCategorias(
        ((data ?? []) as any[]).map((item) => ({
          estructura_id: Number(item.estructura_id),
          nombre_categoria: item.nombre_categoria ?? '',
          icono: item.icono ?? '📊',
          color: item.color ?? '#6366F1',
          total_categoria: Number(item.total_categoria ?? 0),
          pagado_creador: Number(item.pagado_creador ?? 0),
          pagado_invitado: Number(item.pagado_invitado ?? 0),
          esperado_creador: Number(item.esperado_creador ?? 0),
          esperado_invitado: Number(item.esperado_invitado ?? 0),
          diferencia_creador: Number(item.diferencia_creador ?? 0),
          diferencia_invitado: Number(item.diferencia_invitado ?? 0),
        })),
      )
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (isOpen) cargar()
  }, [isOpen, cargar])

  if (!isOpen) return null

  const totales = categorias.reduce(
    (acc, item) => ({
      total: acc.total + item.total_categoria,
      pagado_creador: acc.pagado_creador + item.pagado_creador,
      pagado_invitado: acc.pagado_invitado + item.pagado_invitado,
      esperado_creador: acc.esperado_creador + item.esperado_creador,
      esperado_invitado: acc.esperado_invitado + item.esperado_invitado,
    }),
    { total: 0, pagado_creador: 0, pagado_invitado: 0, esperado_creador: 0, esperado_invitado: 0 },
  )

  const difCreadorGlobal = totales.pagado_creador - totales.esperado_creador
  const difInvitadoGlobal = totales.pagado_invitado - totales.esperado_invitado

  return (
    <div className="detalle-balance-overlay" onClick={onClose}>
      <div className="detalle-balance-card" onClick={(e) => e.stopPropagation()}>
        <header className="detalle-balance-header">
          <div>
            <h2 className="font-display">{t('familia_detalle_titulo')}</h2>
            <p className="detalle-balance-sub">{t('familia_detalle_sub')}</p>
          </div>
          <button className="detalle-balance-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        <div className="detalle-balance-body">
          {loading ? (
            <div className="detalle-balance-loading">
              <div className="spinner" />
            </div>
          ) : categorias.length === 0 ? (
            <p className="detalle-balance-empty">{t('familia_detalle_vacio')}</p>
          ) : (
            <>
              <section className="detalle-balance-resumen">
                <span className="detalle-balance-label">{t('familia_detalle_resumen_global')}</span>
                <div className="detalle-balance-resumen-grid">
                  <div>
                    <span className="detalle-balance-resumen-key">{t('familia_detalle_total')}</span>
                    <strong className="detalle-balance-resumen-value">
                      {formatMoney(totales.total)}
                    </strong>
                  </div>
                  <div>
                    <span className="detalle-balance-resumen-key">
                      {t('hogar_integrantes_creador')}
                    </span>
                    <strong className="detalle-balance-resumen-value">
                      {formatMoney(totales.pagado_creador)}
                    </strong>
                  </div>
                  <div>
                    <span className="detalle-balance-resumen-key">
                      {t('hogar_integrantes_invitado')}
                    </span>
                    <strong className="detalle-balance-resumen-value">
                      {formatMoney(totales.pagado_invitado)}
                    </strong>
                  </div>
                </div>
                <div className="detalle-balance-esperado">
                  <div>
                    <span className="detalle-balance-resumen-key">
                      {t('familia_detalle_esperado_creador')}
                    </span>
                    <strong>{formatMoney(totales.esperado_creador)}</strong>
                  </div>
                  <div>
                    <span className="detalle-balance-resumen-key">
                      {t('familia_detalle_esperado_invitado')}
                    </span>
                    <strong>{formatMoney(totales.esperado_invitado)}</strong>
                  </div>
                </div>
                <div className="detalle-balance-diferencia">
                  <div>
                    <span className="detalle-balance-resumen-key">
                      {t('familia_detalle_dif_creador')}
                    </span>
                    <strong
                      className={difCreadorGlobal >= 0 ? 'positivo' : 'negativo'}
                    >
                      {difCreadorGlobal >= 0
                        ? `+${formatMoney(difCreadorGlobal)}`
                        : formatMoney(difCreadorGlobal)}
                    </strong>
                  </div>
                  <div>
                    <span className="detalle-balance-resumen-key">
                      {t('familia_detalle_dif_invitado')}
                    </span>
                    <strong
                      className={difInvitadoGlobal >= 0 ? 'positivo' : 'negativo'}
                    >
                      {difInvitadoGlobal >= 0
                        ? `+${formatMoney(difInvitadoGlobal)}`
                        : formatMoney(difInvitadoGlobal)}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="detalle-balance-categorias">
                <span className="detalle-balance-label">{t('familia_detalle_desglose')}</span>
                <ul className="detalle-balance-lista">
                  {categorias.map((cat) => {
                    const semaforo = getSemaforo(
                      Math.abs(cat.diferencia_creador),
                      cat.total_categoria,
                    )
                    return (
                      <li key={`${cat.color}-${cat.estructura_id}`} className="detalle-balance-item">
                        <div className="detalle-balance-item-head">
                          <span
                            className="detalle-balance-item-icon"
                            style={{ background: `${cat.color}24` }}
                          >
                            <CategoryIcon name={cat.icono} size={18} />
                          </span>
                          <div className="detalle-balance-item-title">
                            <strong>{cat.nombre_categoria}</strong>
                            <span>
                              {t('familia_detalle_total')}: {formatMoney(cat.total_categoria)}
                            </span>
                          </div>
                          <span className={`detalle-semaforo detalle-semaforo-${semaforo}`} />
                        </div>
                        <div className="detalle-balance-item-body">
                          <div className="detalle-balance-item-row">
                            <span>{t('hogar_integrantes_creador')}</span>
                            <span>
                              {formatMoney(cat.pagado_creador)}{' '}
                              <small>
                                ({t('familia_detalle_esperado_label')}{' '}
                                {formatMoney(cat.esperado_creador)})
                              </small>
                            </span>
                          </div>
                          <div className="detalle-balance-item-row">
                            <span>{t('hogar_integrantes_invitado')}</span>
                            <span>
                              {formatMoney(cat.pagado_invitado)}{' '}
                              <small>
                                ({t('familia_detalle_esperado_label')}{' '}
                                {formatMoney(cat.esperado_invitado)})
                              </small>
                            </span>
                          </div>
                          {Math.abs(cat.diferencia_creador) > 0 && (
                            <div
                              className={`detalle-balance-item-dif detalle-semaforo-${semaforo}-text`}
                            >
                              {cat.diferencia_creador > 0
                                ? t('familia_detalle_dif_positiva_creador', {
                                    monto: formatMoney(cat.diferencia_creador),
                                  })
                                : t('familia_detalle_dif_negativa_creador', {
                                    monto: formatMoney(Math.abs(cat.diferencia_creador)),
                                  })}
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
