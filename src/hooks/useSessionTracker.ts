import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const SESSION_STORAGE_KEY = 'session_tracking_id'
const IDLE_TIMEOUT_MS = 120_000
const IDLE_PENALTY_MS = 105_000

interface AppStateChange {
  isActive: boolean
}

let cachedPlatform: 'web' | 'ios' | 'android' | null = null

function getPlatform(): 'web' | 'ios' | 'android' {
  if (cachedPlatform !== null) return cachedPlatform
  try {
    const { Capacitor } = require('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform()
      if (platform === 'ios') {
        cachedPlatform = 'ios'
        return 'ios'
      }
      if (platform === 'android') {
        cachedPlatform = 'android'
        return 'android'
      }
    }
  } catch {
    // Capacitor core not available, treat as web
  }
  cachedPlatform = 'web'
  return 'web'
}

let cachedVersion: string | null = null

function getAppVersion(): string {
  if (cachedVersion !== null) return cachedVersion
  cachedVersion = import.meta.env.VITE_APP_VERSION ?? 'unknown'
  return cachedVersion
}

export interface UseSessionTrackerResult {
  sessionId: string | null
}

export function useSessionTracker(): UseSessionTrackerResult {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isIdle, setIsIdle] = useState(false)

  const sessionIdRef = useRef<string | null>(null)
  const activeStartRef = useRef<number | null>(null)
  const isIdleRef = useRef(false)
  const idleTimerRef = useRef<number | null>(null)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    isIdleRef.current = isIdle
  }, [isIdle])

  const startSession = useCallback(async () => {
    const platform = getPlatform()
    const appVersion = getAppVersion()
    try {
      const oldSessionId = localStorage.getItem(SESSION_STORAGE_KEY)
      if (oldSessionId) {
        try {
          await supabase.rpc('fn_marcar_crash_sesion', { p_session_id: oldSessionId })
        } catch (err) {
          console.warn('Session crash recovery failed:', err)
        }
        localStorage.removeItem(SESSION_STORAGE_KEY)
      }

      const { data, error } = await supabase.rpc('fn_iniciar_sesion_app', {
        p_platform: platform,
        p_app_version: appVersion,
      })
      if (error) throw error
      if (typeof data === 'string') {
        setSessionId(data)
        sessionIdRef.current = data
        localStorage.setItem(SESSION_STORAGE_KEY, data)
        activeStartRef.current = Date.now()
        setIsIdle(false)
        isIdleRef.current = false
      }
    } catch (err) {
      console.error('Failed to start app session:', err)
    }
  }, [])

  const pauseSession = useCallback(async (penaltyMs = 0) => {
    const currentSessionId = sessionIdRef.current
    const start = activeStartRef.current
    if (!currentSessionId || !start) return
    const elapsedMs = Date.now() - start
    const deltaSegundos = Math.max(0, Math.floor((elapsedMs - penaltyMs) / 1000))
    try {
      const { error } = await supabase.rpc('fn_pausar_sesion_app', {
        p_session_id: currentSessionId,
        p_delta_segundos: deltaSegundos,
      })
      if (error) throw error
    } catch (err) {
      console.warn('Failed to pause app session:', err)
    }
  }, [])

  const resumeSession = useCallback(async () => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return
    try {
      const { error } = await supabase.rpc('fn_reanudar_sesion_app', {
        p_session_id: currentSessionId,
      })
      if (error) throw error
      activeStartRef.current = Date.now()
      setIsIdle(false)
      isIdleRef.current = false
    } catch (err) {
      console.warn('Failed to resume app session:', err)
    }
  }, [])

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
    }
    if (isIdleRef.current) {
      void resumeSession()
    }
    idleTimerRef.current = window.setTimeout(() => {
      setIsIdle(true)
      isIdleRef.current = true
      void pauseSession(IDLE_PENALTY_MS)
    }, IDLE_TIMEOUT_MS)
  }, [pauseSession, resumeSession])

  const sendBeaconEnd = useCallback(() => {
    const currentSessionId = sessionIdRef.current
    const start = activeStartRef.current
    if (!currentSessionId || !start) return
    let deltaSegundos = 0
    if (!isIdleRef.current) {
      const elapsedMs = Date.now() - start
      deltaSegundos = Math.max(0, Math.floor(elapsedMs / 1000))
    }
    const body = JSON.stringify({
      session_id: currentSessionId,
      delta_segundos: deltaSegundos,
    })
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const url = `${supabaseUrl}/rest/v1/rpc/fn_finalizar_sesion_app?apikey=${supabaseKey}`
    try {
      navigator.sendBeacon(url, body)
    } catch (err) {
      console.error('sendBeacon failed:', err)
    }
    localStorage.removeItem(SESSION_STORAGE_KEY)
  }, [])

  // Start session on mount
  useEffect(() => {
    void startSession()
    resetIdleTimer()
    return () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current)
      }
      sendBeaconEnd()
    }
  }, [startSession, resetIdleTimer, sendBeaconEnd])

  // Visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (idleTimerRef.current !== null) {
          window.clearTimeout(idleTimerRef.current)
          idleTimerRef.current = null
        }
        void pauseSession()
      } else {
        void resumeSession()
        resetIdleTimer()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [pauseSession, resumeSession, resetIdleTimer])

  // Capacitor app state change
  useEffect(() => {
    let removeListener: (() => Promise<void>) | null = null
    const init = async () => {
      try {
        const { App } = await import('@capacitor/app')
        const listener = await App.addListener('appStateChange', (state: AppStateChange) => {
          if (state.isActive) {
            void resumeSession()
            resetIdleTimer()
          } else {
            if (idleTimerRef.current !== null) {
              window.clearTimeout(idleTimerRef.current)
              idleTimerRef.current = null
            }
            void pauseSession()
          }
        })
        removeListener = listener.remove
      } catch (err) {
        // Capacitor app plugin not available, ignore
      }
    }
    void init()
    return () => {
      if (removeListener) {
        void removeListener()
      }
    }
  }, [pauseSession, resumeSession, resetIdleTimer])

  // User interaction events
  useEffect(() => {
    const events = ['mousemove', 'touchstart', 'keydown', 'scroll']
    const handler = () => resetIdleTimer()
    events.forEach((event) => {
      window.addEventListener(event, handler, { passive: true })
    })
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handler)
      })
    }
  }, [resetIdleTimer])

  // Before unload / page hide
  useEffect(() => {
    const handleUnload = () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      sendBeaconEnd()
    }
    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
  }, [sendBeaconEnd])

  return { sessionId }
}
