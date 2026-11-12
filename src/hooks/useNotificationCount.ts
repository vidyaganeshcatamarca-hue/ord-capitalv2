// src/hooks/useNotificationCount.ts
// Un solo numero para la campanita, en cualquier pantalla.
//
// Suma los avisos operativos sin leer (fn_notificaciones_contar, que devuelve un
// numero y no 50 filas) y las alertas activas (fn_reporte_alertas_home). Antes el
// Home contaba filas de alertas y el SideNav contaba avisos, asi que el mismo
// icono mostraba dos cifras distintas segun donde estuviera montado.
//
// El refresco conserva el patron que ya tenia: cada 5 minutos, al volver a la
// pestana y al cambiar de ruta. Nada de intervalos agresivos.

import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { t } from '@/locales/i18n'
import {
  derivarAlertasFilas,
  filasVisiblesAlertas,
  leerDescartesAlertas,
  type AlertasHome,
} from '@/lib/alertas'

const POLL_MS = 5 * 60 * 1000

interface Opciones {
  /** En el Home las alertas ya se cargan aparte: no hace falta pedirlas dos veces. */
  conAlertas?: boolean
}

export function useNotificationCount({ conAlertas = true }: Opciones = {}) {
  const [avisos, setAvisos] = useState(0)
  const [alertas, setAlertas] = useState(0)
  const location = useLocation()

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('fn_notificaciones_contar')
      if (!error) setAvisos(Number(data) || 0)
    } catch {
      // Silencioso: el badge se queda en su ultimo valor conocido.
    }

    if (!conAlertas) return

    try {
      const { data, error } = await supabase.rpc('fn_reporte_alertas_home')
      if (!error) {
        const filas = derivarAlertasFilas(data as AlertasHome, t)
        setAlertas(filasVisiblesAlertas(filas, leerDescartesAlertas()).length)
      }
    } catch {
      // Idem: un fallo de alertas no debe romper el conteo de avisos.
    }
  }, [conAlertas])

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

  return { count: avisos + alertas, avisos, alertas, refresh }
}
