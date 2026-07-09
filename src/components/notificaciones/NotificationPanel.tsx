import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { t } from '@/locales/i18n'
import { getPersistentPrefs } from '@/lib/notificationPreferences'
import { NotificationItem } from './NotificationItem'
import './NotificationPanel.css'

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
  onCaptureRapida?: () => void
}

interface Notif {
  notificacion_id: number
  tipo_notificacion: string
  titulo: string
  mensaje: string
  leida: boolean
  enviado_at: string
}

export function NotificationPanel({ isOpen, onClose, onCaptureRapida }: NotificationPanelProps) {
  const { showToast } = useToast()
  const [items, setItems] = useState<Notif[]>([])
  const [loading, setLoading] = useState(false)
  const persistentPrefs = getPersistentPrefs()

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('fn_obtener_notificaciones_no_leidas', { p_limit: 50 })
      if (error) throw error
      setItems(Array.isArray(data) ? (data as Notif[]) : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) load()
  }, [isOpen])

  if (!isOpen) return null

  const markOne = async (id: number) => {
    try {
      await supabase.rpc('fn_marcar_notificacion_leida', { p_notificacion_id: id })
      setItems((prev) => prev.filter((i) => i.notificacion_id !== id))
    } catch {
      showToast(t('error_generic'), 'error')
    }
  }

  const markAll = async () => {
    try {
      await supabase.rpc('fn_marcar_todas_leidas')
      setItems([])
    } catch {
      showToast(t('error_generic'), 'error')
    }
  }

  return (
    <>
      <div className="notif-panel-backdrop" onClick={onClose} role="presentation" />
      <aside className="notif-panel" role="dialog" aria-label={t('notif_title')}>
        <header className="notif-panel-header">
          <h2>{t('notif_title')}</h2>
          <button type="button" className="notif-panel-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        {persistentPrefs.enabled && (
          <article className="notif-persistent-card">
            <h3>{t('notif_captura_rapida_titulo')}</h3>
            <p>{t('notif_captura_rapida_desc')}</p>
            <button type="button" className="notif-persistent-button" onClick={onCaptureRapida}>
              {t('notif_captura_rapida_action')}
            </button>
          </article>
        )}

        <div className="notif-panel-list">
          {loading ? (
            <p className="notif-panel-empty">{t('loading')}</p>
          ) : items.length === 0 ? (
            <p className="notif-panel-empty">{t('bell_empty')}</p>
          ) : (
            items.map((it) => (
              <NotificationItem key={it.notificacion_id} item={it} onClick={() => markOne(it.notificacion_id)} />
            ))
          )}
        </div>

        <footer className="notif-panel-footer">
          <button type="button" onClick={markAll} disabled={items.length === 0}>
            {t('bell_mark_all')}
          </button>
        </footer>
      </aside>
    </>
  )
}

export default NotificationPanel
