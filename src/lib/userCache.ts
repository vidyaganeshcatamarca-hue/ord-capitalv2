/**
 * Memo de una petición cuyo resultado depende del usuario logueado.
 *
 * Dueño, 2026-10-23: entrando con el usuario 20 (login por mail) aparecía la libra
 * del usuario 198, que había sido el anterior en el mismo teléfono. Entrando con
 * Google no pasaba.
 *
 * El motivo no era la base ni el usuario 20: `fetchUserRegion()` memoizaba su
 * promesa en una variable de módulo. Con Google la app hace un redirect completo
 * (`signInWithOAuth`) y el módulo se reinicia; con mail y contraseña
 * (`signInWithPassword`) todo ocurre en la misma SPA, así que la promesa del
 * usuario anterior seguía viva y se le servía al siguiente.
 *
 * La regla: una memo pertenece a UN usuario. Si el usuario cambió, no se reusa.
 */

export interface UserKeyedEntry<T> {
  userId: string
  promise: Promise<T>
}

export function reuseForUser<T>(
  entry: UserKeyedEntry<T> | null | undefined,
  userId: string | null | undefined
): Promise<T> | null {
  if (!entry || !userId) return null
  return entry.userId === userId ? entry.promise : null
}
