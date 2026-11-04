// src/hooks/useGenerarRecurrentes.ts
// Dispara el motor de recurrentes al abrir la app: una vez por día y por
// dispositivo. Es fire-and-forget a propósito: el trabajo corre en segundo
// plano y NUNCA se espera en el camino de render.
//
// Por qué acá y no en un cron: el motor resuelve el atraso de UN usuario
// (fn_generar_recurrentes_usuario), así que el costo depende del uso y no del
// padrón. La idempotencia no depende de esta guarda: el servidor tiene el
// puntero `proxima_ocurrencia` y un índice único (recurrente_id, fecha). Esta
// guarda solo evita llamadas de más.

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'recurrentes.ultima_generacion'

/**
 * Día que se está generando AHORA MISMO en este dispositivo. Vive fuera del
 * componente a propósito: StrictMode monta el efecto dos veces y la sesión
 * puede cambiar de identidad durante el arranque; en los dos casos la guarda de
 * localStorage todavía no está escrita (se escribe recién cuando el servidor
 * contesta) y saldrían dos llamadas. Esta bandera las colapsa en una y se
 * libera al terminar, así un error no bloquea el reintento.
 */
let enCurso: string | null = null

/** Fecha local en ISO (YYYY-MM-DD). No usa toISOString: eso devuelve UTC. */
function fechaLocalISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useGenerarRecurrentes() {
  const { session } = useAuth()

  useEffect(() => {
    if (!session?.user) return
    const hoy = fechaLocalISO()
    if (enCurso === hoy) return
    try {
      if (localStorage.getItem(STORAGE_KEY) === hoy) return
    } catch {
      // localStorage bloqueado (modo privado): se llama igual, el servidor dedupe.
    }

    enCurso = hoy
    void (async () => {
      try {
        const { error } = await supabase.rpc('fn_generar_recurrentes_usuario', { p_hoy: hoy })
        // Solo se marca el día cuando el servidor contestó bien. Si falló, la
        // próxima apertura reintenta: el motor es idempotente.
        if (error) return
        try {
          localStorage.setItem(STORAGE_KEY, hoy)
        } catch {
          // sin storage: se reintenta en la próxima apertura, sin daño
        }
      } catch {
        // red caída: se reintenta en la próxima apertura
      } finally {
        if (enCurso === hoy) enCurso = null
      }
    })()
  }, [session])
}
