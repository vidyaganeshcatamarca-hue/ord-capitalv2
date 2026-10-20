// src/contexts/AppLockContext.tsx
// App-lock state owner (feature: pin-huella, task T3 + T5 wiring).
//
// Owns: fetching the server-side PIN state, arming the lock on cold start and
// on returns from background (>1 min, S5), and every lock resolution call
// (verify / define / deactivate / biometric re-arm). Policy math lives ONLY in
// src/lib/appLock.ts (imported, never reimplemented — contract test).
//
// Backend live (T5 deployed with owner authorization): the RPCs exist and are
// smoke-verified (temp_sql/74b). Server contract (S6/S7):
//   fn_tiene_pin()           → { estado, bloqueado_hasta }
//   fn_verificar_pin(p)      → { ok, intentos_fallidos, estado, bloqueado_hasta }
//                              (RAISE only on misuse; the attempt counter is a
//                              returned row, never an exception)
//   fn_configurar_pin(p, a?) → void (RAISE on wrong current PIN / weak / format)
//   fn_reactivar_pin()       → void (biometry cancels an ACTIVE window, S7)
//   fn_desactivar_pin(a)     → void (RAISE unless the current PIN matches, S8)

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { rpc } from '@/lib/supabase'
import {
  backgroundReturnLocks,
  resolveLockState,
  statusRefreshArmsLock,
  retryBackoffSeconds,
  type LockState,
  type PinServerState,
  type StatusRefreshMode,
} from '@/lib/appLock'
import {
  biometriaHabilitadaEnEsteDispositivo,
  desbloquearConBiometria,
} from '@/lib/biometricAppLock'

/**
 * T5 sentinel — the PIN RPCs are deployed and smoke-verified (owner-authorized
 * SQL, 13/13 smokes). Every action in this file now talks to the server.
 */
export const PIN_BACKEND_ENABLED = true

// RPC names (spec S9; deployed see funcionesSQL mirrors).
export const RPC_PIN_ESTADO = 'fn_tiene_pin'
export const RPC_PIN_VERIFICAR = 'fn_verificar_pin'
export const RPC_PIN_CONFIGURAR = 'fn_configurar_pin'
export const RPC_PIN_REACTIVAR = 'fn_reactivar_pin'
export const RPC_PIN_DESACTIVAR = 'fn_desactivar_pin'

interface FnTienePinRow {
  estado: PinServerState
  bloqueado_hasta?: string | null
}

interface FnVerificarPinRow {
  ok: boolean
  intentos_fallidos?: number | null
  estado?: PinServerState
  bloqueado_hasta?: string | null
}

export interface PinVerifyResult {
  ok: boolean
  reason: 'unavailable' | 'pin_incorrecto' | 'pin_actual_incorrecto' | 'en_cooldown' | 'reset_pending' | 'pin_debil' | 'error' | null
  /** Attempts count reported by the server after a failed attempt. */
  attempts?: number
  /** Backoff the caller must honor after this failure (seconds; from lib). */
  backoffSeconds?: number | null
  /** True when the server reports the lockout window. */
  lockout?: boolean
}

interface AppLockState {
  /** Server-resolved presentation state (S6/S7 mapping). Null while loading. */
  lockState: LockState | null
  /** Whether the lock overlay is presented right now. */
  locked: boolean
  /** Attempts rejected since the last success (for the lock screen hint). */
  attempts: number
  /** Non-null while the caller must wait before the next PIN attempt. */
  waitingBackoffSeconds: number | null
  /** Biometry enabled on THIS device (per-device opt-in, S4). */
  biometriaEnDispositivo: boolean
  refreshStatus: (options?: { mode?: StatusRefreshMode }) => Promise<void>
  verifyPin: (pin: string) => Promise<PinVerifyResult>
  /** Define/activate a new PIN; when the old one is active it must be passed. */
  definePin: (pin: string, pinActual?: string | null) => Promise<PinVerifyResult>
  /** S8 — quit the protection; demands the current PIN (server-verified). */
  deactivatePin: (pinActual: string) => Promise<PinVerifyResult>
  /** Register biometry for this device (local credential; S4). */
  setBiometriaEnDispositivo: (enabled: boolean) => void
  unlockWithBiometria: () => Promise<PinVerifyResult>
}

const AppLockContext = createContext<AppLockState | null>(null)

export function useAppLock(): AppLockState {
  const ctx = useContext(AppLockContext)
  if (!ctx) throw new Error('useAppLock fuera de AppLockProvider')
  return ctx
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [serverEstado, setServerEstado] = useState<PinServerState | null>(null)
  const [bloqueadoHasta, setBloqueadoHasta] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [waitingBackoffSeconds, setWaitingBackoffSeconds] = useState<number | null>(null)
  const [biometriaEnDispositivo, setBiometriaEnDispositivo] = useState(false)
  const goneBackgroundAt = useRef<number | null>(null)
  // Guard against visibility fires before the first status fetch resolves.
  const estadoRef = useRef<PinServerState | null>(null)

  const refreshStatus = useCallback(async (options?: { mode?: StatusRefreshMode }) => {
    if (!session) {
      setServerEstado(null)
      setBloqueadoHasta(null)
      setLocked(false)
      return
    }
    try {
      const data = await rpc<FnTienePinRow | FnTienePinRow[]>(RPC_PIN_ESTADO)
      const row = Array.isArray(data) ? data[0] : data
      const estado: PinServerState = row?.estado ?? 'sin_pin'
      estadoRef.current = estado
      setServerEstado(estado)
      setBloqueadoHasta(row?.bloqueado_hasta ?? null)
      // S5 — cold start with a session and an enforcing state: present the lock.
      // A silent refresh (issued after a correct PIN) must NOT re-arm it, or the
      // overlay comes back right after unlocking and the user is trapped.
      if (statusRefreshArmsLock(options?.mode ?? 'arm', estado)) {
        setLocked(true)
        setAttempts(0)
      }
    } catch {
      // Fail closed (lib contract): unknown server response → locked. A silent
      // refresh keeps the resolution: the server already accepted that PIN, so a
      // status hiccup must not throw the user back to the lock screen.
      estadoRef.current = 'activa'
      setServerEstado('activa')
      if (statusRefreshArmsLock(options?.mode ?? 'arm', 'activa')) setLocked(true)
    }
  }, [session])

  useEffect(() => {
    setBiometriaEnDispositivo(biometriaHabilitadaEnEsteDispositivo())
    void refreshStatus({ mode: 'arm' })
    return () => {
      goneBackgroundAt.current = null
      estadoRef.current = null
    }
  }, [refreshStatus])

  // S5 — re-arm on return from background after more than 1 minute.
  useEffect(() => {
    if (!session) return
    const onHidden = () => {
      if (document.visibilityState === 'hidden') goneBackgroundAt.current = Date.now()
    }
    const onShown = () => {
      if (document.visibilityState !== 'visible') return
      const went = goneBackgroundAt.current
      goneBackgroundAt.current = null
      const estado = estadoRef.current
      const active = estado === 'activa' || estado === 'en_cooldown'
      if (went != null && active && backgroundReturnLocks(went, Date.now())) {
        setLocked(true)
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    document.addEventListener('visibilitychange', onShown)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      document.removeEventListener('visibilitychange', onShown)
    }
  }, [session])

  const verifyPin = useCallback(
    async (pin: string): Promise<PinVerifyResult> => {
      if (!session || !PIN_BACKEND_ENABLED) return { ok: false, reason: 'unavailable' }
      try {
        const data = await rpc<FnVerificarPinRow | FnVerificarPinRow[]>(RPC_PIN_VERIFICAR, { p_pin: pin })
        const row = Array.isArray(data) ? data[0] : data
        if (row?.ok === true) {
          setAttempts(0)
          setWaitingBackoffSeconds(null)
          setLocked(false)
          // Silent: the PIN was just accepted, refreshing the status must not
          // re-arm the overlay (estado stays 'activa' — that is the point).
          await refreshStatus({ mode: 'silent' })
          return { ok: true, reason: null }
        }
        const estado = row?.estado ?? 'activa'
        const total = Number(row?.intentos_fallidos) || 0
        if (estado === 'en_cooldown') {
          await refreshStatus({ mode: 'arm' })
          return { ok: false, reason: 'en_cooldown', attempts: total, lockout: true }
        }
        if (estado === 'restaurar') {
          await refreshStatus({ mode: 'arm' })
          return { ok: false, reason: 'reset_pending' }
        }
        setAttempts(total)
        const backoff = retryBackoffSeconds(total)
        setWaitingBackoffSeconds(backoff)
        return { ok: false, reason: 'pin_incorrecto', attempts: total, backoffSeconds: backoff, lockout: backoff == null }
      } catch (err: any) {
        // RAISE paths: unauthorized / no pin / misuse format.
        await refreshStatus({ mode: 'arm' })
        return { ok: false, reason: 'error' }
      }
    },
    [session, refreshStatus],
  )

  const definePin = useCallback(
    async (pin: string, pinActual?: string | null): Promise<PinVerifyResult> => {
      if (!session || !PIN_BACKEND_ENABLED) return { ok: false, reason: 'unavailable' }
      try {
        // servidor: 'restaurar' no exige el viejo; 'activa' exige p_pin_actual (S8)
        await rpc(RPC_PIN_CONFIGURAR, { p_pin: pin, p_pin_actual: pinActual ?? null })
        setAttempts(0)
        setWaitingBackoffSeconds(null)
        setLocked(false)
        await refreshStatus({ mode: 'silent' })
        return { ok: true, reason: null }
      } catch (err: any) {
        const message = String(err?.message ?? '')
        if (message.includes('pin_actual_incorrecto')) {
          return { ok: false, reason: 'pin_actual_incorrecto' }
        }
        if (message.includes('pin_debil')) {
          return { ok: false, reason: 'pin_debil' }
        }
        if (message.includes('en_cooldown')) {
          await refreshStatus({ mode: 'arm' })
          return { ok: false, reason: 'en_cooldown', lockout: true }
        }
        if (message.includes('pin_nuevo_requerido')) {
          await refreshStatus({ mode: 'arm' })
          return { ok: false, reason: 'reset_pending' }
        }
        return { ok: false, reason: 'error' }
      }
    },
    [session, refreshStatus],
  )

  const deactivatePin = useCallback(
    async (pinActual: string): Promise<PinVerifyResult> => {
      if (!session || !PIN_BACKEND_ENABLED) return { ok: false, reason: 'unavailable' }
      try {
        await rpc(RPC_PIN_DESACTIVAR, { p_pin_actual: pinActual })
        setAttempts(0)
        setWaitingBackoffSeconds(null)
        await refreshStatus({ mode: 'silent' })
        return { ok: true, reason: null }
      } catch (err: any) {
        const message = String(err?.message ?? '')
        if (message.includes('pin_actual_incorrecto')) {
          return { ok: false, reason: 'pin_actual_incorrecto' }
        }
        if (message.includes('en_cooldown')) {
          await refreshStatus({ mode: 'arm' })
          return { ok: false, reason: 'en_cooldown', lockout: true }
        }
        if (message.includes('pin_nuevo_requerido')) {
          await refreshStatus({ mode: 'arm' })
          return { ok: false, reason: 'reset_pending' }
        }
        return { ok: false, reason: 'error' }
      }
    },
    [session, refreshStatus],
  )

  const unlockWithBiometria = useCallback(async (): Promise<PinVerifyResult> => {
    if (!session || !PIN_BACKEND_ENABLED || !biometriaHabilitadaEnEsteDispositivo()) {
      return { ok: false, reason: 'unavailable' }
    }
    const verified = await desbloquearConBiometria()
    if (!verified) return { ok: false, reason: 'error' }
    try {
      // S7 — biometric success proves the owner on this device: re-arm the PIN.
      await rpc(RPC_PIN_REACTIVAR)
      // Owner bug (tanda 9): this used to rely on the status refresh to drop the
      // overlay, but a silent refresh deliberately does NOT touch `locked` — so
      // the accepted fingerprint left the lock screen up and every new attempt
      // re-ran into it ("ingresa la huella y vuelve a quedar trabado"). Same
      // trap as tanda 4 bug 1, on the biometry path.
      setAttempts(0)
      setWaitingBackoffSeconds(null)
      setLocked(false)
      await refreshStatus({ mode: 'silent' })
      return { ok: true, reason: null }
    } catch {
      return { ok: false, reason: 'error' }
    }
  }, [session, refreshStatus])

  const lockState = useMemo<LockState | null>(() => {
    if (!session || serverEstado == null) return null
    return resolveLockState(serverEstado, bloqueadoHasta, new Date())
  }, [session, serverEstado, bloqueadoHasta])

  const value = useMemo<AppLockState>(
    () => ({
      lockState,
      locked: locked && serverEstado != null,
      attempts,
      waitingBackoffSeconds,
      biometriaEnDispositivo,
      refreshStatus,
      verifyPin,
      definePin,
      deactivatePin,
      setBiometriaEnDispositivo: (enabled: boolean) => setBiometriaEnDispositivo(enabled),
      unlockWithBiometria,
    }),
    [lockState, locked, attempts, waitingBackoffSeconds, biometriaEnDispositivo, refreshStatus, verifyPin, definePin, deactivatePin, unlockWithBiometria],
  )

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
}