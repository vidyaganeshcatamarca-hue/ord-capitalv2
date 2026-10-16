// src/pages/Configuracion/ProteccionPage.tsx
// PIN/biometry protection configuration (feature: pin-huella, tasks T4 + T5).
//
// Specs covered: S2 (entry lives in Cuenta y seguridad, advanced tree only —
// the tree entry is wired by the settingsMenu flip at integration), S4
// (biometry is a per-device opt-in registered here), S8 (enable/disable/
// change demand the current PIN or biometry — server-verified), S11 (copy
// through i18n), S12 (flat route).

import { useState, useEffect, useCallback } from 'react'
import { t } from '@/locales/i18n'
import ConfigBackButton from '@/components/configuracion/ConfigBackButton'
import './ConfiguracionPage.css'
import { useAuth } from '@/contexts/AuthContext'
import { useAppLock } from '@/contexts/AppLockContext'
import {
  biometriaDisponible,
  registrarBiometriaUsuario,
  borrarBiometriaDispositivo,
} from '@/lib/biometricAppLock'
import { PinKeypad } from '@/components/AppLockGate/PinKeypad'
import { validatePin } from '@/lib/pinFormat'
import type { PinVerifyResult } from '@/contexts/AppLockContext'

type PanelMode = 'idle' | 'activar' | 'cambiar_actual' | 'cambiar_nueva' | 'baja'

/** Maps a failed result to the i18n key of its reason (S11: copy via t()). */
function reasonKey(result: PinVerifyResult): string {
  switch (result.reason) {
    case 'pin_incorrecto':
      return 'app_lock_wrong_pin'
    case 'pin_actual_incorrecto':
      return 'app_lock_wrong_current_pin'
    case 'pin_debil':
      return 'app_lock_pin_debil'
    case 'en_cooldown':
      return 'app_lock_cooldown_message'
    case 'reset_pending':
      return 'app_lock_reset_title'
    case 'unavailable':
      return 'proteccion_backend_pendiente'
    default:
      return 'app_lock_error_generico'
  }
}

export function ProteccionPage() {
  const { session, nombreUsuario } = useAuth()
  const {
    lockState,
    biometriaEnDispositivo,
    setBiometriaEnDispositivo,
    definePin,
    deactivatePin,
    unlockWithBiometria,
  } = useAppLock()

  const [dispositivoSoporta, setDispositivoSoporta] = useState<boolean | null>(null)
  const [mensajeKey, setMensajeKey] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode>('idle')

  useEffect(() => {
    let alive = true
    void biometriaDisponible().then((ok) => {
      if (alive) setDispositivoSoporta(ok)
    })
    return () => {
      alive = false
    }
  }, [])

  const run = useCallback(
    async (action: () => Promise<PinVerifyResult>, okKey: string) => {
      setMensajeKey(null)
      const result = await action()
      setMensajeKey(result.ok ? okKey : reasonKey(result))
      if (result.ok) setPanelMode('idle')
    },
    [],
  )

  // S6 — the new PIN is validated client-side through the shared pinFormat
  // (rejects weak AAAA before any server trip) and then server-verified.
  const activarPin = useCallback((pin: string) => {
    const error = validatePin(pin)
    if (error) return setMensajeKey(error)
    run(() => definePin(pin), 'proteccion_pin_creado')
  }, [definePin, run])
  const cambiarPin = useCallback(
    (pinActual: string, pinNuevo: string) => {
      const error = validatePin(pinNuevo)
      if (error) return setMensajeKey(error)
      run(() => definePin(pinNuevo, pinActual), 'proteccion_pin_cambiado')
    },
    [definePin, run],
  )
  const desactivarPin = useCallback((pinActual: string) => run(() => deactivatePin(pinActual), 'proteccion_pin_desactivado'), [deactivatePin, run])

  const activarHuella = useCallback(async () => {
    if (!session) return
    setMensajeKey(null)
    const label = nombreUsuario || session.user.email || session.user.id
    const ok = await registrarBiometriaUsuario(session.user.id, typeof label === 'string' ? label : 'ORD')
    setMensajeKey(ok ? 'proteccion_huella_registrada' : 'app_lock_biometria_error')
    setBiometriaEnDispositivo(ok)
  }, [session, nombreUsuario, setBiometriaEnDispositivo])

  const desactivarHuella = useCallback(() => {
    borrarBiometriaDispositivo()
    setBiometriaEnDispositivo(false)
    setMensajeKey('proteccion_huella_eliminada')
  }, [setBiometriaEnDispositivo])

  const pinActivado = lockState != null && lockState.kind !== 'sin_pin'
  const huellaHabilitable = pinActivado && dispositivoSoporta !== false

  const cerrarPanel = useCallback(() => {
    setPanelMode('idle')
    setMensajeKey(null)
  }, [])

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

          {panelMode === 'idle' && (
            <div className="config-section-list" style={{ marginTop: '1rem' }}>
              {pinActivado ? (
                <>
                  <button type="button" className="config-action-button" onClick={() => { setMensajeKey(null); setPanelMode('cambiar_actual') }}>
                    {t('proteccion_cambiar_pin')}
                  </button>
                  <button type="button" className="config-action-button" onClick={() => { setMensajeKey(null); setPanelMode('baja') }}>
                    {t('proteccion_desactivar')}
                  </button>
                </>
              ) : (
                <button type="button" className="config-action-button" onClick={() => { setMensajeKey(null); setPanelMode('activar') }}>
                  {t('proteccion_activar')}
                </button>
              )}
              {huellaHabilitable && (
                <button
                  type="button"
                  className="config-action-button"
                  onClick={() => void (biometriaEnDispositivo ? desactivarHuella() : activarHuella())}
                >
                  {biometriaEnDispositivo ? t('proteccion_desactivar_huella') : t('proteccion_activar_huella')}
                </button>
              )}
            </div>
          )}

          {panelMode === 'activar' && (
            <NuevoPinPanel
              tituloKey="proteccion_activar"
              disabled={false}
              onCancel={cerrarPanel}
              onConfirm={(pin) => void activarPin(pin)}
            />
          )}
          {panelMode === 'cambiar_actual' && (
            <PinActualPanel
              disabled={false}
              onCancel={cerrarPanel}
              onConfirm={(pinActual) => {
                setMensajeKey(null)
                setPanelMode('cambiar_nueva')
                // guardar el PIN actual para el paso siguiente:
                pinActualRef.current = pinActual
              }}
            />
          )}
          {panelMode === 'cambiar_nueva' && (
            <NuevoPinPanel
              tituloKey="proteccion_cambiar_pin"
              disabled={false}
              onCancel={cerrarPanel}
              onConfirm={(pinNuevo) => {
                setMensajeKey(null)
                void cambiarPin(pinActualRef.current ?? '', pinNuevo)
              }}
            />
          )}
          {panelMode === 'baja' && (
            <PinActualPanel
              disabled={false}
              onCancel={cerrarPanel}
              onConfirm={(pinActual) => void desactivarPin(pinActual)}
            />
          )}

          {mensajeKey && <p className="config-section-note" role="status">{t(mensajeKey)}</p>}
        </article>
      </section>
    </main>
  )
}

// Ref compartido interno para el paso "cambiar" (actual → nueva); la propia
// página vive unida, así el ref no trasciende el archivo.
const pinActualRef: { current?: string } = { current: undefined }

/** Doble entrada del PIN nuevo (activar / cambio). */
function NuevoPinPanel({
  tituloKey,
  disabled,
  onCancel,
  onConfirm,
}: {
  tituloKey: string
  disabled: boolean
  onCancel: () => void
  onConfirm: (pin: string) => void
}) {
  const [primero, setPrimero] = useState<string | null>(null)
  const [mismatch, setMismatch] = useState(false)
  if (primero == null) {
    return (
      <>
        <p className="config-section-note">{t('app_lock_reset_subtitle')}</p>
        <PinKeypad disabled={disabled} hint={null} onSubmit={(pin) => { setPrimero(pin); setMismatch(false) }} />
        <button type="button" className="config-action-button" onClick={onCancel}>{t('proteccion_cancelar')}</button>
      </>
    )
  }
  return (
    <>
      <p className="config-section-note">{t('app_lock_reset_confirm_subtitle')}</p>
      <PinKeypad
        disabled={disabled}
        hint={mismatch ? t('app_lock_pin_mismatch') : null}
        onSubmit={(pin) => {
          if (pin === primero) {
            onConfirm(pin)
          } else {
            setMismatch(true)
            setPrimero(null)
          }
        }}
      />
      <button type="button" className="config-action-button" onClick={onCancel}>{t('proteccion_cancelar')}</button>
    </>
  )
}

/** Entrada única del PIN actual (cambio / desactivar). */
function PinActualPanel({
  disabled,
  onCancel,
  onConfirm,
}: {
  disabled: boolean
  onCancel: () => void
  onConfirm: (pinActual: string) => void
}) {
  return (
    <>
      <p className="config-section-note">{t('proteccion_pedir_pin_actual')}</p>
      <PinKeypad disabled={disabled} hint={null} onSubmit={onConfirm} />
      <button type="button" className="config-action-button" onClick={onCancel}>{t('proteccion_cancelar')}</button>
    </>
  )
}

export default ProteccionPage