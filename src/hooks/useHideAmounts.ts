import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const EVENT_NAME = 'hide-amounts-changed'
const SESSION_KEY = 'ocultar_montos_session'

function getStorageKey(userId?: string): string {
  return userId ? `ocultar_montos:${userId}` : 'ocultar_montos:global'
}

export function getHideAmountsState(userId?: string): boolean {
  const sessionVal = sessionStorage.getItem(SESSION_KEY)
  if (sessionVal !== null) {
    return sessionVal === 'true'
  }
  const localKey = getStorageKey(userId)
  const localVal = localStorage.getItem(localKey) || localStorage.getItem('ocultar_montos:global')
  return localVal === 'true'
}

export function useHideAmounts(userId?: string) {
  const [hideAmounts, setHideAmounts] = useState<boolean>(() => getHideAmountsState(userId))

  useEffect(() => {
    const handleSync = () => {
      setHideAmounts(getHideAmountsState(userId))
    }
    window.addEventListener(EVENT_NAME, handleSync)
    window.addEventListener('storage', handleSync)
    return () => {
      window.removeEventListener(EVENT_NAME, handleSync)
      window.removeEventListener('storage', handleSync)
    }
  }, [userId])

  const toggleHideAmounts = useCallback(async (nextState?: boolean) => {
    const current = getHideAmountsState(userId)
    const valueToSet = nextState !== undefined ? nextState : !current
    
    // Guardar en sessionStorage para mantener durante toda la sesión actual
    sessionStorage.setItem(SESSION_KEY, String(valueToSet))
    
    // Guardar en localStorage
    const localKey = getStorageKey(userId)
    localStorage.setItem(localKey, String(valueToSet))
    localStorage.setItem('ocultar_montos:global', String(valueToSet))

    // Actualizar estado local y notificar evento global
    setHideAmounts(valueToSet)
    window.dispatchEvent(new Event(EVENT_NAME))

    // Sincronizar en DB si hay usuario autenticado
    if (userId) {
      try {
        await supabase.rpc('fn_actualizar_preferencia_usuario', { p_ocultar_montos: valueToSet })
      } catch {
        // ignore background sync error
      }
    }
  }, [userId])

  return { hideAmounts, toggleHideAmounts }
}
