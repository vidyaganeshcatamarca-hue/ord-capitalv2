import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useModoApp } from '@/contexts/ModoAppContext'

export function PrivateRoute() {
  const { session, loading, onboardingCompleto } = useAuth()

  if (loading || onboardingCompleto === null) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="skeleton" style={{ width: 120, height: 40, borderRadius: 20 }} />
      </div>
    )
  }

  if (session && !onboardingCompleto) {
    return <Navigate to="/auth" replace />
  }

  return session ? <Outlet /> : <Navigate to="/auth" replace />
}

export function PublicRoute() {
  const { session, loading, onboardingCompleto } = useAuth()

  if (loading || onboardingCompleto === null) return null

  if (session && !onboardingCompleto) {
    // Si tiene sesión pero no completó onboarding, lo dejamos en /auth (donde están los slides)
    return <Outlet />
  }

  return !session ? <Outlet /> : <Navigate to="/" replace />
}

/**
 * Gates a route on a backend feature flag returned by fn_obtener_modo_app.
 * Renders nothing while the mode is loading, redirects home when the feature
 * is not enabled for the current app mode, otherwise renders children.
 */
export function FeatureRoute({ feature, children }: { feature: string; children: ReactNode }) {
  const { hasFeature, loading } = useModoApp()

  if (loading) return null

  if (!hasFeature(feature)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

