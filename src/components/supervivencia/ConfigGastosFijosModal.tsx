import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import './ConfigGastosFijosModal.css'

interface GastoDetectado {
  estructura_id: number
  nombre: string
  icono: string
  color: string
  promedio_mensual: number
  maximo_mensual: number
  minimo_mensual: number
  meses_detectado: number
  es_fijo_confirmado: boolean
}

interface ConfigGastosFijosModalProps {
  onClose: () => void
  onGuardado: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

interface ConfigItem {
  estructura_id: number
  monto_mensual: number
  es_fijo: boolean
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

export function ConfigGastosFijosModal({
  onClose,
  onGuardado,
  showToast,
}: ConfigGastosFijosModalProps) {
  const [items, setItems] = useState<ConfigItem[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vacio, setVacio] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    cargar()
  }, [])

  const cargar = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('fn_reporte_gastos_fijos_mensuales')
      if (error) throw error
      const detectados = ((data as any)?.gastos_detectados ?? []) as GastoDetectado[]
      if (detectados.length === 0) {
        setVacio(true)
        setItems([])
      } else {
        setItems(
          detectados.map((g) => ({
            estructura_id: g.estructura_id,
            monto_mensual: g.promedio_mensual,
            es_fijo: true,
          })),
        )
        setVacio(false)
      }
    } catch (err: any) {
      setError(parseError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (estructura_id: number) => {
    haptics.light()
    setItems((prev) =>
      prev.map((it) =>
        it.estructura_id === estructura_id ? { ...it, es_fijo: !it.es_fijo } : it,
      ),
    )
  }

  const handleMonto = (estructura_id: number, monto: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.estructura_id === estructura_id
          ? { ...it, monto_mensual: Math.max(0, monto) }
          : it,
      ),
    )
  }

  const handleGuardar = async () => {
    if (guardando) return
    setGuardando(true)
    try {
      const payload = items
        .filter((it) => it.es_fijo)
        .map((it) => ({
          estructura_id: it.estructura_id,
          monto_mensual: it.monto_mensual,
          es_fijo: it.es_fijo,
        }))
      const { error } = await supabase.rpc('fn_configurar_gastos_fijos', {
        p_gastos_fijos: payload,
      })
      if (error) throw error
      showToast(t('war_escudo_config_exito'), 'success')
      haptics.success()
      onGuardado()
      onClose()
    } catch (err: any) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="cfg-overlay" onClick={onClose}>
      <div className="cfg-modal" onClick={(e) => e.stopPropagation()}>
        <header className="cfg-header">
          <h2 className="font-display">{t('war_escudo_config_titulo')}</h2>
          <button className="cfg-close" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <p className="cfg-subtitulo">{t('war_escudo_config_subtitulo')}</p>

        {loading ? (
          <div className="cfg-loading">
            <div className="spinner" />
          </div>
        ) : error ? (
          <div className="cfg-error">
            <span>⚠️</span>
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={cargar}>
              {t('war_room_btn_retry')}
            </button>
          </div>
        ) : vacio ? (
          <div className="cfg-empty">
            <p>{t('war_escudo_config_vacio')}</p>
            <button className="btn btn-primary" onClick={cargar}>
              {t('war_escudo_config_detectar_cta')}
            </button>
          </div>
        ) : (
          <ul className="cfg-lista">
            {items.map((item) => {
              const original = (item as any)
              return (
                <li key={item.estructura_id} className="cfg-item">
                  <div className="cfg-item-header">
                    <div className="cfg-item-icon">
                      <CategoryIcon name={original?.icono || 'Briefcase'} size={24} />
                    </div>
                    <div className="cfg-item-titulo">
                      <strong>{String(original?.nombre ?? `Cat #${item.estructura_id}`)}</strong>
                      <span className="cfg-item-promedio">
                        {t('war_escudo_config_label_promedio', {
                          monto: formatMoneyARS(item.monto_mensual),
                        })}
                      </span>
                    </div>
                    <label className="cfg-toggle">
                      <input
                        type="checkbox"
                        checked={item.es_fijo}
                        onChange={() => handleToggle(item.estructura_id)}
                      />
                      <span className="cfg-toggle-slider" />
                    </label>
                  </div>
                  {item.es_fijo && (
                    <div className="cfg-item-monto">
                      <label>
                        {t('war_escudo_config_monto_label')}
                        <input
                          type="number"
                          min="0"
                          value={item.monto_mensual}
                          onChange={(e) =>
                            handleMonto(item.estructura_id, Number(e.target.value))
                          }
                        />
                      </label>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <footer className="cfg-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={guardando}>
            {t('war_escudo_config_cancelar')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGuardar}
            disabled={guardando || loading || items.filter((i) => i.es_fijo).length === 0}
          >
            {guardando ? '...' : t('war_escudo_config_guardar')}
          </button>
        </footer>
      </div>
    </div>
  )
}
