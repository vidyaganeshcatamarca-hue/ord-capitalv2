import { t } from '@/locales/i18n';
import type { Tour, TourStep } from '../types';

export interface ResolvedStepI18n {
  title: string;
  description: string;
  howTo: string;
}

export function resolveStepI18n(tour: Tour, step: TourStep): ResolvedStepI18n {
  const prefix = tour.i18nPrefix;
  return {
    title: t(`${prefix}.${step.i18nKey}.title`),
    description: t(`${prefix}.${step.i18nKey}.description`),
    howTo: t(`${prefix}.${step.i18nKey}.howTo`),
  };
}
