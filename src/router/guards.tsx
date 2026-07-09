import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

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

