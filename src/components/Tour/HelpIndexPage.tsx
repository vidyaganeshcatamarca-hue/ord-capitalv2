import { t } from '@/locales/i18n';
import { useTourProgress } from '@/hooks/useTourProgress';
import { useTour } from '@/hooks/useTour';
import type { TourScreenId } from '@/tours/ids';
import { TOUR_SCREEN_PATHS } from '@/tours/paths';
import { useNavigate, useLocation } from 'react-router-dom';
import './HelpIndexPage.css';

const TOUR_SCREENS: { screenId: TourScreenId; titleKey: string; descKey: string }[] = [
  { screenId: 'home', titleKey: 'tour.home.title', descKey: 'tour.home.description' },
  { screenId: 'cuentas', titleKey: 'tour.cuentas.title', descKey: 'tour.cuentas.description' },
  { screenId: 'tarjetas', titleKey: 'tour.tarjetas.title', descKey: 'tour.tarjetas.description' },
  { screenId: 'presupuestos', titleKey: 'tour.presupuestos.title', descKey: 'tour.presupuestos.description' },
  { screenId: 'ajustes', titleKey: 'tour.ajustes.title', descKey: 'tour.ajustes.description' },
];

export function HelpIndexPage() {
  const { isSeen } = useTourProgress();

  return (
    <div className="help-index-page">
      <h1 className="help-index-title">{t('tour.ayuda.title')}</h1>
      <p className="help-index-subtitle">{t('tour.ayuda.subtitle')}</p>
      <div className="help-index-list">
        {TOUR_SCREENS.map(({ screenId, titleKey, descKey }) => (
          <HelpTourCard
            key={screenId}
            screenId={screenId}
            titleKey={titleKey}
            descKey={descKey}
            isSeen={isSeen(screenId)}
          />
        ))}
      </div>
    </div>
  );
}

function HelpTourCard({
  screenId,
  titleKey,
  descKey,
  isSeen,
}: {
  screenId: TourScreenId;
  titleKey: string;
  descKey: string;
  isSeen: boolean;
}) {
  const { startTour } = useTour(screenId);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const tourPath = TOUR_SCREEN_PATHS[screenId];
  const isOnTargetScreen = pathname === tourPath;

  const handleStartTour = async () => {
    if (isOnTargetScreen) {
      await startTour();
    } else {
      navigate(tourPath);
      setTimeout(() => {
        void startTour();
      }, 350);
    }
  };

  return (
    <div className="help-tour-card">
      <div className="help-tour-card-info">
        <h3 className="help-tour-card-title">{t(titleKey)}</h3>
        <p className="help-tour-card-desc">{t(descKey)}</p>
      </div>
      <div className="help-tour-card-actions">
        {isSeen && <span className="help-tour-card-badge">{t('tour.ayuda.seen')}</span>}
        <button
          className="help-tour-card-btn"
          onClick={() => void handleStartTour()}
        >
          {t('tour.ayuda.view_tour')}
        </button>
      </div>
    </div>
  );
}
