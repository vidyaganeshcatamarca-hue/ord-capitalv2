export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface TourStep {
  /** Internal step id for logging */
  id: string;
  /** data-tour-id attribute value — must be a valid TourId */
  target: string;
  /** Tooltip position relative to target */
  placement?: TourPlacement;
  /** i18n key suffix: composed as `${tour.i18nPrefix}.${i18nKey}.{title|description|howTo}` */
  i18nKey: string;
  /** v2 placeholder: audio URL or null */
  audioUrl: string | null;
}

export interface Tour {
  /** Tour identifier — matches a TourScreenId */
  id: string;
  /** Bump to invalidate "seen" state */
  version: number;
  /** i18n prefix, typically `tour.<screenId>` */
  i18nPrefix: string;
  /** i18n key for tour title (shown in /ayuda) */
  title: string;
  /** i18n key for tour description (shown in /ayuda) */
  description: string;
  /** Ordered steps (max 8) */
  steps: TourStep[];
}

export interface TourProgress {
  isSeen: (screenId: TourScreenId) => boolean;
  markSeen: (screenId: TourScreenId) => void;
  markNotSeen: (screenId: TourScreenId) => void;
  getStoredVersion: (screenId: TourScreenId) => number | null;
  setStoredVersion: (screenId: TourScreenId, version: number) => void;
}

import type { TourScreenId } from './ids';
