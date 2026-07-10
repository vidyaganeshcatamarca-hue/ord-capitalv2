import { useModoApp } from '@/contexts/ModoAppContext'
import { useAuth } from '@/contexts/AuthContext'
import { MiCuentaCard } from './MiCuentaCard'
import { ModoAppCard } from './ModoAppCard'
import { AparienciaCard } from './AparienciaCard'
import { DatosCard } from './DatosCard'
import { BilleterasCard } from './BilleterasCard'
import { CategoriasCard } from './CategoriasCard'
import { HogarCard } from './HogarCard'
import { NotificacionesCard } from './NotificacionesCard'
import './ConfiguracionHub.css'

export function ConfiguracionHub() {
  const { hasFeature } = useModoApp()
  const { user } = useAuth()

  return (
    <div className="config-hub">
      <MiCuentaCard />
      <ModoAppCard />
      <AparienciaCard userId={user?.id} />
      
      <NotificacionesCard />
      <DatosCard />
      <BilleterasCard />
      <CategoriasCard />
      <HogarCard />
    </div>
  )
}

export default ConfiguracionHub
