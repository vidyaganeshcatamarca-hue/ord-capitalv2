import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/lib/format'
import { parseError, t } from '@/locales/i18n'
import type { BilleteraOperativa, Sobre } from './types'
import './RespaldoFisicoPanel.css'

interface RespaldoFisicoPanelProps {
  sobres: Sobre[]
  billeteras: BilleteraOperativa[]
  onSuccess: () => void
}

interface CuentaMadre {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
}

export function RespaldoFisicoPanel({ sobres, billeteras, onSuccess }: RespaldoFisicoPanelProps) {
  const { showToast } = useToast()
  const [motherName, setMotherName] = useState('')
  const [selectedSobreId, setSelectedSobreId] = useState<number | null>(sobres[0]?.fondo_id ?? null)
  const [motherAccount, setMotherAccount] = useState<CuentaMadre | null>(null)
  const [yieldAmount, setYieldAmount] = useState('')
  const [saving, setSaving] = useState(false)

  const loadMotherAccount = async () => {
    const { data, error } = await supabase.rpc('fn_obtener_cuenta_madre_ahorro')
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : null
    setMotherAccount(row ? {
      billetera_id: Number(row.billetera_id),
      nombre: String(row.nombre ?? ''),
      moneda: String(row.moneda ?? 'ARS'),
      saldo_actual: Number(row.saldo_actual ?? 0),
    } : null)
  }

  useEffect(() => {
    loadMotherAccount().catch((err) => showToast(parseError(err), 'error'))
  }, [])

  const createMother = async () => {
    if (!motherName.trim()) {
      showToast(t('field_required'), 'error')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('fn_crear_cuenta_madre_ahorro', {
        p_nombre: motherName.trim(),
        p_moneda: 'ARS',
        p_saldo_apertura: 0,
        p_icono: 'M',
      })
      if (error) throw error
      showToast(t('sobres_backup_created'), 'success')
      haptics.success()
      await loadMotherAccount()
      onSuccess()
    } catch (err) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setSaving(false)
    }
  }

  const linkBackup = async () => {
    if (!selectedSobreId || !motherAccount) {
      showToast(t('field_required'), 'error')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('fn_vincular_sobre_a_respaldo', {
        p_sobre_id: selectedSobreId,
        p_billetera_respaldo_id: motherAccount.billetera_id,
      })
      if (error) throw error
      showToast(t('sobres_backup_linked'), 'success')
      haptics.success()
      onSuccess()
    } catch (err) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setSaving(false)
    }
  }

  const distributeYield = async () => {
    if (!motherAccount || Number(yieldAmount) <= 0) {
      showToast(t('field_required'), 'error')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('fn_distribuir_rendimientos_proporcional', {
        p_cuenta_madre_id: motherAccount.billetera_id,
        p_monto_rendimiento: Number(yieldAmount),
      })
      if (error) throw error
      showToast(t('sobres_yield_distributed'), 'success')
      haptics.success()
      onSuccess()
    } catch (err) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="respaldo-panel" aria-labelledby="respaldo-title">
      <header>
        <h2 id="respaldo-title">{t('sobres_backup_title')}</h2>
        <p>{t('sobres_backup_subtitle')}</p>
      </header>
      <div className="respaldo-grid">
        <label>
          <span>{t('sobres_mother_name')}</span>
          <input value={motherName} onChange={(event) => setMotherName(event.target.value)} />
          <button type="button" disabled={saving} onClick={createMother}>{t('sobres_create_mother')}</button>
        </label>
        <article className="respaldo-current">
          <span>{t('sobres_current_mother')}</span>
          <strong>{motherAccount ? motherAccount.nombre : t('sobres_no_mother')}</strong>
          {motherAccount && <small>{formatCurrency(motherAccount.saldo_actual, motherAccount.moneda)}</small>}
        </article>
        <label>
          <span>{t('sobres_select_envelope')}</span>
          <select value={selectedSobreId ?? ''} onChange={(event) => setSelectedSobreId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">{t('sobres_select_envelope')}</option>
            {sobres.map((sobre) => <option key={sobre.fondo_id} value={sobre.fondo_id}>{sobre.nombre}</option>)}
          </select>
        </label>
        <label>
          <span>{t('sobres_backup_wallet')}</span>
          <button type="button" disabled={saving || !motherAccount} onClick={linkBackup}>{t('sobres_link_backup')}</button>
        </label>
        <label>
          <span>{t('sobres_yield_amount')}</span>
          <input type="number" min="1" inputMode="decimal" value={yieldAmount} onChange={(event) => setYieldAmount(event.target.value)} />
          <button type="button" disabled={saving} onClick={distributeYield}>{t('sobres_distribute_yield')}</button>
        </label>
      </div>
    </section>
  )
}

export default RespaldoFisicoPanel
