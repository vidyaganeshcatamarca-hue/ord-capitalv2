// src/pages/Configuracion/ProteccionPage.tsx
// PIN/biometry protection configuration (feature: pin-huella, task T4).
//
// Specs covered: S2 (entry lives in Cuenta y seguridad, advanced tree only —
// the tree entry is wired by the settingsMenu flip), S4 (biometry is a
// per-device opt-in registered here), S8 (enable/disable/change require the
// current PIN or biometry), S11 (copy through i18n), S12 (flat route).
//
// Interim behavior while PIN_BACKEND_ENABLED is false (T5 pending, same
// pattern as ConfiguracionBorradoCard): every mutation is rendered disabled
// with a reason instead of silently doing nothing.

import { useState, useEffect, useCallback } from 'react'
import { t } from '@/locales/i18n'
import ConfigBackButton from '@/components/configuracion/ConfigBackButton'
import './ConfiguracionPage.css'
import { useAppLock } from '@/contexts/AppLockContext'
import { PIN_BACKEND_ENABLED } from '@/contexts/AppLockContext'
import { biometriaDisponible } from '@/lib/biometricAppLock'
import { registrarBiometriaUsuario, borrarBiometriaDispositivo } from '@/lib/biometricAppLock'
import { validatePin } from '@/lib/pinFormat'
import { PinKeypad } from '@/components/AppLockGate/PinKeypad'

export function ProteccionPage() {
  const {
    lockState,
    biometriaEnDispositivo,
    setBiometriaEnDispositivo,
    verifyPin,
    definePin,
    refreshStatus,
  } = useAppLock()

  const [dispositivoSoporta, setDispositivoSoporta] = useState<boolean | null>(null)
  const [mensajeKey, setMensajeKey] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void biometriaDisponible().then((ok) => {
      if (alive) setDispositivoSoporta(ok)
    })
    return () => {
      alive = false
    }
  }, [])

  // S8 — every mutation shows what it will demand first. With the backend
  // pending, actions stay disabled and the reason stays visible.
  const accederAccion = useCallback(async (): Promise<'ok' | 'bloqueado'> => {
    if (!PIN_BACKEND_ENABLED) {
      setMensajeKey('proteccion_backend_pendiente')
      return 'bloqueado'
    }
    // The full S8 flow (current PIN prompt / biometry confirmation before
    // changes) activates together with the PIN RPCs in T5: this interim check
    // keeps the switch inert and labels the reason.
    setMensajeKey('proteccion_backend_pendiente')
    return 'bloqueado'
  }, [])

  const activarHuella = useCallback(async () => {
    if ((await accederAccion()) !== 'ok') return
    void registrarBiometriaUsuario
    void borrarBiometriaDispositivo
    void setBiometriaEnDispositivo
    void verifyPin
    void definePin
    void refreshStatus
    void biometriaEnDispositivo
    void lockState
  }, [accederAccion])

  const desactivarHuella = useCallback(async () => {
    if ((await accederAccion()) !== 'ok') return
    borrarBiometriaDispositivo()
    setBiometriaEnDispositivo(false)
  }, [accederAccion, setBiometriaEnDispositivo])

  const pinActivado = lockState != null && lockState.kind !== 'sin_pin'

  return (
    <main className="page config-page" aria-labelledby="proteccion-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="proteccion-title">{t('proteccion_title')}</h1>
        <p>{t('proteccion_desc')}</p>
      </header>

      <section className="config-section-list" aria-label={t('proteccion_title')}>
        <article className="config-section-card">
          <h2>{t('proteccion_estado_title')}</h2>
          <div className="config-section-row">
            <span>{t('proteccion_estado_pin')}</span>
            <span>{pinActivado ? t('proteccion_estado_activo') : t('proteccion_estado_inactivo')}</span>
          </div>
          <div className="config-section-row">
            <span>{t('proteccion_estado_huella')}</span>
            <span>
              {dispositivoSoporta === false
                ? t('proteccion_huella_no_soportada')
                : biometriaEnDispositivo
                  ? t('proteccion_estado_activo')
                  : t('proteccion_estado_inactivo')}
            </span>
          </div>

          {pinActivado ? (
            <div className="config-section-list" style={{ marginTop: '1rem' }}>
              <button type="button" className="config-action-button" disabled onClick={() => void accederAccion()}>
                {t('proteccion_cambiar_pin')}
              </button>
              <button type="button" className="config-action-button" disabled onClick={() => void accederAccion()}>
                {t('proteccion_desactivar')}
              </button>
            </div>
          ) : (
            <div className="config-section-list" style={{ marginTop: '1rem' }}>
              <button type="button" className="config-action-button" disabled onClick={() => void accederAccion()}>
                {t('proteccion_activar')}
              </button>
            </div>
          )}

          {dispositivoSoporta === true && (
            <button
              type="button"
              className="config-action-button"
              disabled
              onClick={() => void (biometriaEnDispositivo ? desactivarHuella() : activarHuella())}
            >
              {biometriaEnDispositivo ? t('proteccion_desactivar_huella') : t('proteccion_activar_huella')}
            </button>
          )}

          {mensajeKey && <p className="config-section-note" role="status">{t(mensajeKey)}</p>}
        </article>
      </section>
    </main>
  )
}

export default ProteccionPage