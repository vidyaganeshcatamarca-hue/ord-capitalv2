// Money is exclusive between a parent category and its children: if a parent holds
// money, its children cannot, and the other way around. The ceiling (monto_techo) is
// NOT part of this rule — it is superposable and the server never rejects it.
//
// The server enforces the rule in fn_asignar_presupuesto: the first attempt refuses and
// answers with an i18n key plus the numbers the screen needs to ask for confirmation.
// The second attempt, with p_mover_plata = true, moves the money and logs the reason in
// p_presupuestos_historial (movido_al_padre / movido_al_hijo).
//
// This module turns that refusal into data. It is pure and has no UI so the rule can be
// tested without rendering anything.

export type DireccionMovimiento = 'to_parent' | 'from_parent'

export interface ConfirmacionMovimiento {
  direccion: DireccionMovimiento
  /** How many subcategories hold money that would move up to the parent. */
  hijos: number
  /** How much money the parent holds today. */
  plataDelPadre: number
}

/** The keys the server raises when the money has to move, and where it goes. */
const CLAVES: Record<string, DireccionMovimiento> = {
  budget_needs_confirm_move_to_parent: 'to_parent',
  budget_needs_confirm_move_from_parent: 'from_parent',
}

/**
 * Reads the confirmation out of a Supabase error. PostgREST puts the raised text in
 * `error.message`, so the payload is the JSON object that starts somewhere inside it.
 * Returns null for every other error: the caller keeps its own message for those.
 */
export function leerConfirmacionDeMovimiento(err: unknown): ConfirmacionMovimiento | null {
  const raw = String((err as { message?: string })?.message ?? '')
  const inicio = raw.indexOf('{')
  if (inicio === -1) return null
  let parsed: { key?: string; params?: Record<string, unknown> }
  try {
    parsed = JSON.parse(raw.slice(inicio))
  } catch {
    return null
  }
  const direccion = parsed?.key ? CLAVES[parsed.key] : undefined
  if (!direccion) return null
  const params = parsed?.params ?? {}
  const numero = (valor: unknown) => {
    const n = Number(valor)
    return Number.isFinite(n) ? n : 0
  }
  return {
    direccion,
    hijos: numero(params.hijos),
    plataDelPadre: numero(params.plata),
  }
}

export interface TextosConfirmacion {
  titulo: string
  mensaje: string
}

/**
 * The two strings the dialog shows. `monto` is the amount the user is trying to
 * assign — the refusal never carries it, because it comes from the screen.
 */
export function textosDeConfirmacion(
  confirmacion: ConfirmacionMovimiento,
  monto: number,
  traducir: (clave: string, params?: Record<string, unknown>) => string,
  formatearMonto: (n: number) => string,
): TextosConfirmacion {
  const titulo = traducir('budget_move_to_parent_title')
  const mensaje =
    confirmacion.direccion === 'to_parent'
      ? traducir('budget_move_to_parent_msg', {
          monto: formatearMonto(monto),
          hijos: confirmacion.hijos,
        })
      : traducir('budget_move_from_parent_msg', { monto: formatearMonto(monto) })
  return { titulo, mensaje }
}
