// src/lib/walletFilters.ts
// Funciones puras de filtrado de billeteras. Extraidas del AddMovementModal
// para poder testearlas sin React.

import type { Billetera } from '@/types/Billetera'

/**
 * Determina si una billetera debe considerarse activa.
 * Si la RPC no devuelve la columna `activa` (campo undefined), se considera
 * activa por default, ya que la RPC `fn_obtener_billeteras_activas` filtra
 * en backend `WHERE activa = true`.
 */
export function isWalletActive(b: Pick<Billetera, 'activa'>): boolean {
  return b.activa !== false
}

export function isWalletAvailableForExpense(
  b: Billetera,
  numericMonto: number
): boolean {
  if (!isWalletActive(b)) return false
  if (b.es_fondo_prevision) return false
  if (numericMonto > 0 && b.saldo_actual < numericMonto) return false
  return true
}

export function isWalletAvailableForTransfer(
  b: Billetera,
  numericMonto: number
): boolean {
  if (!isWalletActive(b)) return false
  if (numericMonto > 0 && b.saldo_actual < numericMonto) return false
  return true
}

export function isWalletAvailableAsDestination(
  b: Billetera,
  origenCurrency: string,
  origenId: number | null
): boolean {
  if (!isWalletActive(b)) return false
  if (b.moneda !== origenCurrency) return false
  if (b.billetera_id === origenId) return false
  return true
}
