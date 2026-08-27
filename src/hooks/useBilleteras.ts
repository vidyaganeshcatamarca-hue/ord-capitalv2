import { useState, useEffect, useCallback } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { Billetera, BilleteraHealthReport } from '@/types/Billetera'

export type WalletOrder = 'valor' | 'alfabetico'

export function useBilleteras() {
  const { showToast } = useToast()
  const [billeteras, setBilleteras] = useState<Billetera[]>([])
  const [healthReport, setHealthReport] = useState<BilleteraHealthReport[]>([])
  const [loading, setLoading] = useState(true)
  const [ordenBilleteras, setOrdenBilleteras] = useState<WalletOrder>('valor')

  const fetchBilleteras = useCallback(async (orden: WalletOrder) => {
    const res = await rpc<Billetera[]>('fn_obtener_billeteras_ordenadas', { p_orden: orden })
      .catch(() => [] as Billetera[])
    setBilleteras(res ?? [])
  }, [])

  const fetchData = useCallback(async (orden: WalletOrder = ordenBilleteras) => {
    try {
      setLoading(true)
      const [billeterasRes, healthRes] = await Promise.all([
        rpc<Billetera[]>('fn_obtener_billeteras_ordenadas', { p_orden: orden }).catch(() => [] as Billetera[]),
        rpc<BilleteraHealthReport[]>('fn_reporte_salud_billeteras').catch(() => [] as BilleteraHealthReport[])
      ])

      setBilleteras(billeterasRes)
      setHealthReport(healthRes)
    } catch (err: any) {
      showToast('Error al cargar cuentas: ' + (err.message || err), 'error')
    } finally {
      setLoading(false)
    }
  }, [ordenBilleteras, showToast])

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      try {
        const prefs = await rpc<Array<{ orden_billeteras?: WalletOrder | null }>>('fn_obtener_preferencias_usuario')
          .catch(() => [] as Array<{ orden_billeteras?: WalletOrder | null }>)
        const row = Array.isArray(prefs) ? prefs[0] : prefs
        const orden: WalletOrder = (row?.orden_billeteras === 'alfabetico') ? 'alfabetico' : 'valor'
        if (!cancelled) {
          setOrdenBilleteras(orden)
          await fetchData(orden)
        }
      } catch {
        if (!cancelled) await fetchData('valor')
      }
    }
    bootstrap()

    const handleSuccess = () => {
      fetchData()
    }
    const handleOrderChanged = async () => {
      try {
        const prefs = await rpc<Array<{ orden_billeteras?: WalletOrder | null }>>('fn_obtener_preferencias_usuario')
          .catch(() => [] as Array<{ orden_billeteras?: WalletOrder | null }>)
        const row = Array.isArray(prefs) ? prefs[0] : prefs
        const orden: WalletOrder = (row?.orden_billeteras === 'alfabetico') ? 'alfabetico' : 'valor'
        if (!cancelled) {
          setOrdenBilleteras(orden)
          await fetchData(orden)
        }
      } catch {
        if (!cancelled) await fetchData()
      }
    }
    window.addEventListener('movement-added', handleSuccess)
    window.addEventListener('wallet-order-changed', handleOrderChanged)
    return () => {
      cancelled = true
      window.removeEventListener('movement-added', handleSuccess)
      window.removeEventListener('wallet-order-changed', handleOrderChanged)
    }
  }, [fetchData])

  const updateOrdenBilleteras = useCallback(async (nuevo: WalletOrder) => {
    setOrdenBilleteras(nuevo)
    await fetchData(nuevo)
  }, [fetchData])

  return {
    billeteras,
    setBilleteras,
    healthReport,
    loading,
    ordenBilleteras,
    updateOrdenBilleteras,
    fetchData
  }
}

