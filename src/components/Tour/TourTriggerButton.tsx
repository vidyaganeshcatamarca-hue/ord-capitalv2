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
  const { hasSeenTour, startTour } = useTour(screenId);

  if (hasSeenTour) return null;

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
