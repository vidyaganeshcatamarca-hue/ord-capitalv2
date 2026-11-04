// src/ocr/useOcrImages.ts
// ============================================
// OCR v1 - Local ticket images for the "Ver ticket" action
// ============================================
//
// Normative source: definitive PRD §41-§46, §65.
//
// The viewer reads the LOCAL copy first and never depends on a public backend
// URL. A missing or expired image is a degraded state with a message, not an
// error: the quarantine keeps working (PRD §46).

import { useCallback, useEffect, useState } from 'react';
import { listOcrImages, readOcrImage } from './imageStore';

export interface OcrImageView {
  file_index: number;
  mime_type: string;
  /** Object URL, or null when the blob is gone/expired. */
  url: string | null;
}

export interface UseOcrImagesResult {
  images: OcrImageView[];
  loading: boolean;
  /** True when there is nothing locally available to show. */
  unavailable: boolean;
  reload: () => void;
}

/**
 * Loads the local images of one job. Object URLs are revoked on unmount or
 * reload so a large ticket does not leak memory.
 */
export function useOcrImages(jobId: string | null | undefined, enabled = true): UseOcrImagesResult {
  const [images, setImages] = useState<OcrImageView[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!enabled || !jobId) {
      setImages([]);
      return undefined;
    }

    let alive = true;
    const urls: string[] = [];
    setLoading(true);

    const load = async (): Promise<void> => {
      const entries = await listOcrImages(jobId);
      const views: OcrImageView[] = [];
      for (const entry of entries) {
        if (!entry.available) {
          views.push({ file_index: entry.file_index, mime_type: entry.mime_type, url: null });
          continue;
        }
        const blob = await readOcrImage(jobId, entry.file_index);
        if (!blob) {
          views.push({ file_index: entry.file_index, mime_type: entry.mime_type, url: null });
          continue;
        }
        const url = URL.createObjectURL(blob);
        urls.push(url);
        views.push({ file_index: entry.file_index, mime_type: entry.mime_type, url });
      }
      if (!alive) {
        for (const url of urls) URL.revokeObjectURL(url);
        return;
      }
      setImages(views);
      setLoading(false);
    };

    void load().catch(() => {
      if (alive) {
        setImages([]);
        setLoading(false);
      }
    });

    return () => {
      alive = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [jobId, enabled, reloadToken]);

  const available = images.filter((image) => image.url !== null);

  return {
    images,
    loading,
    unavailable: !loading && available.length === 0,
    reload,
  };
}
