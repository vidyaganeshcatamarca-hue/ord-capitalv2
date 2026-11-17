import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, fechaLocalISO } from '@/lib/format'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { parseError, t } from '@/locales/i18n'
import { WalletDropdownSelect, type WalletOptionItem } from '@/components/WalletDropdownSelect'
import type { BilleteraOperativa, ModalidadReserva, Sobre } from './types'
import { ToggleSwitch } from '@/components/configuracion/ToggleSwitch'
import './sobresModal.css'

interface SobreAporteModalProps {
  isOpen: boolean
  sobre: Sobre | null
  billeteras: BilleteraOperativa[]
  onClose: () => void
  onSuccess: () => void
}

export function SobreAporteModal({ isOpen, sobre, billeteras, onClose, onSuccess }: SobreAporteModalProps) {
  // El formato de moneda llega por contexto: sin esto queda el del primer render.
  useFormatRevision()
  const { showToast } = useToast()
  const [importe, setImporte] = useState('')
  const [billeteraId, setBilleteraId] = useState<number | null>(null)
  const [modalidad, setModalidad] = useState<ModalidadReserva>('virtual')
  const [genera, setGenera] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sólo billeteras de la moneda del sobre: un sobre no convierte (DF-07).
  const disponibles = useMemo(
    () => (sobre ? billeteras.filter((b) => b.moneda?.toUpperCase() === sobre.moneda.toUpperCase()) : []),
    [billeteras, sobre],
  )

  const wallets: WalletOptionItem[] = useMemo(
    () =>
      disponibles.map((b) => ({
        billetera_id: b.billetera_id,
        nombre: b.nombre,
        moneda: b.moneda,
        saldo_actual: b.saldo_actual,
        icono: b.icono ?? null,
        es_fondo_prevision: b.es_fondo_prevision,
      })),
    [disponibles],
  )

  useEffect(() => {
    if (!isOpen) return
    // El importe arranca vacío: la cuota del plan se ofrece como sugerencia y
    // solo entra al campo si el usuario la toca (DF-09).
    setImporte('')
    setBilleteraId(disponibles[0]?.billetera_id ?? null)
    setModalidad('virtual')
    setGenera(false)
    setError(null)
    setGuardando(false)
    // `disponibles` cambia de identidad en cada render; dependemos de los ids.
  }, [isOpen, sobre, disponibles.length])

  if (!isOpen || !sobre) return null

  const importeNum = Number(importe)
  const importeValido = Number.isFinite(importeNum) && importeNum > 0
  const sugeridoMensual = sobre.cuota_mensual ?? 0
  const sugeridoSemanal = sobre.cuota_semanal ?? 0
  const superaMeta =
    importeValido && sobre.monto_meta !== null && sobre.saldo + importeNum > sobre.monto_meta

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!importeValido) {
      setError(t('error_sobre_amount_invalid'))
      return
    }
    if (!billeteraId) {
      setError(t('error_sobre_wallet_not_found'))
      return
    }
    setGuardando(true)
    try {
      const { error: rpcError } = await supabase.rpc('fn_sobre_aportar', {
        p_sobre_id: sobre.sobre_id,
        p_billetera_id: billeteraId,
        p_importe: importeNum,
        p_modalidad: modalidad,
        p_genera_rendimiento: modalidad === 'real' ? genera : false,
        // La fecha la pone el dispositivo: el servidor esta en UTC y a la noche
        // guardaria el dia siguiente.
        p_fecha: fechaLocalISO(),
      })
      if (rpcError) throw rpcError
      showToast(t('sobres_aporte_success'), 'success')
      haptics.success()
      onSuccess()
      onClose()
    } catch (err) {
      setError(parseError(err))
      haptics.error()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="sobre-overlay" onClick={onClose}>
      <form className="sobre-modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="sobre-modal-header">
          <div>
            <h2 className="font-display">{t('sobres_aporte_title', { nombre: sobre.nombre })}</h2>
            <p className="sobre-modal-sub">
              {formatCurrency(sobre.saldo, sobre.moneda)}
              {sobre.monto_meta !== null && ` ${t('sobres_of_goal', { meta: formatCurrency(sobre.monto_meta, sobre.moneda) })}`}
            </p>
          </div>
          <button type="button" className="sobre-modal-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        <div className="sobre-modal-body">
          <div className="sobre-grupo">
            <label htmlFor="aporte-importe">{t('sobres_amount')}</label>
            <input
              id="aporte-importe"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="0"
              enterKeyHint="done"
            />
            {(sugeridoMensual > 0 || sugeridoSemanal > 0) && (
              <div className="sobre-sugerencias">
                {sugeridoMensual > 0 && (
                  <button
                    type="button"
                    className="sobre-sugerencia"
                    onClick={() => setImporte(String(sugeridoMensual))}
                  >
                    {t('sobres_suggest_monthly', { monto: formatCurrency(sugeridoMensual, sobre.moneda) })}
                  </button>
                )}
                {sugeridoSemanal > 0 && (
                  <button
                    type="button"
                    className="sobre-sugerencia"
                    onClick={() => setImporte(String(sugeridoSemanal))}
                  >
                    {t('sobres_suggest_weekly', { monto: formatCurrency(sugeridoSemanal, sobre.moneda) })}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="sobre-grupo">
            <label>{t('sobres_wallet_origin')}</label>
            {disponibles.length === 0 ? (
              <p className="sobre-aviso">{t('sobres_no_wallets_currency', { moneda: sobre.moneda })}</p>
            ) : (
              <WalletDropdownSelect
                wallets={wallets}
                selectedWalletId={billeteraId}
                onSelectWallet={setBilleteraId}
                placeholder={t('sobres_wallet_origin')}
                formatMonto={(val, cur) => formatCurrency(val, cur)}
              />
            )}
          </div>

          <div className="sobre-grupo">
            <label>{t('sobres_modality')}</label>
            <div className="sobre-modalidades">
              <button
                type="button"
                className={`sobre-modalidad ${modalidad === 'virtual' ? 'sobre-modalidad--activa' : ''}`}
                onClick={() => {
                  setModalidad('virtual')
                  setGenera(false)
                }}
              >
                {t('sobres_modality_virtual')}
              </button>
              <button
                type="button"
                className={`sobre-modalidad ${modalidad === 'real' ? 'sobre-modalidad--activa' : ''}`}
                onClick={() => setModalidad('real')}
              >
                {t('sobres_modality_real')}
              </button>
            </div>
          </div>

          {modalidad === 'real' && (
            <div className="sobre-switch">
              <span>{t('sobres_generates_yield')}</span>
              <ToggleSwitch checked={genera} onChange={setGenera} size="sm" />
            </div>
          )}

          {superaMeta && (
            <p className="sobre-aviso">
              {t('sobres_exceeds_goal_warning', {
                meta: formatCurrency(sobre.monto_meta as number, sobre.moneda),
              })}
            </p>
          )}

          {error && <div className="sobre-error">{error}</div>}
        </div>

        <footer className="sobre-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>
            {t('btn_cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={guardando || disponibles.length === 0}>
            {guardando ? <span className="sobre-spinner" /> : t('sobres_provision')}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default SobreAporteModal
