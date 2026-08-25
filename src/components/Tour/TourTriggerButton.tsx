import { HelpCircle } from 'lucide-react';
import { t } from '@/locales/i18n';
import { useTour } from '@/hooks/useTour';
import type { TourScreenId } from '@/tours/ids';
import './TourTriggerButton.css';

interface TourTriggerButtonProps {
  screenId: TourScreenId;
  className?: string;
}

export function TourTriggerButton({ screenId, className }: TourTriggerButtonProps) {
  const { hasStartedTour, startTour } = useTour(screenId);

  // Hide the trigger once the tour has been started at least once. The user
  // can still re-launch from /ayuda. We intentionally do NOT depend on
  // `hasSeenTour` here — the button disappears on first run, not on
  // completion.
  if (hasStartedTour) return null;

  return (
    <button
      className={`tour-trigger-btn ${className ?? ''}`}
      onClick={() => void startTour()}
      aria-label={t('tour.trigger.label')}
    >
      <HelpCircle size={20} strokeWidth={1.8} />
    </button>
  );
}
