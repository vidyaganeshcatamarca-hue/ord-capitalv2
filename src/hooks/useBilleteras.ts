import { useState, useEffect, useCallback } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { Billetera, BilleteraHealthReport } from '@/types/Billetera'

export function useBilleteras() {
  const { showToast } = useToast()
  const [billeteras, setBilleteras] = useState<Billetera[]>([])
  const [healthReport, setHealthReport] = useState<BilleteraHealthReport[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [billeterasRes, healthRes] = await Promise.all([
        rpc<Billetera[]>('fn_obtener_billeteras_activas').catch(() => [] as Billetera[]),
        rpc<BilleteraHealthReport[]>('fn_reporte_salud_billeteras').catch(() => [] as BilleteraHealthReport[])
      ])

      setBilleteras(billeterasRes)
      setHealthReport(healthRes)
    } catch (err: any) {
      showToast('Error al cargar cuentas: ' + (err.message || err), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchData()

    const handleSuccess = () => {
      fetchData()
    }
    window.addEventListener('movement-added', handleSuccess)
    return () => {
      window.removeEventListener('movement-added', handleSuccess)
    }
  }, [fetchData])

  return {
    billeteras,
    setBilleteras,
    healthReport,
    loading,
    fetchData
  }
}
