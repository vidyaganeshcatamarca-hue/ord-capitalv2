import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const EVENT_NAME = 'hide-amounts-changed'
const SESSION_OVERRIDE_KEY = 'ocultar_montos_eye_override'

function getLocalStorageKey(userId?: string): string {
  return userId ? `ocultar_montos:${userId}` : 'ocultar_montos:global'
}

export function getPersistentHideState(userId?: string): boolean {
  const key = getLocalStorageKey(userId)
  const localVal = localStorage.getItem(key) || localStorage.getItem('ocultar_montos:global')
  return localVal === 'true'
}

export function getSessionOverride(): 'show' | 'hide' | null {
  const val = sessionStorage.getItem(SESSION_OVERRIDE_KEY)
  if (val === 'show' || val === 'hide') return val
  return null
}

/** 
 * Hook para gestionar la ocultación de montos sensibles:
 * - Ajustes (Persistente DB / localStorage): Define si por defecto la app inicia con montos ocultos o visibles.
 * - Ojito de Inicio (Sesión / sessionStorage): Permite conmutar (mostrar u ocultar) los valores en la sesión actual
 *   incluso si Ajustes tiene montos ocultos de forma permanente.
 * - Al cerrar y reabrir la app, se respeta estrictamente la configuración guardada en Ajustes/DB.
 */
export function useHideAmounts(userId?: string) {
  const [persistentHide, setPersistentHideState] = useState<boolean>(() => getPersistentHideState(userId))
  const [sessionOverride, setSessionOverrideState] = useState<'show' | 'hide' | null>(() => getSessionOverride())

  const syncStates = useCallback(() => {
    setPersistentHideState(getPersistentHideState(userId))
    setSessionOverrideState(getSessionOverride())
  }, [userId])

  useEffect(() => {
    syncStates()
    window.addEventListener(EVENT_NAME, syncStates)
    window.addEventListener('storage', syncStates)
    return () => {
      window.removeEventListener(EVENT_NAME, syncStates)
      window.removeEventListener('storage', syncStates)
    }
  }, [syncStates])

  // Cálculo del estado visual efectivo final
  const hideAmounts = sessionOverride === 'show'
    ? false
    : sessionOverride === 'hide'
      ? true
      : persistentHide

  /** 
   * Conmuta el ojito temporal para la sesión actual:
   * Permite ver u ocultar valores durante la sesión activa sin alterar la base de datos.
   */
  const toggleEyeHide = useCallback(() => {
    const currentEffective = sessionOverride === 'show'
      ? false
      : sessionOverride === 'hide'
        ? true
        : getPersistentHideState(userId)

    const nextOverride: 'show' | 'hide' = currentEffective ? 'show' : 'hide'
    
    sessionStorage.setItem(SESSION_OVERRIDE_KEY, nextOverride)
    setSessionOverrideState(nextOverride)
    window.dispatchEvent(new Event(EVENT_NAME))
  }, [userId, sessionOverride])

  /** 
   * Actualiza la preferencia permanente desde Ajustes / Apariencia (guarda en DB y localStorage) 
   */
  const updatePersistentHide = useCallback(async (nextValue: boolean) => {
    const localKey = getLocalStorageKey(userId)
    localStorage.setItem(localKey, String(nextValue))
    localStorage.setItem('ocultar_montos:global', String(nextValue))
    setPersistentHideState(nextValue)
    
    // Al cambiar la configuración en Ajustes, se reinicia el override temporal de la sesión
    sessionStorage.removeItem(SESSION_OVERRIDE_KEY)
    setSessionOverrideState(null)
    
    window.dispatchEvent(new Event(EVENT_NAME))

    if (userId) {
      try {
        await supabase.rpc('fn_actualizar_preferencia_usuario', { p_ocultar_montos: nextValue })
      } catch {
        // Ignorar error de red en background
      }
    }
  }, [userId])

  return {
    hideAmounts,
    isPersistentHide: persistentHide,
    toggleEyeHide,
    updatePersistentHide
  }
}
