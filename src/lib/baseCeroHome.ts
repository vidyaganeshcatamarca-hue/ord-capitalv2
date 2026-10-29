// src/lib/baseCeroHome.ts
// "Base 0 como pantalla de inicio" (feature: ronda 7, S11).
//
// Dueño: "En la sección de ajustes, Datos y operaciones, Presupuesto y ciclo,
// tenemos una opción de hacer base 0 la pantalla de inicio ON/OFF. Cuando está
// en ON debería ser Base 0 el reemplazo del módulo HOME, pasar como primera
// opción del menú, y la pantalla de inicio dejar la segunda, Cuentas pasa a ser
// tercera y Menú sigue siendo el cuarto. [...] Actualmente tenemos la opción,
// pero no está funcionando el comportamiento requerido."
//
// Antes el interruptor solo escribía `localStorage['base_cero_como_inicio']` y
// anunciaba un evento que nadie escuchaba: la opción se guardaba y no cambiaba
// nada. Acá vive la lectura/escritura de esa preferencia, el orden del menú y la
// pantalla de destino; todo puro y testeable. Los consumidores (BottomNav y
// AppLayout) solo se suscriben.

/** Preferencia del dueño. Misma clave que venía usando la pantalla de ajustes. */
export const BASE_CERO_HOME_KEY = 'base_cero_como_inicio'

/** Evento con el que la pantalla de ajustes avisa que cambió la preferencia. */
export const BASE_CERO_HOME_EVENT = 'base-cero-home-changed'

/** La pantalla que reemplaza a HOME cuando la opción está prendida. */
export const BASE_CERO_HOME_PATH = '/presupuesto'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    // Safari en modo privado puede tirar al tocar localStorage: la preferencia
    // simplemente queda en OFF en vez de romper la pantalla.
    return null
  }
}

/** ¿La opción está prendida? Cualquier valor que no sea 'true' es OFF. */
export function readBaseCeroHome(storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false
  try {
    return storage.getItem(BASE_CERO_HOME_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Guarda la preferencia y avisa a las pantallas montadas. El evento se emite
 * siempre, aunque el valor no cambie: es la señal de "releé la preferencia".
 */
export function writeBaseCeroHome(value: boolean, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    storage?.setItem(BASE_CERO_HOME_KEY, String(value))
  } catch {
    return false
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BASE_CERO_HOME_EVENT))
  }
  return true
}

/**
 * Se suscribe a los cambios de la preferencia. Escucha el evento propio y el
 * `storage` del navegador, así dos pestañas abiertas no se contradicen.
 * Devuelve la función para desuscribirse.
 */
export function subscribeBaseCeroHome(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === BASE_CERO_HOME_KEY) onChange()
  }
  window.addEventListener(BASE_CERO_HOME_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(BASE_CERO_HOME_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * Orden de las opciones de la barra inferior (S11).
 *
 * Con la opción prendida, Base 0 pasa a ser la primera y HOME queda segunda:
 *   ON  → ['/presupuesto', '/', '/billeteras', ...]
 *   OFF → el orden recibido, sin tocar nada.
 *
 * Solo mueve las dos primeras posiciones: el resto del orden (y el "Menú", que
 * se dibuja siempre al final) no cambia.
 */
export function orderNavPaths(paths: string[], homeIsBaseCero: boolean): string[] {
  if (!homeIsBaseCero) return paths
  const resto = paths.filter((p) => p !== BASE_CERO_HOME_PATH && p !== '/')
  const hayInicio = paths.includes('/')
  const hayBaseCero = paths.includes(BASE_CERO_HOME_PATH)
  // Si la barra no muestra alguna de las dos, no se inventa: se respeta lo que
  // haya y solo se agrega al frente lo que existe.
  return [hayBaseCero ? BASE_CERO_HOME_PATH : null, hayInicio ? '/' : null, ...resto].filter(
    (p): p is string => p !== null,
  )
}

/**
 * Pantalla en la que tiene que aterrizar la app al abrirse. Con la opción
 * prendida, entrar a HOME redirige a Base 0; cualquier otra ruta se respeta (un
 * link directo a otra pantalla no se pisa).
 */
export function resolveLandingPath(pathname: string, homeIsBaseCero: boolean): string {
  if (!homeIsBaseCero) return pathname
  return pathname === '/' ? BASE_CERO_HOME_PATH : pathname
}
