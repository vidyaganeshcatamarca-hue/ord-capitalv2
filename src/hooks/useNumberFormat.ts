import { useCallback, useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'

interface UserFormatPrefs {
  decimales_moneda_local: number
  decimales_segunda_moneda: number
  separador_miles: string
  separador_decimal: string
}

const DEFAULTS: UserFormatPrefs = {
  decimales_moneda_local: 0,
  decimales_segunda_moneda: 1,
  separador_miles: '.',
  separador_decimal: ',',
}

export function useNumberFormat() {
  const [prefs, setPrefs] = useState<UserFormatPrefs>(DEFAULTS)

  useEffect(() => {
    let cancelled = false
    rpc<UserFormatPrefs[]>('fn_obtener_preferencias_usuario')
      .then((data) => {
        if (cancelled) return
        const row = Array.isArray(data) ? data[0] : data
        if (!row) return
        setPrefs({
          decimales_moneda_local: clampInt(row.decimales_moneda_local, 0, 4, 0),
          decimales_segunda_moneda: clampInt(row.decimales_segunda_moneda, 0, 4, 1),
          separador_miles: typeof row.separador_miles === 'string' && row.separador_miles ? row.separador_miles : DEFAULTS.separador_miles,
          separador_decimal: typeof row.separador_decimal === 'string' && row.separador_decimal ? row.separador_decimal : DEFAULTS.separador_decimal,
        })
      })
      .catch(() => {
        // Mantener defaults si la RPC falla.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const formatMonto = useCallback(
    (monto: number | string, moneda: string = 'ARS'): string => {
      const n = typeof monto === 'string' ? parseFloat(monto) : Number(monto)
      if (Number.isNaN(n)) return '-'
      const digits = moneda === 'USD' ? prefs.decimales_segunda_moneda : prefs.decimales_moneda_local
      const fixed = n.toFixed(digits)
      const [intPart, decPart] = fixed.split('.')
      const intWithThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, prefs.separador_miles)
      const symbol = moneda === 'USD' ? 'U$S' : '$'
      if (decPart !== undefined && digits > 0) {
        return `${symbol} ${intWithThousands}${prefs.separador_decimal}${decPart}`
      }
      return `${symbol} ${intWithThousands}`
    },
    [prefs]
  )

  return { formatMonto, prefs }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const i = Math.trunc(n)
  if (i < min) return min
  if (i > max) return max
  return i
}
