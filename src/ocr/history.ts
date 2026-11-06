// src/ocr/history.ts
// ============================================
// OCR - historial local de los ultimos envios
// ============================================
//
// Un ticket con tres o cuatro fotos puede tardar minutos en volver a
// cuarentena. Mientras tanto el dueño necesita saber que paso con lo que ya
// mando, y no puede depender de las tablas para eso: el job local se poda al
// despacharse y desaparece al confirmarse o rechazarse.
//
// Por eso el historial vive aparte, en el telefono, con una lista corta
// (OCR_HISTORY_LIMIT) que sobrevive a todas esas transiciones.
//
// Import-free a proposito, igual que el resto de los modulos de storage: se
// prueba con un localStorage falso y no arrastra el runtime de React.

/** Etapa en la que el dueño puede reconocer su envio. */
export type OcrHistoryStatus =
  | 'processing'
  | 'classified'
  | 'quarantine'
  | 'approved'
  | 'rejected';

export interface OcrHistoryEntry {
  job_id: string;
  /** Cuando se envio, en ISO. Es lo que se muestra en la fila. */
  created_at: string;
  /** Cuantas imagenes viajaron en ese envio. */
  image_count: number;
  status: OcrHistoryStatus;
  /** Ultima vez que esta entrada cambio de estado, en ISO. */
  updated_at: string;
  /** Fila de cuarentena, cuando ya existe: permite saltar a ella. */
  pendiente_id: number | null;
}

export const OCR_HISTORY_STORAGE_KEY = 'ord.ocr.v1.history' as const;

/** Cuantos envios recuerda el telefono. Pedido del dueño: los ultimos cinco. */
export const OCR_HISTORY_LIMIT = 5;

const STATUSES: readonly OcrHistoryStatus[] = [
  'processing',
  'classified',
  'quarantine',
  'approved',
  'rejected',
];

export interface HistoryRead {
  value: OcrHistoryEntry[];
  durable: boolean;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function isValidEntry(value: unknown): value is OcrHistoryEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.job_id === 'string' &&
    entry.job_id.length > 0 &&
    typeof entry.created_at === 'string' &&
    entry.created_at.length > 0 &&
    typeof entry.image_count === 'number' &&
    Number.isFinite(entry.image_count) &&
    entry.image_count >= 0 &&
    typeof entry.status === 'string' &&
    (STATUSES as readonly string[]).includes(entry.status) &&
    typeof entry.updated_at === 'string' &&
    entry.updated_at.length > 0 &&
    (entry.pendiente_id === null || typeof entry.pendiente_id === 'number')
  )
}

/** Mas reciente primero; el orden no depende del orden de escritura. */
function sortByRecency(entries: OcrHistoryEntry[]): OcrHistoryEntry[] {
  return [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function loadOcrHistory(): HistoryRead {
  const store = storage()
  if (!store) return { value: [], durable: false }
  try {
    const raw = store.getItem(OCR_HISTORY_STORAGE_KEY)
    if (!raw) return { value: [], durable: true }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return { value: [], durable: true }
    const value = sortByRecency(parsed.filter(isValidEntry)).slice(0, OCR_HISTORY_LIMIT)
    return { value, durable: true }
  } catch {
    // Storage corrupto nunca rompe la pantalla (mismo criterio que storage.ts).
    return { value: [], durable: false }
  }
}

function save(entries: OcrHistoryEntry[]): { durable: boolean } {
  const store = storage()
  if (!store) return { durable: false }
  try {
    store.setItem(OCR_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, OCR_HISTORY_LIMIT)))
    return { durable: true }
  } catch {
    return { durable: false }
  }
}

/** Alta o actualizacion de un envio. El mismo job nunca ocupa dos filas. */
export function recordOcrHistory(entry: OcrHistoryEntry): { durable: boolean } {
  const current = loadOcrHistory().value
  const withoutJob = current.filter((item) => item.job_id !== entry.job_id)
  return save(sortByRecency([entry, ...withoutJob]).slice(0, OCR_HISTORY_LIMIT))
}

/**
 * Cambia el estado de un envio ya registrado. Un job desconocido no inventa una
 * fila: si no existe, no hay nada que el dueño haya enviado desde este telefono.
 */
export function patchOcrHistory(
  jobId: string,
  patch: Partial<Omit<OcrHistoryEntry, 'job_id' | 'created_at'>>,
): { durable: boolean } {
  const current = loadOcrHistory().value
  const index = current.findIndex((item) => item.job_id === jobId)
  if (index === -1) return { durable: true }
  const next = [...current]
  next[index] = {
    ...current[index],
    ...patch,
    updated_at: patch.updated_at ?? new Date().toISOString(),
  }
  return save(next)
}

export function clearOcrHistory(): { durable: boolean } {
  const store = storage()
  if (!store) return { durable: false }
  try {
    store.removeItem(OCR_HISTORY_STORAGE_KEY)
    return { durable: true }
  } catch {
    return { durable: false }
  }
}
