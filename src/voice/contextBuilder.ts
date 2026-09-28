// src/voice/contextBuilder.ts
// ============================================
// Voice v1 - User catalog snapshot sent with every job
// ============================================
import { useCallback, useEffect, useState } from 'react';
import { catalogDisplayName } from '@/lib/catalogRegistry';
import { filterUserEditableCategories, isUserEditableCategory } from '../lib/categoryFilters';
import { rpc } from '../lib/supabase';
import { validateContextSize } from './contract';
import type { VoiceContext } from './types';

/** Raw row returned by `fn_obtener_arbol_categorias` (parent rubro). */
export interface VoiceCatalogCategoryRow {
  estructura_id: number | string;
  nombre_cuenta: string;
  hijos?: VoiceCatalogSubcategoryRow[] | null;
}

/** Raw row returned by `fn_obtener_arbol_categorias` (subaccount). */
export interface VoiceCatalogSubcategoryRow {
  estructura_id: number | string;
  nombre_cuenta: string;
}

/** Raw row returned by `fn_listar_categorias_ingreso`. */
export interface VoiceCatalogIncomeSourceRow {
  producto_id: number | string;
  nombre: string;
  es_pasivo?: boolean | null;
}

/** Raw row returned by the wallet listing RPCs. */
export interface VoiceCatalogWalletRow {
  billetera_id: number | string;
  nombre: string;
  moneda: string;
  activa?: boolean | null;
}

/** Raw row returned by `fn_reporte_mapa_tarjetas`. */
export interface VoiceCatalogCardRow {
  tarjeta_id: number | string;
  nombre_tarjeta: string;
  activa?: boolean | null;
}

/** Raw row returned by `fn_obtener_region_usuario`. */
export interface VoiceCatalogRegionRow {
  pais_codigo: string;
  moneda_default: string;
  idioma_default: string;
}

/** Raw catalog payload used to build the voice context. */
export interface VoiceCatalogData {
  categories: VoiceCatalogCategoryRow[];
  incomeSources: VoiceCatalogIncomeSourceRow[];
  wallets: VoiceCatalogWalletRow[];
  cards: VoiceCatalogCardRow[];
}

/** Currencies the cards accept. The app exposes a manual USD toggle for every card. */
const CARD_SUPPORTED_CURRENCIES: string[] = ['ARS', 'USD'];

/** Fallback currency when the user region cannot be resolved. */
const DEFAULT_LOCAL_CURRENCY = 'ARS';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Local `YYYY-MM-DD` string. Built from local components on purpose:
 * `toISOString()` would shift the day for users behind UTC.
 */
export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * ISO-8601 string with the local UTC offset (e.g. `2026-09-23T14:30:00-03:00`).
 * The backend resolves relative dates from this value, so the offset matters.
 */
export function toLocalOffsetISOString(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = pad2(Math.floor(absoluteOffset / 60));
  const offsetRemainder = pad2(absoluteOffset % 60);
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  return `${toLocalDateString(date)}T${time}${sign}${offsetHours}:${offsetRemainder}`;
}

/** Resolves the IANA timezone of the device, defaulting to UTC. */
export function resolveLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Input accepted by `buildVoiceContext`. */
export interface BuildVoiceContextInput {
  catalog: VoiceCatalogData;
  localCurrency: string;
  now?: Date;
}

/**
 * Builds the pure JSON context sent with a voice job.
 * Entity ids are always serialized as strings (bigint backend keys).
 */
export function buildVoiceContext(input: BuildVoiceContextInput): VoiceContext {
  const { catalog, localCurrency, now } = input;
  const referenceDate = now ?? new Date();

  const expenseCategories: VoiceContext['expense_categories'] = [];
  // System categories (Misterio/Olvido, cat_card_diff, ...) are filtered
  // BEFORE building, exactly like AddMovementModal does on the raw RPC rows.
  // The built objects use localized `name`, which the filter helper cannot
  // inspect.
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

  // Wallets: only active ones, matching AddMovementModal's source rows.
  const wallets = catalog.wallets
    .filter((wallet) => wallet.activa !== false)
    .map((wallet) => ({
      id: String(wallet.billetera_id),
      // Seed wallets store an i18n key as the name: the LLM matches the
      // display name the user actually says ("efectivo").
      name: catalogDisplayName(wallet.nombre),
      currency: wallet.moneda,
    }));

  // Cards: only active ones.
  const cards = catalog.cards
    .filter((card) => card.activa !== false)
    .map((card) => ({
      id: String(card.tarjeta_id),
      name: card.nombre_tarjeta,
      supported_currencies: [...CARD_SUPPORTED_CURRENCIES],
    }));

  return {
    local_datetime: toLocalOffsetISOString(referenceDate),
    local_date: toLocalDateString(referenceDate),
    timezone: resolveLocalTimezone(),
    local_currency: localCurrency || DEFAULT_LOCAL_CURRENCY,
    expense_categories: expenseCategories,
    // Passive income sources are kept: the backend decides how to use them.
    income_sources: catalog.incomeSources.map((source) => ({
      id: String(source.producto_id),
      name: catalogDisplayName(source.nombre),
    })),
    wallets,
    cards,
  };
}

/** Result returned by `useVoiceContext`. */
export interface UseVoiceContextResult {
  context: VoiceContext | null;
  loading: boolean;
  reload: () => void;
  /** True when the serialized context exceeds MAX_CONTEXT_BYTES. */
  contextTooLarge: boolean;
}

/** Returns the rows of a catalog RPC, or an empty list when it fails. */
async function safeRpcRows<T>(name: string): Promise<T[]> {
  try {
    const data = await rpc<T[]>(name);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Wallet listing uses the same fallback chain as AddMovementModal:
 * `fn_obtener_billeteras_ordenadas` (p_orden: 'valor', el default del app) first,
 * `fn_obtener_billeteras_activas` on failure.
 */
async function loadWalletRows(): Promise<VoiceCatalogWalletRow[]> {
  try {
    const data = await rpc<VoiceCatalogWalletRow[]>('fn_obtener_billeteras_ordenadas', { p_orden: 'valor' });
    return Array.isArray(data) ? data : [];
  } catch {
    return safeRpcRows<VoiceCatalogWalletRow>('fn_obtener_billeteras_activas');
  }
}

/** Resolves the user's local currency from `fn_obtener_region_usuario`. */
async function loadLocalCurrency(): Promise<string> {
  const rows = await safeRpcRows<VoiceCatalogRegionRow>('fn_obtener_region_usuario');
  const currency = rows[0]?.moneda_default;
  return typeof currency === 'string' && currency.length > 0 ? currency : DEFAULT_LOCAL_CURRENCY;
}

/**
 * Loads the catalogs required by a voice job. Catalog failures never throw;
 * the context is simply built with whatever could be resolved.
 */
export function useVoiceContext(): UseVoiceContextResult {
  const [context, setContext] = useState<VoiceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [contextTooLarge, setContextTooLarge] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const [categories, incomeSources, wallets, cards, localCurrency] = await Promise.all([
          safeRpcRows<VoiceCatalogCategoryRow>('fn_obtener_arbol_categorias'),
          safeRpcRows<VoiceCatalogIncomeSourceRow>('fn_listar_categorias_ingreso'),
          loadWalletRows(),
          safeRpcRows<VoiceCatalogCardRow>('fn_reporte_mapa_tarjetas'),
          loadLocalCurrency(),
        ]);
        if (!alive) return;
        const built = buildVoiceContext({
          catalog: { categories, incomeSources, wallets, cards },
          localCurrency,
        });
        setContext(built);
        setContextTooLarge(!validateContextSize(built));
      } catch {
        if (!alive) return;
        setContext(null);
        setContextTooLarge(false);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();

    return () => {
      alive = false;
    };
  }, [reloadToken]);

  return { context, loading, reload, contextTooLarge };
}
