// src/hooks/useReminders.ts
// Polling 1h + visibilitychange + route change para recordatorios.

import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { ReminderInput } from '@/lib/reminders'
import { syncAllReminders } from '@/lib/reminders'

const POLL_MS = 60 * 60 * 1000

interface ReminderRow {
  recordatorio_id: number
  titulo: string
  descripcion: string | null
  hora: string
  dias_semana: string[] | null
  recurrente: boolean
  fecha_unica: string | null
  activo: boolean
}

function toReminderInput(r: ReminderRow): ReminderInput {
  return {
    id: r.recordatorio_id,
    titulo: r.titulo,
    descripcion: r.descripcion,
    hora: r.hora,
    diasSemana: r.dias_semana,
    recurrente: r.recurrente,
    fechaUnica: r.fecha_unica,
    activo: r.activo,
  }
}

export function useReminders() {
  const [reminders, setReminders] = useState<ReminderInput[]>([])
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('fn_listar_recordatorios')
      if (error) throw error
      const list = Array.isArray(data) ? (data as ReminderRow[]).map(toReminderInput) : []
      setReminders(list)
      void syncAllReminders(list)
    } catch {
      // Silencioso: el último valor conocido se mantiene.
    } finally {
      setLoading(false)
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

  const create = useCallback(async (input: Omit<ReminderInput, 'id'>) => {
    const { data, error } = await supabase.rpc('fn_crear_recordatorio', {
      p_titulo: input.titulo,
      p_descripcion: input.descripcion ?? null,
      p_hora: input.hora,
      p_recurrente: input.recurrente,
      p_dias_semana: input.diasSemana ?? null,
      p_fecha_unica: input.fechaUnica ?? null,
    })
    if (error) throw error
    await refresh()
    return data as number
  }, [refresh])

  const update = useCallback(async (id: number, input: Omit<ReminderInput, 'id'>) => {
    const { error } = await supabase.rpc('fn_editar_recordatorio', {
      p_recordatorio_id: id,
      p_titulo: input.titulo,
      p_descripcion: input.descripcion ?? null,
      p_hora: input.hora,
      p_recurrente: input.recurrente,
      p_dias_semana: input.diasSemana ?? null,
      p_fecha_unica: input.fechaUnica ?? null,
      p_activo: input.activo,
    })
    if (error) throw error
    await refresh()
  }, [refresh])

  const remove = useCallback(async (id: number) => {
    const { error } = await supabase.rpc('fn_eliminar_recordatorio', { p_recordatorio_id: id })
    if (error) throw error
    await refresh()
  }, [refresh])

  const toggle = useCallback(async (id: number, activo: boolean) => {
    const { error } = await supabase.rpc('fn_toggle_recordatorio', { p_recordatorio_id: id, p_activo: activo })
    if (error) throw error
    await refresh()
  }, [refresh])

  return { reminders, loading, refresh, create, update, remove, toggle }
}
