// src/hooks/useGastosRecurrentes.ts
// CRUD de gastos recurrentes. Sigue el patrón de src/hooks/useReminders.ts:
// supabase.rpc + recarga tras cada mutación, sin react-query.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fechaLocalISO } from '@/lib/fechaLocal'
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
      p_naturaleza: input.naturaleza ?? 'egreso',
      p_estructura_ingreso_id: input.estructura_ingreso_id ?? null,
      p_billetera_destino_id: input.billetera_destino_id ?? null,
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
      // El día del usuario, no el del servidor: la base vive en UTC y a las
      // 22:00 de Argentina ya es mañana. Sin esto, un recurrente que empieza
      // hoy se ancla al mes que viene (y el de una sola vez no se genera nunca).
      p_fecha_base: fechaLocalISO(),
    })
    if (error) throw error
    await refresh()
    return data as number
  }, [refresh])

  // El modal manda TODOS los campos editables; el RPC actualiza ese mismo
  // conjunto. La categoría faltaba en los dos lados: se elegía otra en el
  // modal, se guardaba el resto y la tarjeta seguía con la original.
  const update = useCallback(async (id: number, input: GastoRecurrenteInput) => {
    const { error } = await supabase.rpc('fn_editar_gasto_recurrente', {
      p_recurrente_id: id,
      p_estructura_egreso_id: input.estructura_egreso_id,
      p_naturaleza: input.naturaleza ?? 'egreso',
      p_estructura_ingreso_id: input.estructura_ingreso_id ?? null,
      p_billetera_destino_id: input.billetera_destino_id ?? null,
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
      // Mismo criterio que el alta: el puntero se recalcula desde el día local.
      p_fecha_base: fechaLocalISO(),
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
      // Al reactivar el puntero se recalcula desde HOY; «hoy» es el del usuario.
      p_fecha_base: fechaLocalISO(),
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
