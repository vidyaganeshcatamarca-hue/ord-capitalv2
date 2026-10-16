// src/contexts/AppLockContext.tsx
// App-lock state owner (feature: pin-huella, task T3).
//
// Owns: fetching the server-side PIN state, arming the lock on cold start and
// on returns from background (>1 min, S5), and forwarding lock resolution
// (PIN verification / biometric unlock) to the RPCs. Policy math lives ONLY in
// src/lib/appLock.ts (imported, never reimplemented — contract test).
//
// Interim (documented): the PIN RPCs are T5 (gated to the owner's SQL OK).
// Until they exist, PIN_BACKEND_ENABLED is false and every action here is an
// inert no-op returning "unavailable", so the layer can be mounted and wired
// without touching Supabase.

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { rpc } from '@/lib/supabase'
import {
  backgroundReturnLocks,
  resolveLockState,
  retryBackoffSeconds,
  type LockState,
  type PinServerState,
} from '@/lib/appLock'
import {
  biometriaHabilitadaEnEsteDispositivo,
  desbloquearConBiometria,
} from '@/lib/biometricAppLock'

/**
 * T5 sentinel — flips to true in the same work-unit commit that deploys the
 * PIN RPCs (spec S9). While false: no RPC traffic, no lock is presented.
 */
export const PIN_BACKEND_ENABLED = false

// RPC names (spec S9; exact names frozen when the T5 SQL is approved and
// presented for verification before deploy).
export const RPC_PIN_ESTADO = 'fn_tiene_pin'
export const RPC_PIN_VERIFICAR = 'fn_verificar_pin'
export const RPC_PIN_CONFIGURAR = 'fn_configurar_pin'
export const RPC_PIN_REACTIVAR = 'fn_reactivar_pin'

interface FnTienePinRow {
  estado: PinServerState
  bloqueado_hasta?: string | null
}

export interface PinVerifyResult {
  ok: boolean
  reason: 'unavailable' | 'pin_incorrecto' | 'en_cooldown' | 'reset_pending' | 'error' | null
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
  refreshStatus: () => Promise<void>
  verifyPin: (pin: string) => Promise<PinVerifyResult>
  definePin: (pin: string) => Promise<PinVerifyResult>
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

  const refreshStatus = useCallback(async () => {
    if (!session || !PIN_BACKEND_ENABLED) {
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
      // S5 — cold start with a session and an active PIN: present the lock.
      if (estado === 'activa' || estado === 'en_cooldown') setLocked(true)
      if (estado === 'activa' || estado === 'en_cooldown') setAttempts(0)
    } catch {
      // Fail closed (lib contract): unknown server response → locked. The
      // overlay cannot be resolved without the server anyway; degrades to
      // "service unavailable" rather than handing an unlocked app to anyone.
      estadoRef.current = 'activa'
      setServerEstado('activa')
      setLocked(true)
    }
  }, [session])

  useEffect(() => {
    setBiometriaEnDispositivo(biometriaHabilitadaEnEsteDispositivo())
    void refreshStatus()
    return () => {
      goneBackgroundAt.current = null
      estadoRef.current = null
    }
  }, [refreshStatus])

  // S5 — re-arm on return from background after more than 1 minute. The lock
  // applies whenever the account has the PIN active (the resolver decides).
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
      if (!PIN_BACKEND_ENABLED) return { ok: false, reason: 'unavailable' }
      try {
        await rpc(RPC_PIN_VERIFICAR, { p_pin: pin })
        setAttempts(0)
        setWaitingBackoffSeconds(null)
        setLocked(false)
        await refreshStatus()
        return { ok: true, reason: null }
      } catch (err: any) {
        const message = String(err?.message ?? '')
        const serverAttempts = Number(err?.details?.intentos) || 0
        if (message.includes('en_cooldown')) {
          await refreshStatus()
          return { ok: false, reason: 'en_cooldown', lockout: true }
        }
        if (message.includes('pin_incorrecto')) {
          const total = serverAttempts > attempts ? serverAttempts : attempts + 1
          setAttempts(total)
          const backoff = retryBackoffSeconds(total)
          setWaitingBackoffSeconds(backoff)
          if (backoff == null) {
            // Threshold reached: fetch the server-imposed window (24 h).
            await refreshStatus()
            return { ok: false, reason: 'pin_incorrecto', attempts: total, lockout: true }
          }
          return { ok: false, reason: 'pin_incorrecto', attempts: total, backoffSeconds: backoff }
        }
        return { ok: false, reason: 'error' }
      }
    },
    [attempts, refreshStatus],
  )

  const definePin = useCallback(
    async (pin: string): Promise<PinVerifyResult> => {
      if (!PIN_BACKEND_ENABLED) return { ok: false, reason: 'unavailable' }
      try {
        // S7 — after the lockout the server cleared the PIN ('restaurar'):
        // saving a new one here is authorized without the old PIN. When the
        // PIN is otherwise active this same RPC must reject without the old
        // PIN (T5 defines that rule server-side).
        await rpc(RPC_PIN_CONFIGURAR, { p_pin: pin })
        await refreshStatus()
        setAttempts(0)
        setWaitingBackoffSeconds(null)
        setLocked(false)
        return { ok: true, reason: null }
      } catch (err: any) {
        const message = String(err?.message ?? '')
        if (message.includes('en_cooldown')) {
          await refreshStatus()
          return { ok: false, reason: 'en_cooldown', lockout: true }
        }
        return { ok: false, reason: 'error' }
      }
    },
    [refreshStatus],
  )

  const unlockWithBiometria = useCallback(async (): Promise<PinVerifyResult> => {
    if (!PIN_BACKEND_ENABLED || !biometriaHabilitadaEnEsteDispositivo()) {
      return { ok: false, reason: 'unavailable' }
    }
    const verified = await desbloquearConBiometria()
    if (!verified) return { ok: false, reason: 'error' }
    try {
      // S7 — biometric success proves the owner on this device: cancel the
      // lockout and re-arm the PIN (server-side; T5 defines the RPC body).
      await rpc(RPC_PIN_REACTIVAR)
      await refreshStatus()
      return { ok: true, reason: null }
    } catch {
      // Biometry verified but the re-arm RPC failed: still present the lock
      // with the old state; the user can retry or use the PIN.
      return { ok: false, reason: 'error' }
    }
  }, [refreshStatus])

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
      setBiometriaEnDispositivo: (enabled: boolean) => setBiometriaEnDispositivo(enabled),
      unlockWithBiometria,
    }),
    [lockState, locked, attempts, waitingBackoffSeconds, biometriaEnDispositivo, refreshStatus, verifyPin, definePin, unlockWithBiometria],
  )

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
}