import { useState } from 'react'
import { t } from '@/locales/i18n'
import { useToast } from '@/contexts/ToastContext'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { clearAppCache } from '@/lib/appCache'
import { clearAllOcrImages } from '@/ocr/imageStore'

export function MantenimientoAppCard() {
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const { showToast } = useToast()

  const handleClick = () => setShowConfirm(true)

  const handleConfirm = async () => {
    setShowConfirm(false)
    setLoading(true)
    try {
      // Definitive OCR PRD §95: "Borrar caché" must remove the local OCR ticket
      // copies and their manifests. It is done explicitly (not only through the
      // IndexedDB sweep) because browsers without `indexedDB.databases()` would
      // otherwise leave the OCR blobs behind. Pending job ids and the pending
      // memory queue are preserved by `clearAppCache` itself.
      try {
        await clearAllOcrImages()
      } catch {
        // A storage failure must not abort the rest of the maintenance.
      }
      const result = await clearAppCache()
      if (result.ok) {
        showToast(t('config_maintenance_success'), 'success')
        // El reload lo dispara clearAppCache() para forzar re-registro del SW.
      } else {
        showToast(t('config_maintenance_error'), 'error')
      }
    } catch {
      showToast(t('config_maintenance_error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="config-hub-card"
        onClick={handleClick}
        disabled={loading}
        aria-label={t('config_maintenance_action')}
      >
        <span className="config-hub-card-icon" aria-hidden="true">🧹</span>
        <div className="config-hub-card-content">
          <h3>{t('config_maintenance_title')}</h3>
          <p>{t('config_maintenance_desc')}</p>
        </div>
        <span className="config-hub-card-chevron" aria-hidden="true">›</span>
      </button>
      <ConfirmModal
        isOpen={showConfirm}
        title={t('config_maintenance_confirm_title')}
        message={t('config_maintenance_confirm_msg')}
        confirmText={t('config_maintenance_confirm_btn')}
        cancelText={t('reconcile_btn_cancel')}
        type="danger"
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  )
}
