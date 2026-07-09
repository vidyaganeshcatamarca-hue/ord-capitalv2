import { t } from '@/locales/i18n'

interface ImageModalProps {
  url: string
  onClose: () => void
  isAudio?: boolean
}

export function ImageModal({ url, onClose, isAudio }: ImageModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-media" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isAudio ? t('saneamiento_audio_titulo') : t('saneamiento_foto_titulo')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          {isAudio ? (
            <audio controls src={url} style={{ width: '100%' }}>
              {t('saneamiento_audio_no_soportado')}
            </audio>
          ) : (
            <img
              src={url}
              alt={t('saneamiento_foto_alt')}
              style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '12px' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
