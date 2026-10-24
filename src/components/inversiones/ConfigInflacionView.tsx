import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { hayCambiosInflacion } from '@/lib/inflacionDirty'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatPercent } from '@/lib/format'
import { useNumberFormat } from '@/hooks/useNumberFormat'
import './ConfigInflacionView.css'

export interface ConfigInflacionViewProps {
  className?: string
  onSaved?: () => void
}

type Pais = string

/**
 * B3/B4 (2026-10-21): tres fuentes y solo tres.
 *  - proxy_dolar: por defecto. Usa el movimiento del dolar de tu pais como
 *    aproximacion de la inflacion local. Automatico, sin nada que cargar.
 *  - manual: el usuario carga la inflacion anual acumulada hasta hoy.
 *  - desactivado: solo rendimiento nominal; el real desaparece de todas las
 *    vistas.
 * 'api_automatica' se elimino: nunca estuvo implementada (el selector la
 * tenia deshabilitada con "Proximamente") y el dueño pidio 3 opciones.
 */
type FuenteInflacion = 'proxy_dolar' | 'manual' | 'desactivado'

/** Contrato de fn_obtener_config_inflacion (T5 + 86 + S12). */
interface ConfigInflacionActual {
  pais: string | null
  fuente_inflacion: string | null
  inflacion_6m: number | null
  inflacion_12m: number | null
  inflacion_manual_anual_pct: number | null
  configurado: boolean
  /** S12: la inflacion se calcula en vivo; puede no haber datos todavia. */
  disponible?: boolean
  motivo?: 'ok' | 'desactivado' | 'sin_datos' | 'manual_sin_valor'
  ventana_6m_meses?: number | null
  ventana_12m_meses?: number | null
  /** Tasa anual equivalente (proyeccion cuando la fuente es proxy dolar). */
  inflacion_anualizada?: number | null
}

const FUENTES: { value: FuenteInflacion; key: string; descKey: string }[] = [
  { value: 'proxy_dolar', key: 'inflation_source_proxy_dolar', descKey: 'inflation_source_proxy_dolar_desc' },
  { value: 'manual', key: 'inflation_source_manual', descKey: 'inflation_source_manual_desc' },
  { value: 'desactivado', key: 'inflation_source_desactivado', descKey: 'inflation_source_desactivado_desc' },
]

export function ConfigInflacionView({ className, onSaved }: ConfigInflacionViewProps) {
  const { showToast } = useToast()
  // S14 (2026-10-22): el pais ya NO se elige aca. Es el pais de la configuracion
  // regional (p_config_region.pais_codigo) y determina la moneda local; dejarlo
  // como <select> era ofrecer un cambio que no corresponde a este modulo. El
  // selector anterior ademas tenia un bug: su lista estaba vacia (PAISES = []),
  // asi que la config guardada de pais nunca se aplicaba y siempre se pisaba con
  // el pais regional.
  const { countryCode } = useNumberFormat()
  const mountedRef = useRef(true)
  useEffect(() => {
    // S5 (b784750) rompió el panel: el cleanup ponía `false` y nadie volvía a
    // ponerlo en `true`. En desarrollo React monta dos veces (StrictMode): el
    // primer cleanup dejaba el guard en `false` y `cargarConfig` salía antes de
    // bajar `loading`, así que la pestaña quedaba en skeletons para siempre.
    // Detectado en el navegador, no por los tests.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const [pais, setPais] = useState<Pais>('')
  const [fuente, setFuente] = useState<FuenteInflacion>('proxy_dolar')
  const [valorManual, setValorManual] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // S2 (2026-10-23): la bandera `configurado` ya no decide si hay cambios. El
  // botón Guardar depende de si el formulario difiere de lo guardado, no de si el
  // usuario guardó alguna vez (ver src/lib/inflacionDirty.ts).
  // S12/S17: lo que devuelve el backend sobre la inflacion vigente, para poder
  // explicar en pantalla con que se calculo y sobre que ventana.
  const [vigente, setVigente] = useState<{
    disponible: boolean
    motivo: string
    inflacion6m: number | null
    ventana6m: number | null
    anualizada: number | null
  }>({ disponible: false, motivo: '', inflacion6m: null, ventana6m: null, anualizada: null })

  // Lo que esta guardado en el backend: sirve para saber si hay cambios (B5).
  const [guardado, setGuardado] = useState<{
    pais: string | null
    fuente: FuenteInflacion
    valorManual: number | null
  }>({ pais: null, fuente: 'proxy_dolar', valorManual: null })

  // S14: el pais es el de la configuracion regional, no se elige aca.
  useEffect(() => {
    if (pais || !countryCode) return
    setPais(countryCode)
  }, [pais, countryCode])

  // T5/T8: precargar la config REAL del usuario. Antes no existía RPC de
  // lectura y el tab siempre mostraba AR/proxy_dolar, aunque el dueño ya
  // hubiera guardado otra cosa.
  //
  // S5 (2026-10-23): la misma lectura se reusa después de guardar, porque el
  // bloque de inflación vigente se quedaba con los valores viejos hasta cambiar
  // de pestaña y volver.
  const cargarConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await rpc<ConfigInflacionActual>('fn_obtener_config_inflacion')
      if (!mountedRef.current) return
      const actual = res || null
      const paisGuardado = String(actual?.pais ?? '').trim().toUpperCase()
      const fuenteGuardada = String(actual?.fuente_inflacion ?? '').trim() as FuenteInflacion
      const valorGuardado = actual?.inflacion_manual_anual_pct ?? null

      if (fuenteGuardada && FUENTES.some((f) => f.value === fuenteGuardada)) {
        setFuente(fuenteGuardada)
      }
      if (valorGuardado !== null && valorGuardado !== undefined) {
        setValorManual(String(valorGuardado))
      }
      setVigente({
        disponible: Boolean(actual?.disponible),
        motivo: String(actual?.motivo ?? ''),
        inflacion6m: actual?.inflacion_6m ?? null,
        ventana6m: actual?.ventana_6m_meses ?? null,
        anualizada: actual?.inflacion_anualizada ?? null,
      })
      setGuardado({
        pais: paisGuardado || null,
        fuente: fuenteGuardada && FUENTES.some((f) => f.value === fuenteGuardada)
          ? fuenteGuardada
          : 'proxy_dolar',
        valorManual: valorGuardado,
      })
    } catch (err) {
      if (mountedRef.current) {
        // La config previa no es crítica: se sigue con los defaults.
        const message = parseError(err) || t('error_generic')
        showToast(message, 'error')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    cargarConfig()
  }, [cargarConfig])

  const valorManualNum = Number(valorManual)
  const valorManualValido = valorManual.trim() !== '' && valorManualNum > 0

  // B5 + S2: el botón Guardar solo aparece si hay cambios reales respecto de lo
  // guardado. Sin cambios, guardar otra vez no hace nada: es ruido.
  const hayCambios = useMemo(
    () => hayCambiosInflacion({ pais, fuente, valorManual }, guardado),
    [pais, fuente, valorManual, guardado]
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading || saving || !hayCambios) return

    setSaving(true)
    setError('')

    try {
      // rpc() lanza el error si la llamada falla (no lo devuelve).
      await rpc('fn_configurar_inflacion', {
        p_pais: pais,
        p_fuente_inflacion: fuente,
        p_inflacion_manual_anual_pct: fuente === 'manual' ? valorManualNum : null,
      })

      setGuardado({
        pais,
        fuente,
        valorManual: fuente === 'manual' ? valorManualNum : null,
      })
      showToast(t('msg_inflation_configured'), 'success')
      // S5: releer el RPC para que el bloque de inflación vigente muestre el
      // cambio ya mismo, sin tener que cambiar de pestaña y volver.
      await cargarConfig()
      onSaved?.()
    } catch (err) {
      const message = parseError(err) || t('error_generic')
      setError(message)
      showToast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const rootClass = className
    ? `config-inflacion-view ${className}`
    : 'config-inflacion-view'

  const fuenteSeleccionada = FUENTES.find((f) => f.value === fuente)

  return (
    <section className={rootClass} aria-busy={loading || saving}>
      <header className="config-inflacion-header">
        <div>
          <p className="config-inflacion-eyebrow">{t('label_inflation_source')}</p>
          <h2 className="config-inflacion-title">{t('modal_config_inflation_title')}</h2>
        </div>
        <span className="config-inflacion-pill">
          {t(fuenteSeleccionada?.key ?? 'inflation_source_proxy_dolar')}
        </span>
      </header>

      {loading ? (
        <div className="config-inflacion-loading" aria-hidden="true">
          <div className="config-inflacion-skeleton" />
          <div className="config-inflacion-skeleton" />
          <div className="config-inflacion-skeleton config-inflacion-skeleton--button" />
        </div>
      ) : (
        <form className="config-inflacion-form" onSubmit={handleSubmit}>
          {/* S14: el pais no se muestra ni se elige: es el de la configuracion
              regional. Solo se informa la moneda local con la que se calcula. */}
          <div className="config-inflacion-field">
            <label className="config-inflacion-label" htmlFor="config-inflacion-fuente">
              {t('label_inflation_source')}
            </label>
            <select
              id="config-inflacion-fuente"
              value={fuente}
              onChange={(event) => setFuente(event.target.value as FuenteInflacion)}
              disabled={saving}
            >
              {FUENTES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.key)}
                </option>
              ))}
            </select>
            {fuenteSeleccionada && (
              <p className="config-inflacion-help">{t(fuenteSeleccionada.descKey)}</p>
            )}
          </div>

          {/* S17: se explica con que se calculo y sobre que ventana, en vez de
              dejar el numero sin contexto. */}
          <div className="config-inflacion-vigente">
            <span className="config-inflacion-vigente-label">{t('label_inflation_computed')}</span>
            {vigente.disponible ? (
              <>
                <span className="config-inflacion-vigente-value">
                  {vigente.inflacion6m === null ? '-' : formatPercent(vigente.inflacion6m, { signed: false })}
                  {vigente.ventana6m !== null && vigente.ventana6m !== undefined && (
                    <span className="config-inflacion-vigente-window">
                      {' '}· {t('label_inflation_window_months', { months: String(vigente.ventana6m) })}
                    </span>
                  )}
                </span>
                {/* El dueño quiere ver la inflación calculada expresada por año. */}
                {vigente.anualizada !== null && vigente.anualizada !== undefined && (
                  <span className="config-inflacion-vigente-annual">
                    {t('label_inflation_annual', { rate: formatPercent(vigente.anualizada, { signed: false }) })}
                  </span>
                )}
              </>
            ) : (
              <span className="config-inflacion-vigente-value">
                {vigente.motivo === 'desactivado'
                  ? t('msg_inflation_disabled')
                  : t('msg_inflation_no_data')}
              </span>
            )}
          </div>

          {fuente === 'manual' && (
            <div className="config-inflacion-field">
              <label className="config-inflacion-label" htmlFor="config-inflacion-manual">
                {t('label_inflation_manual_value')}
              </label>
              <input
                id="config-inflacion-manual"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={valorManual}
                onChange={(event) => setValorManual(event.target.value)}
                placeholder={t('placeholder_inflation_manual')}
                disabled={saving}
              />
              <p className="config-inflacion-help">{t('inflation_manual_help')}</p>
              {valorManual.trim() !== '' && !valorManualValido && (
                <span className="form-error">{t('error_inflation_manual_value_invalid')}</span>
              )}
            </div>
          )}

          {error && (
            <p className="config-inflacion-error" role="alert">
              {error}
            </p>
          )}

          {hayCambios && (
            <button
              type="submit"
              className="btn btn-primary font-semibold config-inflacion-submit"
              disabled={saving || (fuente === 'manual' && !valorManualValido)}
            >
              {saving ? t('loading') : t('btn_save')}
            </button>
          )}
        </form>
      )}
    </section>
  )
}

export default ConfigInflacionView