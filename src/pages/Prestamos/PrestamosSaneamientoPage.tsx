import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'
import { PlanAtaquePrestamos } from '@/components/prestamos/PlanAtaquePrestamos'
import '@/components/prestamos/prestamos.css'

/**
 * Saneamiento as a section of Loans (S1): the attack plan, the strategy selector,
 * the Vinculos questionnaire on demand and the simulation. It is NOT a standalone
 * main screen and it has no quarantine inbox.
 */
export function PrestamosSaneamientoPage() {
  const navigate = useNavigate()

  return (
    <div className="page prestamos-page fade-in">
      <header className="prestamos-header">
        <div>
          <span className="prestamos-kicker">{t('prestamos_kicker')}</span>
          <h1 className="font-display">{t('prestamos_saneamiento_titulo')}</h1>
        </div>
      </header>

      <div className="prestamos-toolbar">
        <button type="button" className="prestamos-back" onClick={() => navigate('/prestamos')}>
          {t('prestamos_volver_prestamos')}
        </button>
      </div>

      <PlanAtaquePrestamos />
    </div>
  )
}

export default PrestamosSaneamientoPage
