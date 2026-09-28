// src/lib/catalogRegistry.ts
// ============================================================
// System catalog registry + the single display-name helper
// ============================================================
//
// Some catalog entities are created by the SYSTEM, not by the user. For those
// rows the name column holds an i18n KEY (for example `cat_housing` or
// `wallet_cash_default_name`) instead of a literal name. User-created entities
// store a literal name (for example `Paypal Ar`).
//
// Every render of a catalog name must go through `catalogDisplayName()`:
//   - system key -> translated label (`cat_housing` -> "Vivienda")
//   - user name  -> returned unchanged, and never translated by accident even
//                   when it collides with an i18n key (a wallet literally
//                   named "close" must not render as "Cerrar").
//
// The set below is CLOSED. Convention: a new system-born catalog entity ships
// in the same change as (1) its seed/RPC in Supabase, (2) its i18n key in
// `es.ts`, and (3) its entry here. Never add a name that the user can type.
//
// Literal seed names (Educación, Transporte, Bazar/Varios, ...) are NOT
// registered: `t()` is a passthrough, so unknown values already render exactly
// as stored.
//
// Deliberately out of scope (they have their own mechanism, do not merge):
//   - `SYSTEM_CATEGORY_NAMES` in `src/lib/categoryFilters.ts` answers a
//     different question: is the category user-EDITABLE? Not how it renders.
//   - `p_grupo_familiar` names (`member_personal`, `member_family`) are
//     functional identifiers; the UI never renders them.
//   - Error codes (`error_*`) are resolved by `parseError()`.
//   - Movement/`p_caja` detalle keys (`type_income`, `adjustment_*`,
//     `initial_balance*`, `card_summary_payment*`) are movement types, not
//     catalog names, even though they live in the same `es.ts` seed block.

import { t } from '@/locales/i18n'

/**
 * Category names written by the system into
 * `p_estructuras_egresos.nombre_cuenta`.
 *
 * Source of truth is the `category_keys` seed block of `es.ts`, crossed with
 * the SQL that creates those rows:
 *  - live seed: `funcionesSQL/fn_onboarding_completo_usuario.md`
 *  - legacy seed kept for existing users:
 *    `tests/update_supabase_functions.sql` (the pre-consolidation food
 *    categories are still present in rows created by older seeds)
 *  - on-demand RPC/trigger rows: `no_detail`
 *    (`fn_crear_subcuenta_predeterminada`), `cat_card_diff`
 *    (`fn_registrar_ajuste_diferencia_tarjeta`,
 *    `fn_registrar_pago_tarjeta_multi`) and `cat_investments`
 *    (`fn_crear_inversion`).
 */
const SYSTEM_CATEGORY_NAMES: readonly string[] = [
  // Reconciliation / bookkeeping categories.
  'cat_mystery',
  'cat_misterio',
  'no_detail',
  'cat_card_diff',
  // Live seed.
  'cat_food_home',
  'cat_dry_goods',
  'cat_fresh_foods',
  'cat_drinks',
  'cat_cleaning_hygiene',
  'cat_home_pets',
  'cat_leisure_pleasure',
  'cat_clothing',
  'cat_housing',
  'cat_transport',
  'cat_health',
  'cat_education',
  'cat_finance_taxes',
  'cat_tech_electro',
  // Created on demand by RPCs.
  'cat_investments',
  // Legacy seed (rows already stored for users created before the seed was
  // consolidated into the names above).
  'cat_alimentos_hogar',
  'cat_dairy',
  'cat_butcher',
  'cat_greengrocer',
  'cat_bakery',
  'cat_deli_cheese',
  'cat_non_alc_drinks',
  'cat_frozen',
  'cat_home_cleaning',
  'cat_hygiene',
  'cat_snacks',
  'cat_pets',
  'cat_kids',
  'cat_bazaar',
  'cat_alcohol_drinks',
]

/**
 * Wallet names written by the system into `p_billeteras.nombre`.
 * Only the cash wallet has a system name: every other wallet (mother account,
 * provision fund, custom accounts) is named by the user.
 */
const SYSTEM_WALLET_NAMES: readonly string[] = ['wallet_cash_default_name']

/**
 * Closed set of system-created catalog names (categories and wallets) that
 * store an i18n key instead of a literal name.
 */
export const SYSTEM_CATALOG_NAMES: ReadonlySet<string> = new Set<string>([
  ...SYSTEM_CATEGORY_NAMES,
  ...SYSTEM_WALLET_NAMES,
])

/**
 * Returns the label to render for a catalog name coming from an RPC or from
 * metadata. System keys are translated; user names pass through untouched.
 * `null`, `undefined` and `''` return `''` so callers can keep using `||`
 * fallback chains.
 */
export function catalogDisplayName(name: string | null | undefined): string {
  if (!name) return ''
  return SYSTEM_CATALOG_NAMES.has(name) ? t(name) : name
}
