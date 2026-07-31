import { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSessionTracker } from '@/hooks/useSessionTracker'

function SessionTrackerInner({ children }: { children: ReactNode }) {
  useSessionTracker()
  return <>{children}</>
}

export function SessionTrackerProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  if (!session) return <>{children}</>
  return <SessionTrackerInner>{children}</SessionTrackerInner>
}
