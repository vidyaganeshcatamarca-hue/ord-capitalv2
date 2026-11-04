// src/ocr/useOcrCatalog.ts
// ============================================
// OCR v1 - Live ORD catalog for the ticket editor
// ============================================
//
// Normative source: definitive PRD §84, §85. The upload context is a SNAPSHOT;
// confirmation validates against the CURRENT catalog, because a category,
// wallet or card may have been deleted in between.
//
// The system category `ocr_unrecognized` is resolvable for DISPLAY but is never
// offered as a choice: the user moves products toward real categories (§9,
// §29).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { catalogDisplayName } from '@/lib/catalogRegistry';
import { filterUserEditableCategories, isUserEditableCategory } from '@/lib/categoryFilters';
import { rpc } from '@/lib/supabase';
import { t } from '@/locales/i18n';
import type { CategoriaGrupo, CategoriaHoja } from '@/components/CategoriaPicker/CategoriaPicker';
import { OCR_UNRECOGNIZED_KEY } from './grouping';
import type { OcrCategoryNameResolver } from './memory';

interface CategoryRow {
  estructura_id: number | string;
  nombre_cuenta: string;
  hijos?: { estructura_id: number | string; nombre_cuenta: string; icono?: string | null }[] | null;
}

export interface OcrWalletOption {
  billetera_id: number;
  nombre: string;
  moneda: string;
}

export interface OcrCardOption {
  tarjeta_id: number;
  nombre_tarjeta: string;
  moneda_iso: string | null;
}

export interface UseOcrCatalogResult {
  groups: CategoriaGrupo[];
  resolve: OcrCategoryNameResolver;
  wallets: OcrWalletOption[];
  cards: OcrCardOption[];
  loading: boolean;
  reload: () => void;
}

async function safeRows<T>(name: string, params?: Record<string, unknown>): Promise<T[]> {
  try {
    const data = await rpc<T[]>(name, params);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function loadWallets(): Promise<OcrWalletOption[]> {
  const rows = await safeRows<{ billetera_id: number | string; nombre: string; moneda: string; activa?: boolean; es_fondo_prevision?: boolean }>(
    'fn_obtener_billeteras_activas'
  );
  return rows
    .filter((row) => row.activa !== false && row.es_fondo_prevision !== true)
    .map((row) => ({
      billetera_id: Number(row.billetera_id),
      nombre: row.nombre,
      moneda: row.moneda,
    }));
}

async function loadCards(): Promise<OcrCardOption[]> {
  const rows = await safeRows<{ tarjeta_id: number | string; nombre_tarjeta: string; moneda_iso?: string | null; activa?: boolean }>(
    'fn_reporte_mapa_tarjetas'
  );
  return rows
    .filter((row) => row.activa !== false)
    .map((row) => ({
      tarjeta_id: Number(row.tarjeta_id),
      nombre_tarjeta: row.nombre_tarjeta,
      moneda_iso: typeof row.moneda_iso === 'string' ? row.moneda_iso : null,
    }));
}

/** Builds the picker tree: a parent with children is a header, not a choice. */
function buildGroups(rows: readonly CategoryRow[]): CategoriaGrupo[] {
  const groups: CategoriaGrupo[] = [];
  for (const parent of filterUserEditableCategories(rows)) {
    const children: CategoriaHoja[] = (parent.hijos ?? [])
      .filter(isUserEditableCategory)
      .map((child) => ({
        estructura_id: Number(child.estructura_id),
        nombre: catalogDisplayName(child.nombre_cuenta),
        icono: child.icono ?? '🔹',
      }));
    groups.push({
      estructura_id: Number(parent.estructura_id),
      nombre_cuenta: catalogDisplayName(parent.nombre_cuenta),
      icono: '📁',
      hijos: children,
    });
  }
  return groups;
}

/**
 * Loads the live catalog used by the ticket editor. Failures degrade to empty
 * lists instead of throwing: the ticket must stay reviewable.
 */
export function useOcrCatalog(): UseOcrCatalogResult {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [wallets, setWallets] = useState<OcrWalletOption[]>([]);
  const [cards, setCards] = useState<OcrCardOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(0);

  const reload = useCallback(() => setToken((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const load = async (): Promise<void> => {
      const [categoryRows, walletRows, cardRows] = await Promise.all([
        safeRows<CategoryRow>('fn_obtener_arbol_categorias'),
        loadWallets(),
        loadCards(),
      ]);
      if (!alive) return;
      setRows(categoryRows);
      setWallets(walletRows);
      setCards(cardRows);
      setLoading(false);
    };
    void load().catch(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const groups = useMemo(() => buildGroups(rows), [rows]);

  const resolve = useCallback<OcrCategoryNameResolver>(
    (categoryId) => {
      if (categoryId === OCR_UNRECOGNIZED_KEY) {
        return { name: t('ocr_unrecognized'), parent_name: null };
      }
      const numeric = Number(categoryId);
      for (const group of groups) {
        if (group.estructura_id === numeric) {
          return { name: group.nombre_cuenta, parent_name: null };
        }
        const child = group.hijos.find((hijo) => hijo.estructura_id === numeric);
        if (child) return { name: child.nombre, parent_name: group.nombre_cuenta };
      }
      return null;
    },
    [groups]
  );

  return { groups, resolve, wallets, cards, loading, reload };
}
