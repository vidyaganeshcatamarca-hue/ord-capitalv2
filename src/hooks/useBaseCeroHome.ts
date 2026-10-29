// src/hooks/useBaseCeroHome.ts
// Lee "Base 0 como pantalla de inicio" y se entera cuando cambia (ronda 7, S11).
//
// La preferencia vive en localStorage y la escribe la pantalla de ajustes; este
// hook la expone como estado reactivo para que la barra de navegación reordene
// sus opciones en el acto y no haya que remontar la app.

import { useSyncExternalStore } from 'react'
import { readBaseCeroHome, subscribeBaseCeroHome } from '@/lib/baseCeroHome'

/**
 * Uso:
 *   const baseCeroComoInicio = useBaseCeroHome()
 */
export function useBaseCeroHome(): boolean {
  return useSyncExternalStore(
    subscribeBaseCeroHome,
    readBaseCeroHome,
    () => false,
  )
}

export default useBaseCeroHome
