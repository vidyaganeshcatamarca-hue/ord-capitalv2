// src/hooks/useGastosRecurrentes.ts
// CRUD de gastos recurrentes. Sigue el patrón de src/hooks/useReminders.ts:
// supabase.rpc + recarga tras cada mutación, sin react-query.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { GastoRecurrenteInput, GastoRecurrenteRow, MotivoPausa } from '@/lib/gastosRecurrentes'

export function useGastosRecurrentes() {
  const [items, setItems] = useState<GastoRecurrenteRow[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('fn_listar_gastos_recurrentes')
      if (error) throw error
      setItems(Array.isArray(data) ? (data as GastoRecurrenteRow[]) : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(async (input: GastoRecurrenteInput) => {
    const { data, error } = await supabase.rpc('fn_crear_gasto_recurrente', {
      p_estructura_egreso_id: input.estructura_egreso_id,
      p_nombre_custom: input.nombre_custom,
      p_monto_base: input.monto_base,
      p_dia_del_mes: input.dia_del_mes ?? null,
      p_frecuencia: input.frecuencia ?? null,
      p_tipo_variabilidad: input.tipo_variabilidad,
      p_billetera_defecto_id: input.billetera_defecto_id,
      p_modo: input.modo,
      p_dias_semana: input.dias_semana,
      p_dias_mes: input.dias_mes,
      p_fechas_anio: input.fechas_anio,
      p_fecha_unica: input.fecha_unica ?? null,
      p_fecha_fin: input.fecha_fin ?? null,
      p_tarjeta_id: input.tarjeta_id ?? null,
      p_es_usd: input.es_usd ?? false,
    })
    if (error) throw error
    await refresh()
    return data as number
  }, [refresh])

  const update = useCallback(async (id: number, input: GastoRecurrenteInput) => {
    const { error } = await supabase.rpc('fn_editar_gasto_recurrente', {
      p_recurrente_id: id,
      p_nombre_custom: input.nombre_custom,
      p_monto_base: input.monto_base,
      p_dia_del_mes: input.dia_del_mes ?? null,
      p_frecuencia: input.frecuencia ?? null,
      p_tipo_variabilidad: input.tipo_variabilidad,
      p_billetera_defecto_id: input.billetera_defecto_id,
      p_activo: true,
      p_modo: input.modo,
      p_dias_semana: input.dias_semana,
      p_dias_mes: input.dias_mes,
      p_fechas_anio: input.fechas_anio,
      p_motivo_pausa: null,
      p_fecha_unica: input.fecha_unica ?? null,
      p_fecha_fin: input.fecha_fin ?? null,
      p_tarjeta_id: input.tarjeta_id ?? null,
      p_es_usd: input.es_usd ?? false,
    })
    if (error) throw error
    await refresh()
  }, [refresh])

  /**
   * Pausar es reversible: la fila y sus ocurrencias quedan (RN-32, RN-40).
   * Usa una RPC que toca solo `activo`, `motivo_pausa` y `pausado_at`, para no
   * reenviar la fila entera y no perder el nombre propio ni la billetera.
   */
  const pause = useCallback(async (
    id: number,
    motivo: MotivoPausa = 'pausado_por_usuario',
  ) => {
    const { error } = await supabase.rpc('fn_pausar_gasto_recurrente', {
      p_recurrente_id: id,
      p_activo: false,
      p_motivo_pausa: motivo,
    })
    if (error) throw error
    await refresh()
  }, [refresh])

  /** Reactivar limpia el motivo de la pausa. */
  const resume = useCallback(async (id: number) => {
    const { error } = await supabase.rpc('fn_pausar_gasto_recurrente', {
      p_recurrente_id: id,
      p_activo: true,
      p_motivo_pausa: null,
    })
    if (error) throw error
    await refresh()
  }, [refresh])

  /**
   * Borrado DEFINITIVO (R-GR-46). No usar para «hoy no»: para eso está `pause`.
   * Devuelve cuántas ocurrencias pendientes se perdieron.
   */
  const remove = useCallback(async (id: number) => {
    const { data, error } = await supabase.rpc('fn_borrar_gasto_recurrente', {
      p_recurrente_id: id,
    })
    if (error) throw error
    await refresh()
    return (data as number) ?? 0
  }, [refresh])

  return { items, loading, refresh, create, update, pause, resume, remove }
}
