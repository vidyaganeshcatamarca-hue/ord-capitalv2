import { useState } from 'react'
import { useNotificationCount } from '@/hooks/useNotificationCount'
import { NotificationPanel } from './NotificationPanel'
import { t } from '@/locales/i18n'
import { getPersistentPrefs } from '@/lib/notificationPreferences'
import './NotificationBell.css'

export function NotificationBell() {
  const { count, refresh } = useNotificationCount()
  const [open, setOpen] = useState(false)

  const handleCapture = () => {
    setOpen(false)
    const prefs = getPersistentPrefs()
    window.dispatchEvent(
      new CustomEvent('open-registro-modal', { detail: { defaultTipo: prefs.defaultTipo } }),
    )
    void refresh()
  }

  return (
    <>
      <button
        type="button"
        className="notif-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('notif_title')}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        {count > 0 && <span className="notif-bell-badge" aria-label={`${count}`}>{count > 99 ? '99+' : count}</span>}
      </button>
      <NotificationPanel isOpen={open} onClose={() => setOpen(false)} onCaptureRapida={handleCapture} />
    </>
  )
}

export default NotificationBell
