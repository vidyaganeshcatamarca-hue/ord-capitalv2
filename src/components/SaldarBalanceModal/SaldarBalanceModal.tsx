import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useHogar } from '@/contexts/HogarContext'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import './SaldarBalanceModal.css'

type SaldarTipo = 'transferencia_real' | 'marcar_saldado'
type SaldarDireccion = 'creador_a_invitado' | 'invitado_a_creador'

interface Billetera {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
  es_fondo_prevision: boolean
  es_compartida: boolean
}

interface SaldarBalanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  montoDeuda: number
  deudorNombre?: string | null
  acreedorNombre?: string | null
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

export function SaldarBalanceModal({
  isOpen,
  onClose,
  onSuccess,
  montoDeuda,
  deudorNombre,
  acreedorNombre,
}: SaldarBalanceModalProps) {
  const { showToast } = useToast()
  const { estado } = useHogar()
  const [tipo, setTipo] = useState<SaldarTipo | null>(null)
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [direccion, setDireccion] = useState<SaldarDireccion | null>(null)
  const [billeteraOrigenId, setBilleteraOrigenId] = useState<number | null>(null)
  const [billeteraDestinoId, setBilleteraDestinoId] = useState<number | null>(null)
  const [billeteras, setBilleteras] = useState<Billetera[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingBilleteras, setLoadingBilleteras] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentRol = estado?.rol
  const isCreador = currentRol === 'creador'
  const defaultDirection: SaldarDireccion = isCreador ? 'creador_a_invitado' : 'invitado_a_creador'
  const otherDirection: SaldarDireccion = isCreador ? 'invitado_a_creador' : 'creador_a_invitado'

  const nombreYo = isCreador ? t('hogar_integrantes_creador') : t('hogar_integrantes_invitado')
  const nombrePareja = isCreador ? t('hogar_integrantes_invitado') : t('hogar_integrantes_creador')

  const billeterasOrigen = useMemo(
    () => billeteras.filter((b) => !b.es_fondo_prevision),
    [billeteras],
  )
  const billeterasDestino = useMemo(
    () => billeteras.filter((b) => b.es_compartida),
    [billeteras],
  )

  const cargarBilleteras = useCallback(async () => {
    setLoadingBilleteras(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('fn_obtener_billeteras_activas')
      if (rpcError) throw rpcError
      setBilleteras(
        ((data ?? []) as any[]).map((b) => ({
          billetera_id: Number(b.billetera_id),
          nombre: b.nombre ?? '',
          moneda: b.moneda ?? 'ARS',
          saldo_actual: Number(b.saldo_actual ?? 0),
          es_fondo_prevision: Boolean(b.es_fondo_prevision),
          es_compartida: Boolean(b.es_compartida),
        })),
      )
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoadingBilleteras(false)
    }
  }, [showToast])

  useEffect(() => {
    if (isOpen) {
      setTipo(null)
      setMonto(String(montoDeuda))
      setNota('')
      setDireccion(defaultDirection)
      setBilleteraOrigenId(null)
      setBilleteraDestinoId(null)
      setError(null)
      cargarBilleteras()
    }
  }, [isOpen, montoDeuda, defaultDirection, cargarBilleteras])

  if (!isOpen) return null

  const handleUsarDeudaTotal = () => setMonto(String(montoDeuda))

  const handleTipoSelect = (value: SaldarTipo) => {
    haptics.light()
    setTipo(value)
    setError(null)
  }

  const handleVolver = () => {
    setTipo(null)
    setError(null)
    setBilleteraOrigenId(null)
    setBilleteraDestinoId(null)
  }

  const validate = (): string | null => {
    if (!tipo) return t('familia_saldar_elige_tipo')
    const montoNum = Number(monto)
    if (!monto || isNaN(montoNum) || montoNum <= 0) return t('familia_saldar_monto_invalido')
    if (montoNum > montoDeuda) return t('familia_saldar_monto_excede')
    if (tipo === 'transferencia_real') {
      if (!billeteraOrigenId) return t('familia_saldar_origen_requerido')
      if (!billeteraDestinoId) return t('familia_saldar_destino_requerido')
      if (billeteraOrigenId === billeteraDestinoId) return t('familia_saldar_misma_billetera')
    } else if (!direccion) {
      return t('familia_saldar_direccion_requerida')
    }
    return null
  }

  const handleConfirmar = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const params: Record<string, any> = {
        p_tipo: tipo,
        p_monto: Number(monto),
      }
      if (tipo === 'transferencia_real') {
        params.p_direccion = defaultDirection
        params.p_billetera_origen_id = billeteraOrigenId
        params.p_billetera_destino_id = billeteraDestinoId
      } else {
        params.p_direccion = direccion
      }
      if (nota.trim()) params.p_nota = nota.trim()

      const { error: rpcError } = await supabase.rpc('fn_saldar_balance_hogar', params)
      if (rpcError) throw rpcError

      const isParcial = Number(monto) < montoDeuda
      const toastMsg =
        tipo === 'transferencia_real'
          ? t('hogar_saldar_exito_real', { monto: formatMoney(Number(monto)) })
          : t('hogar_saldar_exito_marcado')
      showToast(toastMsg, 'success')
      haptics.success()
      if (isParcial) {
        showToast(t('hogar_saldar_parcial', { monto: formatMoney(Number(monto)), total: formatMoney(montoDeuda) }), 'info')
      }

      window.dispatchEvent(new CustomEvent('movement-added'))
      onSuccess?.()
      onClose()
    } catch (err: any) {
      setError(parseError(err))
      haptics.error()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="saldar-modal-overlay" onClick={onClose}>
      <div className="saldar-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="saldar-modal-header">
          <h2 className="font-display">{t('hogar_saldar_titulo')}</h2>
          <button className="saldar-modal-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        <div className="saldar-modal-body">
          <div className="saldar-modal-deuda">
            <span className="saldar-modal-label">{t('hogar_saldar_deuda_actual')}</span>
            <strong className="saldar-modal-monto">{formatMoney(montoDeuda)}</strong>
            <p className="saldar-modal-detalle">
              {(deudorNombre || t('familia_integrante_generico'))}
              {' → '}
              {(acreedorNombre || t('familia_integrante_generico'))}
            </p>
          </div>

          {!tipo && (
            <div className="saldar-modal-tipo-grid">
              <button
                type="button"
                className="saldar-modal-tipo-card"
                onClick={() => handleTipoSelect('transferencia_real')}
              >
                <span className="saldar-modal-tipo-icon" aria-hidden="true">💸</span>
                <strong>{t('hogar_saldar_tipo_real')}</strong>
                <p>{t('hogar_saldar_tipo_real_desc')}</p>
              </button>
              <button
                type="button"
                className="saldar-modal-tipo-card"
                onClick={() => handleTipoSelect('marcar_saldado')}
              >
                <span className="saldar-modal-tipo-icon" aria-hidden="true">✅</span>
                <strong>{t('hogar_saldar_tipo_marcar')}</strong>
                <p>{t('hogar_saldar_tipo_marcar_desc')}</p>
              </button>
            </div>
          )}

          {tipo === 'transferencia_real' && (
            <div className="saldar-modal-form">
              <div className="saldar-form-group">
                <label>{t('hogar_saldar_origen', { nombre: nombreYo })}</label>
                <select
                  value={billeteraOrigenId ?? ''}
                  onChange={(e) => setBilleteraOrigenId(e.target.value ? Number(e.target.value) : null)}
                  disabled={loadingBilleteras}
                >
                  <option value="">--</option>
                  {billeterasOrigen.map((b) => (
                    <option key={b.billetera_id} value={b.billetera_id}>
                      {b.nombre} ({b.moneda}) — {formatMoney(b.saldo_actual)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="saldar-form-group">
                <label>{t('hogar_saldar_destino', { nombre: nombrePareja })}</label>
                <select
                  value={billeteraDestinoId ?? ''}
                  onChange={(e) => setBilleteraDestinoId(e.target.value ? Number(e.target.value) : null)}
                  disabled={loadingBilleteras}
                >
                  <option value="">--</option>
                  {billeterasDestino.length === 0 && (
                    <option value="" disabled>
                      {t('familia_saldar_sin_compartidas')}
                    </option>
                  )}
                  {billeterasDestino.map((b) => (
                    <option key={b.billetera_id} value={b.billetera_id}>
                      {b.nombre} ({b.moneda}) — {formatMoney(b.saldo_actual)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="saldar-form-group">
                <label>{t('hogar_saldar_monto')}</label>
                <div className="saldar-monto-row">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="0"
                    step="0.01"
                    min="0"
                    max={montoDeuda}
                  />
                  <button type="button" className="btn-secondary" onClick={handleUsarDeudaTotal}>
                    {t('hogar_saldar_usar_deuda_total')}
                  </button>
                </div>
                {Number(monto) > 0 && Number(monto) < montoDeuda && (
                  <p className="saldar-monto-help">
                    {t('hogar_saldar_parcial', {
                      monto: formatMoney(Number(monto)),
                      total: formatMoney(montoDeuda),
                    })}
                  </p>
                )}
              </div>

              <div className="saldar-form-group">
                <label>{t('hogar_saldar_nota')}</label>
                <input
                  type="text"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="..."
                />
              </div>
            </div>
          )}

          {tipo === 'marcar_saldado' && (
            <div className="saldar-modal-form">
              <div className="saldar-form-group">
                <label>{t('hogar_saldar_monto')}</label>
                <div className="saldar-monto-row">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="0"
                    step="0.01"
                    min="0"
                    max={montoDeuda}
                  />
                  <button type="button" className="btn-secondary" onClick={handleUsarDeudaTotal}>
                    {t('hogar_saldar_usar_deuda_total')}
                  </button>
                </div>
                {Number(monto) > 0 && Number(monto) < montoDeuda && (
                  <p className="saldar-monto-help">
                    {t('hogar_saldar_parcial', {
                      monto: formatMoney(Number(monto)),
                      total: formatMoney(montoDeuda),
                    })}
                  </p>
                )}
              </div>

              <div className="saldar-form-group">
                <span className="saldar-form-label">{t('familia_saldar_direccion_label')}</span>
                <div className="saldar-direccion-row">
                  <label className="saldar-radio">
                    <input
                      type="radio"
                      name="direccion-saldar"
                      value={defaultDirection}
                      checked={direccion === defaultDirection}
                      onChange={() => setDireccion(defaultDirection)}
                    />
                    <span>
                      {t('familia_saldar_direccion_yo_pago', { nombre: nombrePareja })}
                    </span>
                  </label>
                  <label className="saldar-radio">
                    <input
                      type="radio"
                      name="direccion-saldar"
                      value={otherDirection}
                      checked={direccion === otherDirection}
                      onChange={() => setDireccion(otherDirection)}
                    />
                    <span>
                      {t('familia_saldar_direccion_pareja_paga', { nombre: nombrePareja })}
                    </span>
                  </label>
                </div>
              </div>

              <div className="saldar-form-group">
                <label>{t('hogar_saldar_nota')}</label>
                <input
                  type="text"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="..."
                />
              </div>
            </div>
          )}

          {error && <div className="saldar-modal-error">{error}</div>}
        </div>

        <footer className="saldar-modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={tipo ? handleVolver : onClose}
            disabled={loading}
          >
            {tipo ? t('familia_saldar_volver') : t('hogar_saldar_cancelar')}
          </button>
          {tipo && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirmar}
              disabled={loading}
            >
              {loading ? <span className="saldar-spinner" /> : t('hogar_saldar_confirmar')}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
