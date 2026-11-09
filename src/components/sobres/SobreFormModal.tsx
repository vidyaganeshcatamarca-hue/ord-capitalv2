import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/lib/format'
import { parseError, t } from '@/locales/i18n'
import { useNumberFormat } from '@/hooks/useNumberFormat'
import { WalletDropdownSelect, type WalletOptionItem } from '@/components/WalletDropdownSelect'
import type { BilleteraOperativa, ModalidadReserva, Sobre } from './types'
import './sobresModal.css'
import './SobreFormModal.css'

interface SobreFormModalProps {
  isOpen: boolean
  sobre: Sobre | null
  billeteras: BilleteraOperativa[]
  onClose: () => void
  onSuccess: () => void
}

const MONEDAS_BASE = ['ARS', 'USD']

export function SobreFormModal({ isOpen, sobre, billeteras, onClose, onSuccess }: SobreFormModalProps) {
  const { showToast } = useToast()
  const { localCurrency } = useNumberFormat()

  const [nombre, setNombre] = useState('')
  const [moneda, setMoneda] = useState('')
  const [meta, setMeta] = useState('')
  const [fecha, setFecha] = useState('')
  const [aporteImporte, setAporteImporte] = useState('')
  const [aporteBilleteraId, setAporteBilleteraId] = useState<number | null>(null)
  const [aporteModalidad, setAporteModalidad] = useState<ModalidadReserva>('virtual')
  const [aporteGenera, setAporteGenera] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const esEdicion = sobre !== null

  // Monedas ofrecidas: las que el usuario ya tiene en billeteras, para que
  // siempre exista una billetera con la que poder aportar. Un sobre no convierte.
  const monedas = useMemo(() => {
    const set = new Set<string>(MONEDAS_BASE)
    for (const b of billeteras) if (b.moneda) set.add(b.moneda.toUpperCase())
    const orden = [localCurrency, 'ARS', 'USD'].filter(Boolean) as string[]
    const resto = Array.from(set).filter((m) => !orden.includes(m)).sort()
    return Array.from(new Set([...orden, ...resto]))
  }, [billeteras, localCurrency])

  useEffect(() => {
    if (!isOpen) return
    setNombre(sobre?.nombre ?? '')
    setMoneda(sobre?.moneda ?? localCurrency ?? 'ARS')
    setMeta(sobre?.monto_meta ? String(sobre.monto_meta) : '')
    setFecha(sobre?.fecha_objetivo ?? '')
    setAporteImporte('')
    setAporteBilleteraId(null)
    setAporteModalidad('virtual')
    setAporteGenera(false)
    setGuardando(false)
  }, [isOpen, sobre, localCurrency])

  const billeterasDeMoneda = useMemo(
    () => billeteras.filter((b) => b.moneda?.toUpperCase() === moneda?.toUpperCase()),
    [billeteras, moneda],
  )

  const walletsParaSelector: WalletOptionItem[] = useMemo(
    () =>
      billeterasDeMoneda.map((b) => ({
        billetera_id: b.billetera_id,
        nombre: b.nombre,
        moneda: b.moneda,
        saldo_actual: b.saldo_actual,
        icono: b.icono ?? null,
        es_fondo_prevision: b.es_fondo_prevision,
      })),
    [billeterasDeMoneda],
  )

  if (!isOpen) return null

  const limpiarAporteSiCambiaMoneda = (nueva: string) => {
    setMoneda(nueva)
    setAporteBilleteraId(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!nombre.trim()) {
      showToast(t('error_sobre_name_required'), 'error')
      haptics.error()
      return
    }
    const metaNum = meta.trim() === '' ? null : Number(meta)
    if (metaNum !== null && (!Number.isFinite(metaNum) || metaNum <= 0)) {
      showToast(t('error_sobre_meta_invalid'), 'error')
      haptics.error()
      return
    }

    const quiereAporte = !esEdicion && aporteImporte.trim() !== ''
    const aporteNum = quiereAporte ? Number(aporteImporte) : null
    if (quiereAporte) {
      if (!Number.isFinite(aporteNum) || (aporteNum as number) <= 0) {
        showToast(t('error_sobre_amount_invalid'), 'error')
        haptics.error()
        return
      }
      if (!aporteBilleteraId) {
        showToast(t('sobres_wallet_origin'), 'error')
        haptics.error()
        return
      }
    }

    setGuardando(true)
    try {
      if (esEdicion && sobre) {
        const { error } = await supabase.rpc('fn_sobre_editar', {
          p_sobre_id: sobre.sobre_id,
          p_nombre: nombre.trim(),
          p_monto_meta: metaNum,
          p_fecha_objetivo: fecha || null,
          p_quitar_meta: metaNum === null,
          p_quitar_fecha: !fecha,
        })
        if (error) throw error
        showToast(t('sobres_updated'), 'success')
      } else {
        const { error } = await supabase.rpc('fn_sobre_crear', {
          p_nombre: nombre.trim(),
          p_moneda: moneda,
          p_monto_meta: metaNum,
          p_fecha_objetivo: fecha || null,
          p_aporte_billetera_id: quiereAporte ? aporteBilleteraId : null,
          p_aporte_importe: quiereAporte ? aporteNum : null,
          p_aporte_modalidad: quiereAporte ? aporteModalidad : null,
          p_aporte_genera_rendimiento: quiereAporte ? aporteGenera : false,
        })
        if (error) throw error
        showToast(t('sobres_created'), 'success')
      }
      haptics.success()
      onSuccess()
      onClose()
    } catch (err) {
      showToast(parseError(err), 'error')
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
            <h2 className="font-display">{t(esEdicion ? 'sobres_edit_title' : 'sobres_create_title')}</h2>
            <p className="sobre-modal-sub">{t('sobres_target_hint')}</p>
          </div>
          <button type="button" className="sobre-modal-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        <div className="sobre-modal-body">
          <div className="sobre-grupo">
            <label htmlFor="sobre-nombre">{t('sobres_name')}</label>
            <input
              id="sobre-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={t('sobres_name_placeholder')}
              autoFocus
            />
          </div>

          <div className="sobre-grupo">
            <label htmlFor="sobre-moneda">{t('sobres_currency')}</label>
            {esEdicion ? (
              <div className="sobre-moneda-fija">{moneda}</div>
            ) : (
              <select id="sobre-moneda" value={moneda} onChange={(e) => limpiarAporteSiCambiaMoneda(e.target.value)}>
                {monedas.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
          </div>

          <div className="sobre-grupo">
            <label htmlFor="sobre-meta">{t('sobres_target_amount')}</label>
            <input
              id="sobre-meta"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="sobre-grupo">
            <label htmlFor="sobre-fecha">{t('sobres_target_date')}</label>
            <input
              id="sobre-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>

          {!esEdicion && (
            <fieldset className="sobre-aporte-inicial">
              <legend>{t('sobres_initial_aporte')}</legend>

              <div className="sobre-grupo">
                <label htmlFor="sobre-aporte-importe">{t('sobres_amount')}</label>
                <input
                  id="sobre-aporte-importe"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={aporteImporte}
                  onChange={(e) => setAporteImporte(e.target.value)}
                  placeholder="0"
                />
              </div>

              {aporteImporte.trim() !== '' && (
                <>
                  <div className="sobre-grupo">
                    <label>{t('sobres_wallet_origin')}</label>
                    {billeterasDeMoneda.length === 0 ? (
                      <p className="sobre-aviso">{t('sobres_no_wallets_currency', { moneda })}</p>
                    ) : (
                      <WalletDropdownSelect
                        wallets={walletsParaSelector}
                        selectedWalletId={aporteBilleteraId}
                        onSelectWallet={setAporteBilleteraId}
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
                        className={`sobre-modalidad ${aporteModalidad === 'virtual' ? 'sobre-modalidad--activa' : ''}`}
                        onClick={() => {
                          setAporteModalidad('virtual')
                          setAporteGenera(false)
                        }}
                      >
                        {t('sobres_modality_virtual')}
                      </button>
                      <button
                        type="button"
                        className={`sobre-modalidad ${aporteModalidad === 'real' ? 'sobre-modalidad--activa' : ''}`}
                        onClick={() => setAporteModalidad('real')}
                      >
                        {t('sobres_modality_real')}
                      </button>
                    </div>
                  </div>

                  {aporteModalidad === 'real' && (
                    <label className="sobre-check">
                      <input
                        type="checkbox"
                        checked={aporteGenera}
                        onChange={(e) => setAporteGenera(e.target.checked)}
                      />
                      <span>{t('sobres_generates_yield')}</span>
                    </label>
                  )}
                </>
              )}
            </fieldset>
          )}
        </div>

        <footer className="sobre-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>
            {t('btn_cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>
            {guardando ? <span className="sobre-spinner" /> : t(esEdicion ? 'sobres_save' : 'sobres_create')}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default SobreFormModal
