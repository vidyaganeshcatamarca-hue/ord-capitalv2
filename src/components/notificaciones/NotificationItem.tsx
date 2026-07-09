import { t } from '@/locales/i18n'
import { resolveNotifKeys } from '@/lib/notificationKeys'
import './NotificationItem.css'

interface NotificationItemProps {
  item: {
    notificacion_id: number
    titulo: string
    mensaje: string
    tipo_notificacion?: string
    metadata?: Record<string, unknown> | null
    enviado_at: string
  }
  onClick?: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return t('bell_just_now')
  if (diff < 3600) return t('bell_minutes_ago', { minutes: Math.floor(diff / 60) })
  if (diff < 86400) return t('bell_hours_ago', { hours: Math.floor(diff / 3600) })
  return t('bell_days_ago', { days: Math.floor(diff / 86400) })
}

function pickTitulo(item: NotificationItemProps['item']): string {
  const keys = resolveNotifKeys(item.tipo_notificacion ?? '', item.metadata)
  if (keys) return t(keys.tituloKey)
  // Si el item viene del push nativo del cliente o no tiene tipo mapeado,
  // caemos al titulo crudo que viene del backend (data del usuario).
  return item.titulo
}

function pickMensaje(item: NotificationItemProps['item']): string {
  const keys = resolveNotifKeys(item.tipo_notificacion ?? '', item.metadata)
  if (keys) return t(keys.mensajeKey)
  return item.mensaje
}

export function NotificationItem({ item, onClick }: NotificationItemProps) {
  return (
    <button type="button" className="notif-item" onClick={onClick}>
      <span className="notif-item-icon" aria-hidden="true">🔔</span>
      <span className="notif-item-content">
        <h4>{pickTitulo(item)}</h4>
        <p>{pickMensaje(item)}</p>
        <span className="notif-item-time">{formatTime(item.enviado_at)}</span>
      </span>
    </button>
  )
}

export default NotificationItem
