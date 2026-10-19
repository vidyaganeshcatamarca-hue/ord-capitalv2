// lib/transferTitles.ts
// ============================================
// Transfer titles for cross-currency moves — pure logic, ZERO imports.
//
// The Node test runner imports this module directly with its type stripping
// (`import { ... } from '../../src/lib/transferTitles.ts'`). It cannot resolve
// Vite aliases (`@/...`) nor `.js`-to-`.ts` rewrites, so this file must stay
// free of every import. Keep React, the DOM and Supabase out of here.
//
// Why this module exists: the backend used to stamp a fixed CASE into
// fn_registrar_movimiento_caja / fn_aprobar_cuarentena_v2 that only knew the
// pair local<->USD ('transfer_compra_dolares' / 'transfer_venta_dolares') and
// forced every other cross-currency move into the flat
// 'transfer_entre_cuentas'. With "monedas extra libres" (S17), the label has
// to name the currency the user actually moved.
//
// The legacy USD keys stay: 'compra de dólares' is the label the owner uses
// today, and Intl would render the generic pair as 'dólar estadounidense',
// which is worse. So every USD-vs-local pair keeps the exact current keys and
// only the NEW pairs move to the parameterized keys.
//
// The renderer contract (HomePage recent-activity rendering t(detalle)): the
// returned JSON string {"key","params"} carries the ISO CODE as `moneda`; the
// caller resolves the human name with currencyName(code, lang). See
// renderTransferDetalle in the renderer side.

const ENTRE_CUENTAS = 'transfer_entre_cuentas'
const COMPRA_DOLARES = 'transfer_compra_dolares'
const VENTA_DOLARES = 'transfer_venta_dolares'

function normalize(code: unknown): string {
  if (code == null) return ''
  return String(code).trim().toUpperCase()
}

/**
 * The `detalle` value for a cross-currency (or same-currency) transfer.
 *
 * Rules (S17, decided with the owner):
 *  - missing local or incomplete data  -> 'transfer_entre_cuentas' (safe default,
 *    same as the legacy backend ELSE branch)
 *  - same currency                     -> 'transfer_entre_cuentas'
 *  - destination != local:
 *      destination USD                 -> legacy 'transfer_compra_dolares'
 *        (any non-USD origin; this matches the legacy cuarentena approver,
 *        which titled EVERY leg into USD as compra_dolares — unifying the
 *        registrar with it, a GBP->USD move finally gets a real label)
 *      any other destination           -> JSON compra de {destino}; the naming
 *        follows the DESTINATION: USD->GBP is 'compra de libras' — the owner's
 *        preview — not 'venta de dolares'
 *  - destination = local (foreign origin):
 *      origin USD                      -> legacy 'transfer_venta_dolares'
 *      any other origin                -> JSON venta de {origen}
 */
export function buildTransferDetalle(
  originCurrency: string | null | undefined,
  destinationCurrency: string | null | undefined,
  localCurrency: string | null | undefined
): string {
  const origen = normalize(originCurrency)
  const destino = normalize(destinationCurrency)
  const local = normalize(localCurrency)

  if (!origen || !destino || !local) return ENTRE_CUENTAS
  if (origen === destino) return ENTRE_CUENTAS

  if (destino !== local) {
    return destino === 'USD'
      ? COMPRA_DOLARES
      : JSON.stringify({ key: 'transfer_compra_moneda', params: { moneda: destino } })
  }
  return origen === 'USD'
    ? VENTA_DOLARES
    : JSON.stringify({ key: 'transfer_venta_moneda', params: { moneda: origen } })
}

/**
 * Single entry point for every surface that renders a movement title.
 *
 * Plain labels (`cat_clothing`, `type_opening`, `initial_balance`, …) are i18n
 * KEYS and must be translated; only a JSON payload carries its own key plus
 * params. Owner bug (tanda 5): the renderers called parseTransferDetalle
 * directly, whose non-JSON branch returns the string untouched — every plain
 * category rendered as a raw key.
 */
export function translateDetalle(
  detalle: string | null | undefined,
  translate: (key: string, params: Record<string, string>) => string
): string {
  const value = String(detalle ?? '')
  if (!value) return ''
  if (!value.startsWith('{')) return translate(value, {})
  return parseTransferDetalle(value, translate)
}

/**
 * Renderer-side helper for any surface that shows `detalle` through t().
 * Plain keys (legacy + same-currency) pass through untouched; a JSON payload
 * built by buildTransferDetalle resolves its `moneda` CODE through the
 * callback (the caller decides how to name a currency in its language).
 * Anything that looks like JSON but does not parse keeps the raw string —
 * never a silent invention.
 */
export function parseTransferDetalle(
  detalle: string,
  resolve: (key: string, params: Record<string, string>) => string
): string {
  const value = String(detalle ?? '')
  if (!value.startsWith('{')) return value
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && typeof parsed.key === 'string' && parsed.key) {
      const params: Record<string, string> = {}
      if (parsed.params && typeof parsed.params === 'object') {
        for (const [k, v] of Object.entries(parsed.params as Record<string, unknown>)) {
          params[k] = String(v ?? '')
        }
      }
      return resolve(parsed.key, params)
    }
    return value
  } catch {
    return value
  }
}