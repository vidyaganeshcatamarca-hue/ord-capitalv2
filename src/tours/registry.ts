import type { Tour } from './types';
import type { TourScreenId } from './ids';

const registry: Record<string, () => Promise<{ default: Tour }>> = {
  home: () => import('./home.tour.json'),
};

export async function loadTour(screenId: TourScreenId): Promise<Tour> {
  const loader = registry[screenId];
  if (!loader) {
    throw new Error(`[Tour] No tour registered for screenId: ${screenId}`);
  }
  const module = await loader();
  return module.default;
}
