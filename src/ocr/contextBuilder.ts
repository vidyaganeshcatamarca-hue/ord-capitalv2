// src/ocr/contextBuilder.ts
// ============================================
// OCR v1 - ORD snapshot sent with every ticket
// ============================================
//
// Normative source: definitive PRD §28-§31 and contract v1 §4.
//
// The context is a SNAPSHOT of ORD at upload time: it explains what OCR knew.
// The CURRENT state is validated later, at confirmation (PRD §85), so a
// category deleted in between never gets written.
//
// Two deliberate differences from the Voice context:
//   - no `income_sources` (a ticket is an expense; sending income accounts
//     would only widen the classifier's surface);
//   - the system category `ocr_unrecognized` is filtered out (PRD §29): it is a
//     bookkeeping fallback, never a semantic class the classifier may pick.

import { useCallback, useEffect, useState } from 'react';
import { catalogDisplayName } from '@/lib/catalogRegistry';
import { filterUserEditableCategories, isUserEditableCategory } from '@/lib/categoryFilters';
import { rpc } from '@/lib/supabase';
import { toLocalDateString } from './contract';
import type { OcrCatalogCard, OcrCatalogCategory, OcrCatalogWallet, OcrContext } from './contextTypes';
import { DEFAULT_OCR_LANGUAGE, DEFAULT_OCR_LOCAL_CURRENCY, cardSupportedCurrencies } from './contextTypes';

export interface OcrCatalogCategoryRow {
  estructura_id: number | string;
  nombre_cuenta: string;
  hijos?: { estructura_id: number | string; nombre_cuenta: string }[] | null;
}

export interface OcrCatalogWalletRow {
  billetera_id: number | string;
  nombre: string;
  moneda: string;
  activa?: boolean | null;
}

export interface OcrCatalogCardRow {
  tarjeta_id: number | string;
  nombre_tarjeta: string;
  moneda_iso?: string | null;
  activa?: boolean | null;
}

export interface OcrCatalogRegionRow {
  pais_codigo: string;
  moneda_default: string;
  idioma_default: string;
}

export interface OcrCatalogData {
  categories: OcrCatalogCategoryRow[];
  wallets: OcrCatalogWalletRow[];
  cards: OcrCatalogCardRow[];
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** ISO-8601 with the device's local UTC offset (e.g. `2026-11-04T11:00:00-03:00`). */
export function toLocalOffsetISOString(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  return `${toLocalDateString(date)}T${time}${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
}

/** IANA timezone of the device, defaulting to UTC. */
export function resolveLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface BuildOcrContextInput {
  catalog: OcrCatalogData;
  localCurrency: string;
  language?: string;
  now?: Date;
}

/**
 * Builds the pure JSON context. Every id is serialized as a string (bigint
 * backend keys) and every name is the DISPLAY name, because the classifier
 * matches what the user actually sees.
 */
export function buildOcrContext(input: BuildOcrContextInput): OcrContext {
  const { catalog, localCurrency, now } = input;
  const reference = now ?? new Date();

  const expenseCategories: OcrCatalogCategory[] = [];
  // System categories are filtered on the RAW rows, exactly like the Voice
  // builder: the display name no longer identifies the row.
  for (const parent of filterUserEditableCategories(catalog.categories)) {
    expenseCategories.push({
      id: String(parent.estructura_id),
      name: catalogDisplayName(parent.nombre_cuenta),
      parent_name: null,
    });
    for (const child of parent.hijos ?? []) {
      if (!isUserEditableCategory(child)) continue;
      expenseCategories.push({
        id: String(child.estructura_id),
        name: catalogDisplayName(child.nombre_cuenta),
        parent_name: catalogDisplayName(parent.nombre_cuenta),
      });
    }
  }

  const wallets: OcrCatalogWallet[] = catalog.wallets
    .filter((wallet) => wallet.activa !== false)
    .map((wallet) => ({
      id: String(wallet.billetera_id),
      name: catalogDisplayName(wallet.nombre),
      currency: wallet.moneda,
    }));

  const cards: OcrCatalogCard[] = catalog.cards
    .filter((card) => card.activa !== false)
    .map((card) => ({
      id: String(card.tarjeta_id),
      name: card.nombre_tarjeta,
      supported_currencies: cardSupportedCurrencies(card.moneda_iso),
    }));

  return {
    language: input.language || DEFAULT_OCR_LANGUAGE,
    local_datetime: toLocalOffsetISOString(reference),
    local_date: toLocalDateString(reference),
    timezone: resolveLocalTimezone(),
    local_currency: (localCurrency || DEFAULT_OCR_LOCAL_CURRENCY).toUpperCase(),
    expense_categories: expenseCategories,
    wallets,
    cards,
  };
}

async function safeRpcRows<T>(name: string, params?: Record<string, unknown>): Promise<T[]> {
  try {
    const data = await rpc<T[]>(name, params);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Same wallet fallback chain the rest of the app uses. */
async function loadWalletRows(): Promise<OcrCatalogWalletRow[]> {
  try {
    const data = await rpc<OcrCatalogWalletRow[]>('fn_obtener_billeteras_ordenadas', { p_orden: 'valor' });
    return Array.isArray(data) ? data : [];
  } catch {
    return safeRpcRows<OcrCatalogWalletRow>('fn_obtener_billeteras_activas');
  }
}

/**
 * Resolves the local currency: the confirmed region first, then the first
 * wallet, then the legacy default. Never a guess.
 */
async function loadLocalCurrency(wallets: OcrCatalogWalletRow[]): Promise<string> {
  const rows = await safeRpcRows<OcrCatalogRegionRow>('fn_obtener_region_usuario');
  const region = rows[0]?.moneda_default;
  if (typeof region === 'string' && region.length > 0) return region;
  const fromWallet = wallets[0]?.moneda;
  if (typeof fromWallet === 'string' && fromWallet.length > 0) return fromWallet;
  return DEFAULT_OCR_LOCAL_CURRENCY;
}

export interface UseOcrContextResult {
  context: OcrContext | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads the catalogs required by a ticket upload. Catalog failures never throw:
 * the context is built with whatever could be resolved, and an entirely missing
 * context is reported by the caller (`CONTEXT_UNAVAILABLE`).
 */
export function useOcrContext(language?: string): UseOcrContextResult {
  const [context, setContext] = useState<OcrContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let alive = true;

    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const [categories, wallets, cards] = await Promise.all([
          safeRpcRows<OcrCatalogCategoryRow>('fn_obtener_arbol_categorias'),
          loadWalletRows(),
          safeRpcRows<OcrCatalogCardRow>('fn_reporte_mapa_tarjetas'),
        ]);
        const localCurrency = await loadLocalCurrency(wallets);
        if (!alive) return;
        setContext(buildOcrContext({ catalog: { categories, wallets, cards }, localCurrency, language }));
      } catch {
        if (alive) setContext(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [reloadToken, language]);

  return { context, loading, reload };
}
