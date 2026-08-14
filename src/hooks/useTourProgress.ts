import { useCallback } from 'react';
import type { TourScreenId } from '@/tours/ids';
import {
  getCompletedTours,
  setCompletedTours,
  removeCompletedTour,
  getTourVersion,
  setTourVersion,
} from '@/tours/core/storage';

export function useTourProgress() {
  const isSeen = useCallback((screenId: TourScreenId): boolean => {
    const completed = getCompletedTours();
    return completed.includes(screenId);
  }, []);

  const markSeen = useCallback((screenId: TourScreenId): void => {
    setCompletedTours(screenId);
  }, []);

  const markNotSeen = useCallback((screenId: TourScreenId): void => {
    removeCompletedTour(screenId);
  }, []);

  const getStoredVersion = useCallback((screenId: TourScreenId): number | null => {
    return getTourVersion(screenId);
  }, []);

  const setStoredVersion = useCallback((screenId: TourScreenId, version: number): void => {
    setTourVersion(screenId, version);
  }, []);

  return { isSeen, markSeen, markNotSeen, getStoredVersion, setStoredVersion };
}
