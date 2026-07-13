import { Navigate } from 'react-router-dom'

export function PresupuestoCicloPage() {
  return <Navigate to="/presupuesto?openConfig=1&returnTo=configuracion" replace />
}

export default PresupuestoCicloPage
