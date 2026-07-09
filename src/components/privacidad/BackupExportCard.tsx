import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { encryptJSON } from '@/lib/crypto'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { t } from '@/locales/i18n'
import './BackupExportCard.css'

export function BackupExportCard() {
  const { showToast } = useToast()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDownload = async () => {
    if (password.length < 8) {
      showToast(t('privacidad_password_too_short'), 'error')
      haptics.error()
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('fn_exportar_backup_maestro')
      if (error) throw error
      const cipher = await encryptJSON(data, password)
      const blob = new Blob([cipher], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `ord-backup-${stamp}.backup`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast(t('privacidad_export_success'), 'success')
      haptics.success()
    } catch (err) {
      showToast(t('error_generic'), 'error')
      haptics.error()
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="privacidad-export" aria-labelledby="privacidad-export-title">
      <h2 id="privacidad-export-title">{t('privacidad_section_export')}</h2>
      <p>{t('privacidad_export_help')}</p>
      <label>
        <span>{t('privacidad_export_password_label')}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <small style={{ color: '#94A3B8', fontSize: '0.78rem' }}>
        {t('privacidad_export_password_help')}
      </small>
      <button
        type="button"
        className="privacidad-export-button"
        onClick={handleDownload}
        disabled={loading}
      >
        {t('privacidad_export_button')}
      </button>
    </section>
  )
}

export default BackupExportCard
