import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { HogarProvider } from '@/contexts/HogarContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { ModoAppProvider } from '@/contexts/ModoAppContext'
import { PrivateRoute, PublicRoute } from '@/router/guards'
import { BottomNav } from '@/components/BottomNav/BottomNav'
import { SideNav } from '@/components/SideNav/SideNav'

// Lazy-loaded, but preloaded after app idle because this is the primary quick-capture path.
const loadAddMovementModal = () => import('@/components/AddMovementModal/AddMovementModal').then(m => ({ default: m.AddMovementModal }))
const AddMovementModal = lazy(loadAddMovementModal)
const PerfilPage = lazy(() => import('@/pages/Perfil/PerfilPage').then(m => ({ default: m.PerfilPage })))
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary'
import '@/styles/index.css'

// Carga perezosa (lazy loading) de páginas principales
const AuthPage = lazy(() => import('@/pages/Auth/AuthPage').then(module => ({ default: module.AuthPage })))
const HomePage = lazy(() => import('@/pages/Home/HomePage').then(module => ({ default: module.HomePage })))
const BilleterasPage = lazy(() => import('@/pages/Billeteras/BilleterasPage').then(module => ({ default: module.BilleterasPage })))
const TarjetasPage = lazy(() => import('@/pages/Tarjetas/TarjetasPage').then(module => ({ default: module.TarjetasPage })))
const CuarentenaPage = lazy(() => import('@/pages/Cuarentena/CuarentenaPage').then(module => ({ default: module.CuarentenaPage })))
const PresupuestosPage = lazy(() => import('@/pages/Presupuestos/PresupuestosPage').then(module => ({ default: module.PresupuestosPage })))
const FamiliaPage = lazy(() => import('@/pages/Familia/FamiliaPage').then(module => ({ default: module.FamiliaPage })))
const AnalisisEmocionalPage = lazy(() => import('@/pages/AnalisisEmocional/AnalisisEmocionalPage').then(module => ({ default: module.AnalisisEmocionalPage })))
const BCGDetalleCategoria = lazy(() => import('@/components/bcg/BCGDetalleCategoria').then(module => ({ default: module.BCGDetalleCategoria })))
const SupervivenciaPage = lazy(() => import('@/pages/Supervivencia/SupervivenciaPage').then(module => ({ default: module.SupervivenciaPage })))
const SaneamientoPage = lazy(() => import('@/pages/Saneamiento/SaneamientoPage').then(module => ({ default: module.SaneamientoPage })))
const InversionesPage = lazy(() => import('@/pages/Inversiones/InversionesPage').then(module => ({ default: module.InversionesPage })))
const SaludPage = lazy(() => import('@/pages/Salud/SaludPage').then(module => ({ default: module.SaludPage })))
const SobresPage = lazy(() => import('@/pages/Sobres/SobresPage').then(module => ({ default: module.SobresPage })))
const PrivacidadPage = lazy(() => import('@/pages/Privacidad/PrivacidadPage').then(module => ({ default: module.PrivacidadPage })))
const ConfiguracionPage = lazy(() => import('@/pages/Configuracion/ConfiguracionPage').then(module => ({ default: module.ConfiguracionPage })))
const NotificacionesPage = lazy(() => import('@/pages/Configuracion/NotificacionesPage').then(module => ({ default: module.NotificacionesPage })))
const CategoriasConfigPage = lazy(() => import('@/pages/Configuracion/CategoriasConfigPage').then(module => ({ default: module.CategoriasConfigPage })))
const HogarConfigPage = lazy(() => import('@/pages/Configuracion/HogarConfigPage').then(module => ({ default: module.HogarConfigPage })))
const RegionFormatoPage = lazy(() => import('@/pages/Configuracion/RegionFormatoPage').then(module => ({ default: module.RegionFormatoPage })))
const PresupuestoCicloPage = lazy(() => import('@/pages/Configuracion/PresupuestoCicloPage').then(module => ({ default: module.PresupuestoCicloPage })))
const PreferenciasOperativasPage = lazy(() => import('@/pages/Configuracion/PreferenciasOperativasPage').then(module => ({ default: module.PreferenciasOperativasPage })))
const AcercaPage = lazy(() => import('@/pages/Configuracion/AcercaPage').then(module => ({ default: module.AcercaPage })))


const LoadingSpinner = () => (
  <div className="page flex items-center justify-center" style={{ minHeight: '80vh' }}>
    <div className="spinner" />
  </div>
)

function AppLayout() {
  const [showAdd, setShowAdd] = useState(false)
  const [addConfig, setAddConfig] = useState<{ defaultTipo?: 'expense' | 'income' | 'transfer', initialBilleteraId?: number } | null>(null)

  useEffect(() => {
    const handleOpenTransfer = (e: any) => {
      setAddConfig({ defaultTipo: 'transfer', initialBilleteraId: e.detail?.billetera_id })
      setShowAdd(true)
    }
    window.addEventListener('open-transfer-modal', handleOpenTransfer)
    return () => window.removeEventListener('open-transfer-modal', handleOpenTransfer)
  }, [])

  useEffect(() => {
    const requestIdle = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline), 1200))
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout
    const idleId = requestIdle(() => { void loadAddMovementModal() })
    return () => cancelIdle(idleId as number)
  }, [])

  return (
    <>
      {/* Sidebar para desktop (≥768px) */}
      <SideNav onAddPress={() => setShowAdd(!showAdd)} />

      {/* Navegación inferior para mobile (<768px) */}
      <BottomNav onAddPress={() => setShowAdd(!showAdd)} />

      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/billeteras" element={<BilleterasPage />} />
          <Route path="/tarjetas" element={<TarjetasPage />} />
          <Route path="/cuarentena" element={<CuarentenaPage />} />
          <Route path="/categorias" element={<Navigate to="/billeteras" replace />} />
          <Route path="/presupuesto" element={<PresupuestosPage />} />
          <Route path="/familia" element={<FamiliaPage />} />
          <Route path="/analisis-emocional" element={<AnalisisEmocionalPage />} />
          <Route path="/analisis-emocional/categoria/:id" element={<BCGDetalleCategoria />} />
          <Route path="/supervivencia" element={<SupervivenciaPage />} />
          <Route path="/saneamiento" element={<SaneamientoPage />} />
          <Route path="/inversiones" element={<InversionesPage />} />
          <Route path="/salud" element={<SaludPage />} />
          <Route path="/sobres" element={<SobresPage />} />
          <Route path="/privacidad" element={<PrivacidadPage />} />
          <Route path="/configuracion" element={<ConfiguracionPage />} />
          <Route path="/configuracion/region" element={<RegionFormatoPage />} />
          <Route path="/configuracion/presupuesto" element={<PresupuestoCicloPage />} />
          <Route path="/configuracion/notificaciones" element={<NotificacionesPage />} />
          <Route path="/configuracion/operativas" element={<PreferenciasOperativasPage />} />
          <Route path="/configuracion/acerca" element={<AcercaPage />} />
          <Route path="/configuracion/categorias" element={<CategoriasConfigPage />} />
          <Route path="/configuracion/hogar" element={<HogarConfigPage />} />
        </Routes>
      </Suspense>

      {showAdd && (
        <Suspense fallback={null}>
          <AddMovementModal
            onClose={() => { setShowAdd(false); setAddConfig(null); }}
            onSuccess={() => {
              window.dispatchEvent(new CustomEvent('movement-added'))
              setShowAdd(false)
              setAddConfig(null)
            }}
            defaultTipo={addConfig?.defaultTipo || 'expense'}
            initialBilleteraId={addConfig?.initialBilleteraId}
          />
        </Suspense>
      )}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <HogarProvider>
          <ToastProvider>
            <ModoAppProvider>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  {/* Rutas públicas */}
                  <Route element={<PublicRoute />}>
                    <Route path="/auth" element={<AuthPage />} />
                  </Route>

                  {/* Rutas privadas */}
                  <Route element={<PrivateRoute />}>
                    <Route path="/*" element={<AppLayout />} />
                  </Route>
                </Routes>
              </Suspense>
            </ModoAppProvider>
          </ToastProvider>
          </HogarProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
