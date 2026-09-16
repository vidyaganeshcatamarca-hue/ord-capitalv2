import { ReactNode, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSessionTracker } from '@/hooks/useSessionTracker'
import { telemetry } from '@/lib/telemetry'

function SessionTrackerInner({ children }: { children: ReactNode }) {
  const { sessionId } = useSessionTracker()
  const { user } = useAuth()

  // Telemetry runs only for authenticated users; events are namespaced and
  // attributed to the logged-in user (privacy: PRD §4.2).
  useEffect(() => {
    telemetry.setEnabled(true)
    telemetry.setIdentity(user?.id ?? null, sessionId)
    return () => {
      // Logout / unmount: flush, persist to the user's namespace, reset
      // session-scoped dedup so a second session reports correctly.
      telemetry.flush()
      telemetry.endSession()
      telemetry.setEnabled(false)
    }
  }, [sessionId, user?.id])

  return <>{children}</>
}

export function SessionTrackerProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  if (!session) return <>{children}</>
  return <SessionTrackerInner>{children}</SessionTrackerInner>
}