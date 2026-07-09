import { BackupExportCard } from '@/components/privacidad/BackupExportCard'
import { BackupViewer } from '@/components/privacidad/BackupViewer'
import { DeleteAccountCard } from '@/components/privacidad/DeleteAccountCard'
import { t } from '@/locales/i18n'
import './PrivacidadPage.css'

export function PrivacidadPage() {
  return (
    <main className="page privacidad-page" aria-labelledby="privacidad-title">
      <header className="privacidad-page-header">
        <h1 id="privacidad-title">{t('privacidad_title')}</h1>
        <p>{t('privacidad_subtitle')}</p>
      </header>
      <div className="privacidad-page-grid">
        <BackupExportCard />
        <BackupViewer />
        <DeleteAccountCard />
      </div>
    </main>
  )
}

export default PrivacidadPage
