import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface HogarEstado {
  tiene_hogar: boolean
  tiene_pareja: boolean
  hogar_id: number | null
  rol: 'creador' | 'invitado' | null
  nombre_hogar: string | null
}

interface HogarContextType {
  estado: HogarEstado | null
  loading: boolean
  refresh: () => Promise<void>
}

const HogarContext = createContext<HogarContextType | null>(null)

export function HogarProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [estado, setEstado] = useState<HogarEstado | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchEstado = useCallback(async () => {
    if (!session) {
      setEstado(null)
      setLoading(false)
      return
    }
    try {
      const { data, error } = await supabase.rpc('fn_verificar_estado_hogar')
      if (error) {
        console.error('Error al verificar estado del hogar:', error)
        setEstado(null)
      } else if (data) {
        setEstado({
          tiene_hogar: Boolean(data.tiene_hogar),
          tiene_pareja: Boolean(data.tiene_pareja),
          hogar_id: data.hogar_id ?? null,
          rol: data.rol ?? null,
          nombre_hogar: data.nombre_hogar ?? null,
        })
      }
    } catch (err) {
      console.error('Error en fetchEstado hogar:', err)
      setEstado(null)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    fetchEstado()
  }, [fetchEstado])

  const value = useMemo(
    () => ({ estado, loading, refresh: fetchEstado }),
    [estado, loading, fetchEstado]
  )

  return (
    <HogarContext.Provider value={value}>
      {children}
    </HogarContext.Provider>
  )
}

export function useHogar() {
  const ctx = useContext(HogarContext)
  if (!ctx) throw new Error('useHogar debe usarse dentro de HogarProvider')
  return ctx
}