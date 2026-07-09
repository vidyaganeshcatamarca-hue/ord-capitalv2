// src/hooks/useNotificationCount.ts
// Centraliza el conteo de no leidas para el badge del bell.
// Polling cada 5 minutos + visibilitychange + route change.

import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

const POLL_MS = 5 * 60 * 1000

interface NotificacionRow {
  notificacion_id: number
  leida: boolean
}

export function useNotificationCount() {
  const [count, setCount] = useState(0)
  const location = useLocation()

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('fn_obtener_notificaciones_no_leidas', { p_limit: 50 })
      if (error) throw error
      const rows = Array.isArray(data) ? (data as NotificacionRow[]) : []
      const unread = rows.filter((r) => !r.leida).length
      setCount(unread)
    } catch {
      // Silencioso: el badge se queda en su ultimo valor conocido.
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh, location.pathname])

  return { count, refresh }
}
