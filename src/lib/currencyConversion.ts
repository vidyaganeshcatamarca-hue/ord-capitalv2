// lib/currencyConversion.ts
// ============================================
// Cross-currency transfer suggestion — pure logic, ZERO imports.
//
// The only exchange rate the app has is `fn_obtener_cotizacion_usd()`, which returns
// **units of the user's local currency per 1 USD** (1515.87 for ARS, 0.8926 for EUR,
// 1 for USD). That single rate is enough to convert between the local currency and USD
// in both directions, and that is exactly the pair a user can hold.
//
// This lived inline inside a React effect and hardcoded 'ARS', so for anyone outside
// Argentina the suggestion silently never appeared: a transfer of 100 EUR to a USD
// wallet asked the user to type the destination amount by hand.
//
// Extracted here so the arithmetic is testable without a browser.

export interface ConversionInput {
  /** Amount leaving the origin wallet. */
  amount: number
  originCurrency: string | null | undefined
  destinationCurrency: string | null | undefined
  /** The user's local currency, from the region. */
  localCurrency: string | null | undefined
  /** Local currency units per 1 USD. */
  usdRate: number | null | undefined
}

const normalize = (code: string | null | undefined): string =>
  typeof code === 'string' ? code.trim().toUpperCase() : ''

/**
 * Amount that should arrive in the destination wallet, or null when there is no rate
 * that answers the question. Null is the honest answer for a pair we cannot convert
 * (for example ARS to EUR: we would need a cross rate we do not have), and the user
 * types the value instead.
 */
export function suggestDestinationAmount(input: ConversionInput): number | null {
  const origin = normalize(input?.originCurrency)
  const destination = normalize(input?.destinationCurrency)
  const local = normalize(input?.localCurrency)
  const rate = Number(input?.usdRate)
  const amount = Number(input?.amount)

  if (!origin || !destination || !local) return null
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (origin === destination) return null
  if (!Number.isFinite(rate) || rate <= 0) return null

  // The rate only relates the local currency and USD.
  const convertible = (code: string): boolean => code === local || code === 'USD'
  if (!convertible(origin) || !convertible(destination)) return null

  // To USD, then out of USD. When the origin already is USD the first step is a no-op,
  // and the same for the destination.
  const amountInUsd = origin === 'USD' ? amount : amount / rate
  const result = destination === 'USD' ? amountInUsd : amountInUsd * rate

  if (!Number.isFinite(result) || result <= 0) return null
  return Math.round(result * 100) / 100
}
