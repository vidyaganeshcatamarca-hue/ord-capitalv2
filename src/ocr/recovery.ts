// src/ocr/recovery.ts
// ============================================
// OCR - Envíos que el backend ya no conoce
// ============================================
//
// El historial del teléfono se escribe SOLO después de que `createOcrJob`
// responde aceptado (useOcrJobs.ts). Es decir: todo lo que está en el historial
// llegó al backend en su momento. Lo que el dueño percibe como "no llegó" es
// otra cosa: el backend dejó de conocerlo y responde 404 en cada intento.
//
// Este módulo decide cuándo una fila merece las acciones de rescate (reenviar o
// borrar) sin inventar estados. Es lógica pura para poder probarla sin React.

import type { OcrHistoryEntry } from './history';
import type { StoredOcrJob } from './storage';

/**
 * True when the upload is gone from the backend and nothing can recover it.
 *
 * Rules, deliberately narrow:
 *   - only a ship still marked `processing` can be lost; once it reached the
 *     quarantine, `approved` or `rejected` there is a real outcome to show;
 *   - the backend answering `NOT_FOUND` is the proof: the poll endpoint answers
 *     `job_id + user_id`, so a 404 here means this ticket is not on the server;
 *   - a row whose job disappeared from local storage is also lost: nothing is
 *     following it, so it will never advance on its own.
 *
 * A network failure is NOT lost: the upload exists, only the answer was missed.
 */
export function isLostOcrHistoryEntry(
  entry: OcrHistoryEntry,
  jobs: readonly StoredOcrJob[]
): boolean {
  if (entry.status !== 'processing') return false;
  const job = jobs.find((item) => item.job_id === entry.job_id);
  if (!job) return true;
  return job.last_error_code === 'NOT_FOUND';
}
