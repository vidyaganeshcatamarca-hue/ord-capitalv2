import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const EVENT_NAME = 'hide-amounts-changed'
const SESSION_EYE_KEY = 'ocultar_montos_eye_session'

function getLocalStorageKey(userId?: string): string {
  return userId ? `ocultar_montos:${userId}` : 'ocultar_montos:global'
}

/** Devuelve la preferencia permanente configurada en Ajustes / localStorage */
export function getPersistentHideState(userId?: string): boolean {
  const key = getLocalStorageKey(userId)
  const localVal = localStorage.getItem(key) || localStorage.getItem('ocultar_montos:global')
  return localVal === 'true'
}

/** Devuelve el estado temporal del ojito en la sesión actual (sessionStorage) */
export function getSessionEyeHideState(): boolean {
  return sessionStorage.getItem(SESSION_EYE_KEY) === 'true'
}

/** 
 * Hook para gestionar la ocultación de montos sensibles con dos capas:
 * 1. Ojo de Inicio: Ocultación temporal de la sesión (sessionStorage), NO toca Supabase.
 * 2. Ajustes / Apariencia: Ocultación permanente (localStorage + Supabase RPC).
 */
export function useHideAmounts(userId?: string) {
  const [persistentHide, setPersistentHideState] = useState<boolean>(() => getPersistentHideState(userId))
  const [sessionEyeHide, setSessionEyeHideState] = useState<boolean>(() => getSessionEyeHideState())

  const syncStates = useCallback(() => {
    setPersistentHideState(getPersistentHideState(userId))
    setSessionEyeHideState(getSessionEyeHideState())
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

  /** Conmuta el ojito temporal de Inicio (solo afecta la sesión actual, no modifica la DB) */
  const toggleEyeHide = useCallback(() => {
    const nextState = !getSessionEyeHideState()
    sessionStorage.setItem(SESSION_EYE_KEY, String(nextState))
    setSessionEyeHideState(nextState)
    window.dispatchEvent(new Event(EVENT_NAME))
  }, [])

  /** Actualiza la preferencia permanente en Ajustes / Apariencia (guarda en localStorage y Supabase) */
  const updatePersistentHide = useCallback(async (nextValue: boolean) => {
    const localKey = getLocalStorageKey(userId)
    localStorage.setItem(localKey, String(nextValue))
    localStorage.setItem('ocultar_montos:global', String(nextValue))
    setPersistentHideState(nextValue)
    window.dispatchEvent(new Event(EVENT_NAME))

    if (userId) {
      try {
        await supabase.rpc('fn_actualizar_preferencia_usuario', { p_ocultar_montos: nextValue })
      } catch {
        // Ignorar error de red en background
      }
    }
  }, [userId])

  // Los datos sensibles se ocultan si la preferencia permanente está activa O si el ojito temporal de la sesión está activado.
  const hideAmounts = persistentHide || sessionEyeHide

  return {
    hideAmounts,
    isPersistentHide: persistentHide,
    isEyeHidden: sessionEyeHide,
    toggleEyeHide,
    updatePersistentHide
  }
}
