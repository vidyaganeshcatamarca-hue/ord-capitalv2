import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useHogar } from '@/contexts/HogarContext'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import './ConfigHogar.css'

interface ConfigHogarProps {
  onChange?: () => void
}

interface InvitacionData {
  codigo: string
  expira_at: string
}

export function ConfigHogar({ onChange }: ConfigHogarProps) {
  const { showToast } = useToast()
  const { estado, refresh } = useHogar()
  const [pctCreador, setPctCreador] = useState(50)
  const [pctInvitado, setPctInvitado] = useState(50)
  const [loadingPorcentaje, setLoadingPorcentaje] = useState(false)

  const [codigo, setCodigo] = useState<InvitacionData | null>(null)
  const [loadingCodigo, setLoadingCodigo] = useState(false)

  const [inputUnirse, setInputUnirse] = useState('')
  const [loadingUnirse, setLoadingUnirse] = useState(false)

  const [confirmDesvincular, setConfirmDesvincular] = useState('')
  const [loadingDesvincular, setLoadingDesvincular] = useState(false)

  const generarCodigo = useCallback(async () => {
    setLoadingCodigo(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('fn_generar_codigo_invitacion')
      if (rpcError) throw rpcError
      const payload = (data ?? {}) as Record<string, any>
      const nuevoCodigo = payload.codigo ?? payload.code ?? ''
      const expira = payload.expira_at ?? payload.expira ?? null
      if (!nuevoCodigo) {
        showToast(t('error_home_invitation_missing'), 'error')
        return
      }
      setCodigo({ codigo: nuevoCodigo, expira_at: expira })
      showToast(t('hogar_invitacion_creada'), 'success')
      haptics.success()
    } catch (err: any) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setLoadingCodigo(false)
    }
  }, [showToast])

  const handleGuardarPorcentaje = async () => {
    if (pctCreador + pctInvitado !== 100) {
      showToast(t('hogar_proporcion_sum_error'), 'error')
      return
    }
    setLoadingPorcentaje(true)
    try {
      const { error: rpcError } = await supabase.rpc('fn_actualizar_proporcion_hogar', {
        p_pct_creador: pctCreador,
        p_pct_invitado: pctInvitado,
      })
      if (rpcError) throw rpcError
      showToast(t('hogar_proporcion_guardada'), 'success')
      haptics.success()
      onChange?.()
    } catch (err: any) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setLoadingPorcentaje(false)
    }
  }

  const handleUnirse = async () => {
    if (!inputUnirse.trim()) return
    setLoadingUnirse(true)
    try {
      const { error: rpcError } = await supabase.rpc('fn_aceptar_invitacion', {
        p_codigo: inputUnirse.trim().toUpperCase(),
      })
      if (rpcError) throw rpcError
      showToast(t('hogar_unido_exito'), 'success')
      haptics.success()
      setInputUnirse('')
      await refresh()
      onChange?.()
    } catch (err: any) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setLoadingUnirse(false)
    }
  }

  const handleDesvincular = async () => {
    if (confirmDesvincular !== 'DESVINCULAR') {
      showToast(t('hogar_desvincular_confirma_texto'), 'error')
      return
    }
    setLoadingDesvincular(true)
    try {
      const { error: rpcError } = await supabase.rpc('fn_desvincular_pareja')
      if (rpcError) throw rpcError
      showToast(t('hogar_desvincular_exito'), 'success')
      haptics.warning()
      setConfirmDesvincular('')
      await refresh()
      onChange?.()
    } catch (err: any) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setLoadingDesvincular(false)
    }
  }

  const isCreador = estado?.rol === 'creador'
  const isInvitado = estado?.rol === 'invitado'
  const tienePareja = !!estado?.tiene_pareja

  useEffect(() => {
    if (isCreador && tienePareja && !codigo) {
      generarCodigo()
    }
  }, [isCreador, tienePareja, codigo, generarCodigo])

  return (
    <div className="config-hogar">
      {tienePareja && (
        <>
          <section className="config-hogar-card">
            <span className="config-hogar-label">{t('hogar_integrantes_titulo')}</span>
            <div className="config-hogar-integrantes">
              <div className="config-hogar-integrante">
                <span className="config-hogar-integrante-avatar" aria-hidden="true">👤</span>
                <div>
                  <strong>{t('hogar_integrantes_creador')}</strong>
                  <span>
                    {isCreador ? t('familia_yo') : t('familia_pareja')}
                  </span>
                </div>
              </div>
              <div className="config-hogar-integrante">
                <span className="config-hogar-integrante-avatar" aria-hidden="true">👤</span>
                <div>
                  <strong>{t('hogar_integrantes_invitado')}</strong>
                  <span>
                    {isInvitado ? t('familia_yo') : t('familia_pareja')}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="config-hogar-card">
            <span className="config-hogar-label">{t('hogar_proporcion_titulo')}</span>
            <div className="config-hogar-proporcion">
              <div className="config-hogar-proporcion-row">
                <span>{t('hogar_proporcion_creador')}</span>
                <div className="config-hogar-proporcion-bar">
                  <div className="config-hogar-proporcion-track">
                    <span
                      className="config-hogar-proporcion-fill config-hogar-proporcion-fill-creador"
                      style={{ width: `${pctCreador}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={pctCreador}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      setPctCreador(value)
                      setPctInvitado(100 - value)
                    }}
                  />
                </div>
                <strong>{pctCreador}%</strong>
              </div>
              <div className="config-hogar-proporcion-row">
                <span>{t('hogar_proporcion_invitado')}</span>
                <div className="config-hogar-proporcion-bar">
                  <div className="config-hogar-proporcion-track">
                    <span
                      className="config-hogar-proporcion-fill config-hogar-proporcion-fill-invitado"
                      style={{ width: `${pctInvitado}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={pctInvitado}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      setPctInvitado(value)
                      setPctCreador(100 - value)
                    }}
                  />
                </div>
                <strong>{pctInvitado}%</strong>
              </div>
              {pctCreador + pctInvitado !== 100 && (
                <p className="config-hogar-proporcion-error">{t('hogar_proporcion_sum_error')}</p>
              )}
              <button
                className="btn btn-primary"
                onClick={handleGuardarPorcentaje}
                disabled={loadingPorcentaje || pctCreador + pctInvitado !== 100}
              >
                {loadingPorcentaje ? '...' : t('hogar_btn_guardar')}
              </button>
            </div>
          </section>

          {isCreador && codigo && (
            <section className="config-hogar-card">
              <span className="config-hogar-label">{t('hogar_invitacion_titulo')}</span>
              <div className="config-hogar-codigo">
                <strong className="config-hogar-codigo-text">{codigo.codigo}</strong>
                {codigo.expira_at && (
                  <span className="config-hogar-codigo-expira">
                    {t('hogar_codigo_expira', {
                      fecha: new Date(codigo.expira_at).toLocaleDateString('es-AR'),
                    })}
                  </span>
                )}
                <div className="config-hogar-codigo-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard?.writeText(codigo.codigo)
                      showToast(t('hogar_btn_copiar') + ' ✓', 'success')
                    }}
                  >
                    {t('hogar_btn_copiar')}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const message = `Te invito a unirte a mi hogar en ORD Capital. Usa este código: ${codigo.codigo}`
                      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
                    }}
                  >
                    {t('hogar_btn_compartir')}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={generarCodigo}
                    disabled={loadingCodigo}
                  >
                    {t('hogar_btn_reenviar')}
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="config-hogar-card config-hogar-card-danger">
            <span className="config-hogar-label config-hogar-label-danger">
              {t('hogar_zona_peligro')}
            </span>
            <p className="config-hogar-danger-text">{t('familia_desvincular_desc')}</p>
            <input
              type="text"
              value={confirmDesvincular}
              onChange={(e) => setConfirmDesvincular(e.target.value)}
              placeholder={t('hogar_desvincular_confirma_label')}
              className="config-hogar-danger-input"
            />
            <button
              className="btn btn-danger"
              onClick={handleDesvincular}
              disabled={loadingDesvincular || confirmDesvincular !== 'DESVINCULAR'}
            >
              {loadingDesvincular ? '...' : t('hogar_btn_desvincular')}
            </button>
          </section>
        </>
      )}

      {!tienePareja && !estado?.tiene_hogar && (
        <section className="config-hogar-card">
          <span className="config-hogar-label">{t('hogar_unirme_label')}</span>
          <p className="config-hogar-text">{t('familia_unirme_desc')}</p>
          <input
            type="text"
            value={inputUnirse}
            onChange={(e) => setInputUnirse(e.target.value)}
            placeholder={t('hogar_unirme_codigo_placeholder')}
            className="config-hogar-unirse-input"
          />
          <button
            className="btn btn-primary"
            onClick={handleUnirse}
            disabled={loadingUnirse || !inputUnirse.trim()}
          >
            {loadingUnirse ? '...' : t('hogar_unirme_btn')}
          </button>
        </section>
      )}

      {!tienePareja && estado?.tiene_hogar && isCreador && (
        <section className="config-hogar-card">
          <span className="config-hogar-label">{t('hogar_invitacion_titulo')}</span>
          <p className="config-hogar-text">{t('hogar_esperando_pareja')}</p>
          {codigo ? (
            <div className="config-hogar-codigo">
              <strong className="config-hogar-codigo-text">{codigo.codigo}</strong>
              {codigo.expira_at && (
                <span className="config-hogar-codigo-expira">
                  {t('hogar_codigo_expira', {
                    fecha: new Date(codigo.expira_at).toLocaleDateString('es-AR'),
                  })}
                </span>
              )}
              <div className="config-hogar-codigo-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    navigator.clipboard?.writeText(codigo.codigo)
                    showToast(t('hogar_btn_copiar') + ' ✓', 'success')
                  }}
                >
                  {t('hogar_btn_copiar')}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={generarCodigo}
                  disabled={loadingCodigo}
                >
                  {t('hogar_btn_reenviar')}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={generarCodigo}
              disabled={loadingCodigo}
            >
              {loadingCodigo ? '...' : t('hogar_crear_invitacion')}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
