import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { getPersistentPrefs, setPersistentPrefs } from '@/lib/notificationPreferences'
import { setupPersistentCaptureNotification, cancelPersistentCaptureNotification } from '@/lib/persistentNotification'
import { useReminders } from '@/hooks/useReminders'
import { RecordatorioList } from '@/components/recordatorios/RecordatorioList'
import './NotificacionesPage.css'
import './ConfigSectionPage.css'

interface NotifPrefs {
  push_enabled: boolean
  push_time: string
  cat_vencimientos: boolean
  cat_recurrentes: boolean
  cat_liquidez: boolean
  cat_presupuesto: boolean
  cat_cuarentena: boolean
  cat_deuda: boolean
  cat_ahorro: boolean
  cat_inversiones: boolean
  cat_hogar: boolean
  cat_score: boolean
  cat_resumen_semanal: boolean
  cat_resumen_mensual: boolean
  balance_desequilibrado_threshold: number
}

const DEFAULTS: NotifPrefs = {
  push_enabled: true,
  push_time: '09:00:00',
  cat_vencimientos: true,
  cat_recurrentes: true,
  cat_liquidez: true,
  cat_presupuesto: true,
  cat_cuarentena: true,
  cat_deuda: true,
  cat_ahorro: true,
  cat_inversiones: true,
  cat_hogar: true,
  cat_score: true,
  cat_resumen_semanal: true,
  cat_resumen_mensual: true,
  balance_desequilibrado_threshold: 100000,
}

export function NotificacionesPage() {
  const { showToast } = useToast()
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULTS)
  const [persistent, setPersistent] = useState(() => getPersistentPrefs())
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const platform = Capacitor.getPlatform()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('fn_obtener_preferencias_notificaciones')
        if (error || !data) return
        const row = Array.isArray(data) ? data[0] : data
        if (!cancelled && row) setPrefs({ ...DEFAULTS, ...(row as Partial<NotifPrefs>) })
      } catch {
        // Mantener defaults.
      }
    })()
    return () => { cancelled = true }
  }, [])

  const updateBool = async (key: keyof NotifPrefs, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }))
    setSavingKey(String(key))
    try {
      const args: Record<string, unknown> = {}
      args[`p_${key}`] = value
      const { error } = await supabase.rpc('fn_actualizar_preferencia_notificacion', args)
      if (error) throw error
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const updateTime = async (value: string) => {
    setPrefs((p) => ({ ...p, push_time: value }))
    try {
      const { error } = await supabase.rpc('fn_actualizar_preferencia_notificacion', { p_push_time: value })
      if (error) throw error
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

  const updateThreshold = async (value: number) => {
    setPrefs((p) => ({ ...p, balance_desequilibrado_threshold: value }))
    try {
      const { error } = await supabase.rpc('fn_actualizar_preferencia_notificacion', { p_balance_desequilibrado_threshold: value })
      if (error) throw error
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

  const remindersApi = useReminders()

  const togglePersistent = async (enabled: boolean) => {
    const next = { ...persistent, enabled }
    setPersistent(next)
    setPersistentPrefs(next)
    if (enabled) {
      await setupPersistentCaptureNotification(next.defaultTipo)
    } else {
      await cancelPersistentCaptureNotification()
    }
    showToast(t('notif_persistent_saved'), 'success')
  }

  const changeDefaultTipo = async (defaultTipo: 'expense' | 'income') => {
    const next = { ...persistent, defaultTipo }
    setPersistent(next)
    setPersistentPrefs(next)
    if (persistent.enabled) {
      await setupPersistentCaptureNotification(defaultTipo)
    }
  }

  const cats: Array<[keyof NotifPrefs, string]> = [
    ['cat_vencimientos', t('notif_cat_vencimientos')],
    ['cat_recurrentes', t('notif_cat_recurrentes')],
    ['cat_liquidez', t('notif_cat_liquidez')],
    ['cat_presupuesto', t('notif_cat_presupuesto')],
    ['cat_cuarentena', t('notif_cat_cuarentena')],
    ['cat_deuda', t('notif_cat_deuda')],
    ['cat_ahorro', t('notif_cat_ahorro')],
    ['cat_inversiones', t('notif_cat_inversiones')],
    ['cat_hogar', t('notif_cat_hogar')],
    ['cat_score', t('notif_cat_score')],
    ['cat_resumen_semanal', t('notif_cat_resumen_semanal')],
    ['cat_resumen_mensual', t('notif_cat_resumen_mensual')],
  ]

  return (
    <main className="page notif-page" aria-labelledby="notif-page-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="notif-page-title">{t('notif_title')}</h1>
      </header>

      <section className="notif-section">
        <h2>Generales</h2>
        <label className="notif-row">
          <span>{t('notif_push_enabled')}</span>
          <input
            type="checkbox"
            checked={prefs.push_enabled}
            onChange={(e) => updateBool('push_enabled', e.target.checked)}
            disabled={savingKey === 'push_enabled'}
          />
        </label>
        <label className="notif-row">
          <span>{t('notif_push_time')}</span>
          <input
            type="time"
            value={prefs.push_time?.slice(0, 5) ?? '09:00'}
            onChange={(e) => updateTime(e.target.value + ':00')}
            disabled={!prefs.push_enabled}
          />
        </label>
      </section>

      <section className="notif-section">
        <h2>Captura rápida persistente</h2>
        <label className="notif-row">
          <span>{t('notif_persistent_enabled')}</span>
          <input
            type="checkbox"
            checked={persistent.enabled}
            onChange={(e) => togglePersistent(e.target.checked)}
          />
        </label>
        <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: 0 }}>
          {platform === 'ios' ? t('notif_ios_unsupported') : t('notif_android_persistent_desc')}
        </p>
        {persistent.enabled && (
          <label className="notif-row">
            <span>{t('notif_persistent_default_type')}</span>
            <select
              value={persistent.defaultTipo}
              onChange={(e) => changeDefaultTipo(e.target.value === 'income' ? 'income' : 'expense')}
            >
              <option value="expense">{t('notif_persistent_default_expense')}</option>
              <option value="income">{t('notif_persistent_default_income')}</option>
            </select>
          </label>
        )}
        <p style={{ color: '#cbd5e1', fontSize: '0.82rem', margin: 0 }}>
          {t('notif_persistent_desc')}
        </p>
      </section>

      <section className="notif-section">
        <h2>Categorías</h2>
        {cats.map(([key, label]) => (
          <label key={key} className="notif-row">
            <span>{label}</span>
            <input
              type="checkbox"
              checked={Boolean((prefs as unknown as Record<string, unknown>)[key])}
              onChange={(e) => updateBool(key, e.target.checked)}
              disabled={!prefs.push_enabled || savingKey === String(key)}
            />
          </label>
        ))}
        <label className="notif-row">
          <span>{t('notif_balance_threshold')}</span>
          <input
            type="number"
            min="0"
            value={prefs.balance_desequilibrado_threshold}
            onChange={(e) => setPrefs((p) => ({ ...p, balance_desequilibrado_threshold: Number(e.target.value) }))}
            onBlur={(e) => updateThreshold(Number(e.target.value))}
            disabled={!prefs.push_enabled}
          />
        </label>
      </section>

      <section className="notif-section">
        <RecordatorioList
          reminders={remindersApi.reminders}
          onCreate={(input) => remindersApi.create(input)}
          onUpdate={(id, input) => remindersApi.update(id, input)}
          onDelete={(id) => remindersApi.remove(id)}
          onToggle={(id, activo) => remindersApi.toggle(id, activo)}
        />
      </section>
    </main>
  )
}

export default NotificacionesPage
