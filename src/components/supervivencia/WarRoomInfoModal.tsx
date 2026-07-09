import { useEffect } from 'react'
import { t } from '@/locales/i18n'

interface WarRoomInfoModalProps {
  onClose: () => void
}

export function WarRoomInfoModal({ onClose }: WarRoomInfoModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="war-info-overlay" onClick={onClose}>
      <div className="war-info-modal" onClick={(e) => e.stopPropagation()}>
        <button className="war-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="font-display">{t('war_room_info_modal_title')}</h2>
        <p>{t('war_room_info_modal_body')}</p>
        <ul>
          <li>⏱️ {t('war_escudo_titulo').replace(/^[^\w]+/, '')}</li>
          <li>☕ {t('war_safe_titulo').replace(/^[^\w]+/, '')}</li>
          <li>📉 {t('war_licuadora_titulo').replace(/^[^\w]+/, '')}</li>
          <li>🌡️ {t('war_radar_titulo').replace(/^[^\w]+/, '')}</li>
          <li>✂️ {t('war_podora_titulo').replace(/^[^\w]+/, '')}</li>
        </ul>
      </div>
    </div>
  )
}
