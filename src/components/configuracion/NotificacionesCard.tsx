import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { t } from '@/locales/i18n'

export function NotificacionesCard() {
  const navigate = useNavigate()
  const [activeCount, setActiveCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('fn_obtener_preferencias_notificaciones')
        if (error || !data) return
        const row = Array.isArray(data) ? data[0] : data
        const keys = [
          'cat_vencimientos', 'cat_recurrentes', 'cat_liquidez', 'cat_presupuesto',
          'cat_cuarentena', 'cat_deuda', 'cat_ahorro', 'cat_inversiones',
          'cat_hogar', 'cat_score', 'cat_resumen_semanal', 'cat_resumen_mensual',
        ]
        const count = keys.filter((k) => (row as Record<string, unknown> | null)?.[k]).length
        if (!cancelled) setActiveCount(count)
      } catch {
        // Silencioso.
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <button type="button" className="config-hub-card" onClick={() => navigate('/configuracion/notificaciones')}>
      <span className="config-hub-card-icon" aria-hidden="true">🔔</span>
      <div className="config-hub-card-content">
        <h3>{t('config_notificaciones')}</h3>
        <p>
          {activeCount === null
            ? t('config_notificaciones_desc')
            : t('config_notifications_active_count', { count: activeCount, total: 12 })}
        </p>
      </div>
      <span className="config-hub-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

export default NotificacionesCard
