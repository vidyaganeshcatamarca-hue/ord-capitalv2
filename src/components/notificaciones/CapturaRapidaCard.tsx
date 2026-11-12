// src/components/notificaciones/CapturaRapidaCard.tsx
// Tarjeta de captura rapida: es la puerta de entrada a la notificacion
// permanente del sistema, la que permite cargar un movimiento sin abrir la app.
//
// Hoy la app es web y el navegador no la muestra, pero la funcionalidad se
// preserva a proposito: cuando exista el APK es la via rapida de carga. Si la
// tarjeta dejara de existir, esa entrada se perderia con ella.

import { t } from '@/locales/i18n'
import { getPersistentPrefs } from '@/lib/notificationPreferences'
import './CapturaRapidaCard.css'

interface CapturaRapidaCardProps {
  /** Si el contenedor sabe abrir el alta, la maneja el. */
  onCapture?: () => void
}

export function CapturaRapidaCard({ onCapture }: CapturaRapidaCardProps) {
  const prefs = getPersistentPrefs()
  if (!prefs.enabled) return null

  const handleCapture = () => {
    if (onCapture) {
      onCapture()
      return
    }

    // Camino para el APK: la notificacion del sistema abre la app y el evento
    // deja el alta de movimiento lista con el tipo por defecto del usuario.
    window.dispatchEvent(
      new CustomEvent('open-registro-modal', { detail: { defaultTipo: prefs.defaultTipo } }),
    )
  }

  return (
    <article className="notif-persistent-card">
      <h3>{t('notif_captura_rapida_titulo')}</h3>
      <p>{t('notif_captura_rapida_desc')}</p>
      <button type="button" className="notif-persistent-button" onClick={handleCapture}>
        {t('notif_captura_rapida_action')}
      </button>
    </article>
  )
}

export default CapturaRapidaCard
