import type { TourScreenId } from '../ids';

const COMPLETED_KEY = 'ord.tour.v1.completed';
const VERSION_KEY_PREFIX = 'ord.tour.v1.';

function readCompletedArray(): TourScreenId[] {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TourScreenId[];
  } catch {
    console.error('[Tour] Failed to parse completed tours');
    return [];
  }
}

function writeCompletedArray(ids: TourScreenId[]): void {
  localStorage.setItem(COMPLETED_KEY, JSON.stringify(ids));
}

export function getCompletedTours(): TourScreenId[] {
  return readCompletedArray();
}

export function setCompletedTours(screenId: TourScreenId): void {
  const current = readCompletedArray();
  if (!current.includes(screenId)) {
    current.push(screenId);
    writeCompletedArray(current);
  }
}

export function removeCompletedTour(screenId: TourScreenId): void {
  const current = readCompletedArray();
  const filtered = current.filter((id) => id !== screenId);
  writeCompletedArray(filtered);
}

export function getTourVersion(screenId: TourScreenId): number | null {
  const raw = localStorage.getItem(`${VERSION_KEY_PREFIX}${screenId}.version`);
  if (raw === null) return null;
  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

export function setTourVersion(screenId: TourScreenId, version: number): void {
  localStorage.setItem(`${VERSION_KEY_PREFIX}${screenId}.version`, String(version));
}
