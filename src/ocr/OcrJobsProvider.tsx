// src/ocr/OcrJobsProvider.tsx
// ============================================
// OCR v1 - Global job bridge provider
// ============================================
//
// Mounted once, high in the tree and ALWAYS rendered (never conditionally with
// the capture modal): an in-flight job must keep being followed after the user
// closes the modal, and a finished job must land in the quarantine from
// whatever screen the user is on (PRD §91, §92).

import { createContext, useContext, type ReactNode } from 'react';
import { useOcrJobs, type UseOcrJobsResult } from './useOcrJobs';

const OcrJobsContext = createContext<UseOcrJobsResult | undefined>(undefined);

export function OcrJobsProvider({ children }: { children: ReactNode }) {
  const value = useOcrJobs();
  return <OcrJobsContext.Provider value={value}>{children}</OcrJobsContext.Provider>;
}

/** Access to the OCR job bridge. Throws outside the provider. */
export function useOcrJobsContext(): UseOcrJobsResult {
  const context = useContext(OcrJobsContext);
  if (!context) throw new Error('useOcrJobsContext must be used within an OcrJobsProvider');
  return context;
}

/** Non-throwing variant for components that may render outside the provider. */
export function useOptionalOcrJobs(): UseOcrJobsResult | null {
  return useContext(OcrJobsContext) ?? null;
}
