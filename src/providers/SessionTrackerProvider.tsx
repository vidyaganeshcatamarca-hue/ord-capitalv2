import { ReactNode, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSessionTracker } from '@/hooks/useSessionTracker'
import { telemetry } from '@/lib/telemetry'

function SessionTrackerInner({ children }: { children: ReactNode }) {
  const { sessionId } = useSessionTracker()

  // Bind telemetry events to the current app session; flush pending events
  // when the session ends (component unmounts on logout).
  useEffect(() => {
    telemetry.setSession(sessionId)
  }, [sessionId])

  useEffect(() => {
    return () => {
      telemetry.flush()
    }
  }, [])

  return <>{children}</>
}

export function SessionTrackerProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  if (!session) return <>{children}</>
  return <SessionTrackerInner>{children}</SessionTrackerInner>
}