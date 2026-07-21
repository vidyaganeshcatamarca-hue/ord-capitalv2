import { createContext, useContext, useEffect, useState, useMemo, useCallback, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'

interface ModoAppContextType {
  modo: 'simple' | 'avanzado'
  modoGuardado: 'simple' | 'avanzado'
  proDisponible: boolean
  features: Set<string>
  hasFeature: (key: string) => boolean
  activarModoAvanzado: () => Promise<void>
  desactivarModoAvanzado: () => Promise<void>
  loading: boolean
}

const ModoAppContext = createContext<ModoAppContextType | undefined>(undefined)

export function ModoAppProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { showToast } = useToast()
  
  const [modo, setModo] = useState<'simple' | 'avanzado'>('simple')
  const [modoGuardado, setModoGuardado] = useState<'simple' | 'avanzado'>('simple')
  const [proDisponible, setProDisponible] = useState(false)
  const [features, setFeatures] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const fetchModoData = useCallback(async () => {
    if (!session?.user) {
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase.rpc('fn_obtener_modo_app')
      if (error) throw error

      setModo(data.modo || 'simple')
      setModoGuardado(data.modo_guardado || 'simple')
      setProDisponible(data.avanzado_disponible || false)
      setFeatures(new Set(data.features || []))
    } catch (err) {
      console.error('Error loading modo app data:', err)
    } finally {
      setLoading(false)
    }
  }, [session])

  // Refetch when session changes (e.g., login/logout)
  useEffect(() => {
    fetchModoData()
  }, [fetchModoData])

  // Listen to custom event to force refresh (useful if needed later)
  useEffect(() => {
    const handleRefresh = () => fetchModoData()
    window.addEventListener('refresh-modo-app', handleRefresh)
    return () => window.removeEventListener('refresh-modo-app', handleRefresh)
  }, [fetchModoData])

  const hasFeature = useCallback((key: string) => {
    return features.has(key)
  }, [features])

  const activarModoAvanzado = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.rpc('fn_activar_modo_avanzado')
      if (error) {
        if (error.message.includes('error_modo_avanzado_no_disponible')) {
          showToast(t('error_advanced_mode_disabled'), 'error')
        } else {
          showToast('Error al activar el modo avanzado', 'error')
        }
        return
      }
      await fetchModoData()
      showToast('Modo Avanzado activado', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error inesperado', 'error')
    } finally {
      setLoading(false)
    }
  }

  const desactivarModoAvanzado = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.rpc('fn_desactivar_modo_avanzado')
      if (error) {
        showToast('Error al volver al modo simple', 'error')
        return
      }
      await fetchModoData()
      showToast('Modo Simple activado', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error inesperado', 'error')
    } finally {
      setLoading(false)
    }
  }

  const value = useMemo(() => ({
    modo,
    modoGuardado,
    proDisponible,
    features,
    hasFeature,
    activarModoAvanzado,
    desactivarModoAvanzado,
    loading
  }), [modo, modoGuardado, proDisponible, features, hasFeature, loading])

  return (
    <ModoAppContext.Provider value={value}>
      {children}
    </ModoAppContext.Provider>
  )
}

export function useModoApp() {
  const context = useContext(ModoAppContext)
  if (context === undefined) {
    throw new Error('useModoApp must be used within a ModoAppProvider')
  }
  return context
}
