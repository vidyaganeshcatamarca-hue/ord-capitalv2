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
  | 'upload_pending'
  | 'upload_failed'
  | 'processing'
  | 'classified'
  | 'quarantine'
  | 'approved'
  | 'rejected';

import type { OcrJobStatus } from './types';

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
  /**
   * Ultimo estado real del backend para ese envio. La fila lo usa para decir
   * que esta pasando (leyendo, clasificando, en espera) en vez de un
   * "Procesando" plano que a los diez minutos no informa nada.
   * Opcional: las entradas viejas no lo tienen y se leen como desconocido.
   */
  last_status?: OcrJobStatus | null;
  last_stage?: string | null;
  /**
   * Dueño del envío.
   *
   * Sin esto el historial mezclaba las cargas de todos los usuarios del
   * teléfono, y un envío ajeno podía ofrecer "reenviar" o "borrar" sobre un
   * ticket que no era de quien estaba mirando. Las entradas anteriores a este
   * campo no lo tienen y se resuelven por el job asociado.
   */
  owner_user_id?: string | null;
}

export const OCR_HISTORY_STORAGE_KEY = 'ord.ocr.v1.history' as const;

/** Cuantos envios recuerda el telefono. Pedido del dueño: los ultimos cinco. */
export const OCR_HISTORY_LIMIT = 5;

const STATUSES: readonly OcrHistoryStatus[] = [
  'upload_pending',
  'upload_failed',
  'processing',
  'classified',
  'quarantine',
  'approved',
  'rejected',
];

/**
 * Estados en los que el ticket TODAVIA no llego al servidor.
 *
 * Son los unicos que el reintento puede volver a mandar. Las fotos de los demas
 * siguen en el telefono a proposito — siete dias, para poder mirar el ticket
 * guardado — y reenviarlas crearia un segundo ticket de algo que ya viajo.
 */
export const OCR_HISTORY_UNSENT_STATUSES: readonly OcrHistoryStatus[] = [
  'upload_pending',
  'upload_failed',
];

/**
 * Los envios que se pueden reintentar: nada mas que los no enviados.
 *
 * La regla vive aca y no en el que la llama porque es la que impide reenviar el
 * catalogo entero de fotos guardadas: una entrada `processing` o posterior ya
 * tiene `job_id` del servidor y volver a subirla duplicaria el ticket.
 */
export function selectPendingUploadEntries(
  entries: readonly OcrHistoryEntry[],
): OcrHistoryEntry[] {
  return entries.filter((entry) => OCR_HISTORY_UNSENT_STATUSES.includes(entry.status));
}

/**
 * Recorta a `OCR_HISTORY_LIMIT` sin perder nada que todavia no viajo.
 *
 * Un envio sin subir es el unico que no se puede reconstruir: el servidor no
 * sabe de el y sus fotos se barren a los ocho dias. Si el recorte lo descarta,
 * se pierde el ticket entero. Las entradas ya enviadas si se pueden tirar: su
 * ticket vive en el backend.
 */
function trimHistory(entries: readonly OcrHistoryEntry[]): OcrHistoryEntry[] {
  const sorted = sortByRecency([...entries])
  const kept = sorted.slice(0, OCR_HISTORY_LIMIT)
  const unsent = sorted.filter(
    (entry) => OCR_HISTORY_UNSENT_STATUSES.includes(entry.status) && !kept.includes(entry),
  )
  return [...kept, ...unsent]
}

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
    const value = trimHistory(parsed.filter(isValidEntry))
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
    store.setItem(OCR_HISTORY_STORAGE_KEY, JSON.stringify(trimHistory(entries)))
    return { durable: true }
  } catch {
    return { durable: false }
  }
}

/** Alta o actualizacion de un envio. El mismo job nunca ocupa dos filas. */
export function recordOcrHistory(entry: OcrHistoryEntry): { durable: boolean } {
  const current = loadOcrHistory().value
  const withoutJob = current.filter((item) => item.job_id !== entry.job_id)
  return save(trimHistory([entry, ...withoutJob]))
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

/**
 * Borra un envio del historial del telefono.
 *
 * Se usa cuando el dueño descarta un ticket que el backend ya no conoce: no
 * hay nada que seguir y dejarlo "en espera" para siempre solo confunde.
 */
export function removeOcrHistoryEntry(jobId: string): { durable: boolean } {
  const current = loadOcrHistory().value
  const remaining = current.filter((item) => item.job_id !== jobId)
  if (remaining.length === current.length) return { durable: true }
  return save(remaining)
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
