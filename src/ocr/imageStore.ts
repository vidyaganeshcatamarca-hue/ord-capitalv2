// src/ocr/imageStore.ts
// ============================================
// OCR v1 - Private local copy of the ticket images (IndexedDB blobs)
// ============================================
//
// Normative source: definitive PRD §41-§46, §75, §95, §96, §113.
//
// Rules encoded here:
//   - blobs live in IndexedDB, never in localStorage and never in a public URL;
//   - the key is `ocr-image/{job_id}/{file_index}`, never the original filename;
//   - the 7-day window starts when the ticket FINISHES processing
//     (`processed_at`), not when the photo was taken (§44);
//   - a missing or expired image is a degraded view, never an error: editing,
//     saving and confirming keep working without it (§46, §75);
//   - the local copy is a review aid, not the financial source of truth.
//
// Platform note: this build ships web/PWA only (there is no `android/` or `ios/`
// project in the repo), so IndexedDB is the implementation. A Capacitor
// implementation must expose this exact interface; nothing else in the OCR
// module touches the storage engine.

import type { OcrImageManifestEntry } from './types';

const DB_NAME = 'ord-ocr-images';
const DB_VERSION = 1;
const STORE = 'images';

/** Local availability window after the ticket finished processing (PRD §44). */
export const OCR_IMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Age after which an image not tied to a pending job is swept (PRD §45). */
export const OCR_IMAGE_ORPHAN_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;

/** One stored image: blob plus its minimal manifest (PRD §43). */
export interface OcrStoredImage extends OcrImageManifestEntry {
  /** True while the image may still be offered to the user (PRD §46). */
  available: boolean;
}

interface OcrImageRow extends OcrImageManifestEntry {
  key: string;
  blob: Blob;
}

/** Result of a storage write: how many rows were stored and whether it is durable. */
export interface OcrImageWriteResult {
  saved: number;
  durable: boolean;
}

/** Builds the canonical key of one image (PRD §43). */
export function ocrImageKey(jobId: string, fileIndex: number): string {
  return `ocr-image/${jobId}/${fileIndex}`;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const factory = globalThis.indexedDB;
      if (!factory) {
        resolve(null);
        return;
      }
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('job_id', 'job_id', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      // Private mode / disabled storage: degrade, never throw.
      resolve(null);
    }
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/** True when a durable local image store is usable on this device. */
export async function isOcrImageStorageAvailable(): Promise<boolean> {
  const db = await openDb();
  return db !== null;
}

function toStoredImage(row: OcrImageRow, nowMs: number): OcrStoredImage {
  const expiresMs = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
  const available = !Number.isFinite(expiresMs) || expiresMs > nowMs;
  return {
    job_id: row.job_id,
    file_index: row.file_index,
    mime_type: row.mime_type,
    created_at: row.created_at,
    processed_at: row.processed_at,
    expires_at: row.expires_at,
    available,
  };
}

/**
 * Stores the ticket images under `jobId`.
 *
 * Called twice in practice: with a local upload id before the POST (so the copy
 * exists even if the request dies), and then rekeyed to the real `job_id` once
 * the backend accepted it. Any failure resolves to `durable: false` — the
 * ticket upload itself is never blocked by this (§75).
 */
export async function saveOcrImages(
  jobId: string,
  files: readonly File[],
  nowMs: number = Date.now()
): Promise<OcrImageWriteResult> {
  const db = await openDb();
  if (!db) return { saved: 0, durable: false };

  const createdAt = new Date(nowMs).toISOString();
  let saved = 0;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const row: OcrImageRow = {
      key: ocrImageKey(jobId, index),
      job_id: jobId,
      file_index: index,
      mime_type: file.type || 'application/octet-stream',
      created_at: createdAt,
      processed_at: null,
      expires_at: null,
      blob: file,
    };
    const written = await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(row);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
    if (written) saved += 1;
  }

  return { saved, durable: saved === files.length };
}

/** Moves every image of one local key to the real job id. */
export async function rekeyOcrImages(fromJobId: string, toJobId: string): Promise<OcrImageWriteResult> {
  if (fromJobId === toJobId) return { saved: 0, durable: true };
  const rows = await readRows(fromJobId);
  const db = await openDb();
  if (!db) return { saved: 0, durable: false };

  const moved = await new Promise<number>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let count = 0;
      for (const row of rows) {
        store.put({
          ...row,
          key: ocrImageKey(toJobId, row.file_index),
          job_id: toJobId,
        });
        store.delete(ocrImageKey(fromJobId, row.file_index));
        count += 1;
      }
      tx.oncomplete = () => resolve(count);
      tx.onerror = () => resolve(0);
      tx.onabort = () => resolve(0);
    } catch {
      resolve(0);
    }
  });

  return { saved: moved, durable: moved === rows.length };
}

async function readRows(jobId: string): Promise<OcrImageRow[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('job_id');
    const rows = await requestToPromise(index.getAll(jobId) as IDBRequest<OcrImageRow[]>);
    if (!rows) return [];
    return rows.sort((a, b) => a.file_index - b.file_index);
  } catch {
    return [];
  }
}

/**
 * Lists the images of a job in the original order (PRD §65: several images keep
 * their order). Rows past their logical window come back with `available: false`
 * instead of disappearing, so the UI can say "not available on this device".
 */
export async function listOcrImages(jobId: string, nowMs: number = Date.now()): Promise<OcrStoredImage[]> {
  const rows = await readRows(jobId);
  return rows.map((row) => toStoredImage(row, nowMs));
}

/** Reads one blob, or null when it is missing/expired/unavailable. */
export async function readOcrImage(jobId: string, fileIndex: number): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE, 'readonly');
    const row = await requestToPromise(
      tx.objectStore(STORE).get(ocrImageKey(jobId, fileIndex)) as IDBRequest<OcrImageRow | undefined>
    );
    return row?.blob ?? null;
  } catch {
    return null;
  }
}

/**
 * Starts the 7-day window (PRD §44): called when the ticket reaches
 * `completed` / `needs_review`. While the job is pending nothing is stamped, so
 * a ticket processed days later still keeps its photo.
 */
export async function markOcrImagesProcessed(
  jobId: string,
  processedAtMs: number = Date.now()
): Promise<number> {
  const rows = await readRows(jobId);
  const db = await openDb();
  if (!db || rows.length === 0) return 0;

  const processedAt = new Date(processedAtMs).toISOString();
  const expiresAt = new Date(processedAtMs + OCR_IMAGE_TTL_MS).toISOString();

  const updated = await new Promise<number>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const row of rows) {
        store.put({ ...row, processed_at: processedAt, expires_at: expiresAt });
      }
      tx.oncomplete = () => resolve(rows.length);
      tx.onerror = () => resolve(0);
      tx.onabort = () => resolve(0);
    } catch {
      resolve(0);
    }
  });

  return updated;
}

/** Deletes every image of one job (used by "Borrar caché", PRD §95). */
export async function deleteOcrImages(jobId: string): Promise<number> {
  const rows = await readRows(jobId);
  const db = await openDb();
  if (!db || rows.length === 0) return 0;

  const deleted = await new Promise<number>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const row of rows) store.delete(ocrImageKey(jobId, row.file_index));
      tx.oncomplete = () => resolve(rows.length);
      tx.onerror = () => resolve(0);
      tx.onabort = () => resolve(0);
    } catch {
      resolve(0);
    }
  });

  return deleted;
}

/**
 * Periodic sweep (PRD §45 A). Deletes:
 *   - images whose logical window already closed;
 *   - leftovers not tied to a pending job that are older than the orphan age
 *     (an upload that never got a job id must not live forever).
 * Pending jobs are ALWAYS preserved, even if their window looks closed.
 */
export async function sweepOcrImages(
  activeJobIds: readonly string[],
  nowMs: number = Date.now()
): Promise<number> {
  const db = await openDb();
  if (!db) return 0;

  const active = new Set(activeJobIds);
  let rows: OcrImageRow[] = [];
  try {
    const tx = db.transaction(STORE, 'readonly');
    rows = (await requestToPromise(tx.objectStore(STORE).getAll() as IDBRequest<OcrImageRow[]>)) ?? [];
  } catch {
    return 0;
  }

  const doomed = rows.filter((row) => {
    if (active.has(row.job_id)) return false;
    const expiresMs = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
    if (Number.isFinite(expiresMs)) return expiresMs <= nowMs;
    const createdMs = Date.parse(row.created_at);
    return Number.isFinite(createdMs) && nowMs - createdMs > OCR_IMAGE_ORPHAN_MAX_AGE_MS;
  });

  if (doomed.length === 0) return 0;

  const removed = await new Promise<number>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const row of doomed) store.delete(row.key);
      tx.oncomplete = () => resolve(doomed.length);
      tx.onerror = () => resolve(0);
      tx.onabort = () => resolve(0);
    } catch {
      resolve(0);
    }
  });

  return removed;
}

/**
 * Removes every local OCR image and manifest (PRD §95, "Borrar caché").
 * Deliberately does NOT touch pending job ids, quarantines, movements or the
 * backend category memory.
 */
export async function clearAllOcrImages(): Promise<number> {
  const db = await openDb();
  if (!db) return 0;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const count = (await requestToPromise(store.count())) ?? 0;
    store.clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
    return count;
  } catch {
    return 0;
  }
}

/** Creates an object URL for a blob and revokes it after `ttlMs`. */
export function createOcrObjectUrl(blob: Blob, ttlMs = 60000): { url: string; revoke: () => void } {
  const url = URL.createObjectURL(blob);
  const timer = setTimeout(() => URL.revokeObjectURL(url), ttlMs);
  return {
    url,
    revoke: () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    },
  };
}
