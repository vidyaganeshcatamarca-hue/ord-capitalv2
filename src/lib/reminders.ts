// src/lib/reminders.ts
// Servicio de recordatorios personalizados con push diferido (cliente).
// Cifrado/limpieza via Capacitor LocalNotifications.

import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'

export interface ReminderInput {
  id: number
  titulo: string
  descripcion?: string | null
  hora: string // HH:MM:SS
  diasSemana?: string[] | null // ['L','M','X','J','V','S','D']
  recurrente: boolean
  fechaUnica?: string | null // YYYY-MM-DD
  activo: boolean
}

const DAY_MAP: Record<string, number> = { D: 0, L: 1, M: 2, X: 3, J: 4, V: 5, S: 6 }

function localIdFromReminderId(reminderId: number): number {
  // Capacitor LocalNotifications exige id entero; mapeamos 100000+reminderId para evitar colisiones con otras notificaciones.
  return 100000 + reminderId
}

function parseHora(hora: string): { h: number; m: number } {
  const [h = '0', m = '0'] = hora.split(':')
  return { h: Number(h), m: Number(m) }
}

function nextOccurrence(r: ReminderInput, from: Date = new Date()): Date {
  const { h, m } = parseHora(r.hora)
  const target = new Date(from)
  target.setHours(h, m, 0, 0)
  if (target.getTime() <= from.getTime()) target.setDate(target.getDate() + 1)
  if (r.recurrente && r.diasSemana && r.diasSemana.length > 0) {
    for (let i = 0; i < 14; i++) {
      const candidate = new Date(target)
      candidate.setDate(candidate.getDate() + i)
      const dow = candidate.getDay()
      if (r.diasSemana.some((d) => DAY_MAP[d] === dow)) {
        return candidate
      }
    }
  }
  if (!r.recurrente && r.fechaUnica) {
    const [y, mo, d] = r.fechaUnica.split('-').map(Number)
    const oneOff = new Date(from)
    oneOff.setFullYear(y ?? from.getFullYear(), (mo ?? 1) - 1, d ?? 1)
    oneOff.setHours(h, m, 0, 0)
    return oneOff
  }
  return target
}

export async function scheduleReminderPush(r: ReminderInput): Promise<void> {
  if (!r.activo) return
  if (Capacitor.getPlatform() === 'web') return
  const fireAt = nextOccurrence(r)
  const body = r.descripcion?.trim() || 'Toca para abrir la app.'
  const schema: LocalNotificationSchema = {
    id: localIdFromReminderId(r.id),
    title: r.titulo,
    body,
    schedule: { at: fireAt, allowWhileIdle: true },
    smallIcon: 'ic_stat_notification',
    autoCancel: true,
  }
  try {
    await LocalNotifications.schedule({ notifications: [schema] })
  } catch {
    // Permisos denegados o plataforma sin soporte; se ignora silenciosamente.
  }
}

export async function cancelReminderPush(reminderId: number): Promise<void> {
  if (Capacitor.getPlatform() === 'web') return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: localIdFromReminderId(reminderId) }] })
  } catch {
    // Idempotente.
  }
}

export async function syncAllReminders(reminders: ReminderInput[]): Promise<void> {
  if (Capacitor.getPlatform() === 'web') return
  const activeIds = reminders.reduce<number[]>((ids, r) => r.activo ? [...ids, r.id] : ids, [])
  const incomingIds = new Set(activeIds)
  try {
    const { notifications } = await LocalNotifications.getPending()
    const toCancel = (notifications ?? [])
      .filter(n => typeof n.id === 'number' && n.id >= 100000 && !incomingIds.has(n.id - 100000))
      .map(n => LocalNotifications.cancel({ notifications: [{ id: n.id }] }))
    await Promise.all(toCancel)
  } catch {
    // Si getPending no está disponible, simplemente reagendamos.
  }
  await Promise.all(
    reminders.filter(r => r.activo).map(r => scheduleReminderPush(r))
  )
}

export function formatRecurrence(r: ReminderInput): string {
  const hhmm = r.hora.slice(0, 5)
  if (r.recurrente) {
    const days = r.diasSemana ?? []
    if (days.length === 7) return `Diario ${hhmm}`
    if (days.length === 5 && ['L', 'M', 'X', 'J', 'V'].every((d) => days.includes(d))) return `L-V ${hhmm}`
    if (days.length === 1) return `Semanal ${hhmm}`
    return `${days.join(',')} ${hhmm}`
  }
  if (r.fechaUnica) {
    const [y, mo, d] = r.fechaUnica.split('-')
    return `${d}/${mo}/${y?.slice(2)} ${hhmm}`
  }
  return hhmm
}
