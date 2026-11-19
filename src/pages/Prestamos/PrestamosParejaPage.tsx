import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'
import '@/components/prestamos/prestamos.css'

/**
 * Couple section (S21). The route exists (T20) but the section is read-only and
 * still has no read contract: T21 needs the shared-spending balance and the
 * explicit loans between members as two SEPARATE groups. Until that RPC exists
 * this screen says so instead of inventing a number.
 */
export function PrestamosParejaPage() {
  const navigate = useNavigate()

  return (
    <div className="page prestamos-page fade-in">
      <header className="prestamos-header">
        <div>
          <span className="prestamos-kicker">{t('prestamos_kicker')}</span>
          <h1 className="font-display">{t('prestamos_pareja_titulo')}</h1>
        </div>
      </header>

      <div className="prestamos-empty">
        <span className="prestamos-empty-icon">👥</span>
        <p>{t('prestamos_pareja_pendiente')}</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/prestamos')}>
          {t('prestamos_pareja_pendiente_cta')}
        </button>
      </div>
    </div>
  )
}

export default PrestamosParejaPage
