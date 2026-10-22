import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { useCountryCatalog } from '@/lib/useCountryCatalog'
import { regionName } from '@/lib/countryCatalog'
import { useLanguage } from '@/locales/LanguageProvider'
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

/** Contrato de fn_obtener_config_inflacion (T5 + 86). */
interface ConfigInflacionActual {
  pais: string | null
  fuente_inflacion: string | null
  inflacion_6m: number | null
  inflacion_12m: number | null
  inflacion_manual_anual_pct: number | null
  configurado: boolean
}

const PAISES: { value: Pais; key: string }[] = []

const FUENTES: { value: FuenteInflacion; key: string; descKey: string }[] = [
  { value: 'proxy_dolar', key: 'inflation_source_proxy_dolar', descKey: 'inflation_source_proxy_dolar_desc' },
  { value: 'manual', key: 'inflation_source_manual', descKey: 'inflation_source_manual_desc' },
  { value: 'desactivado', key: 'inflation_source_desactivado', descKey: 'inflation_source_desactivado_desc' },
]

export function ConfigInflacionView({ className, onSaved }: ConfigInflacionViewProps) {
  const { showToast } = useToast()
  // B8 (2026-10-21): el selector de pais estaba HARDCODEADO (nueve paises
  // con Argentina por defecto). Un usuario de Reino Unido veia "AR" y el
  // catalogo real (p_paises) ni siquiera tenia GB en la lista. Ahora el
  // catalogo viene de la base y el default es el pais del usuario.
  const { countries } = useCountryCatalog()
  const { countryCode } = useNumberFormat()
  const { lang } = useLanguage()
  const paisesDisponibles = useMemo(
    () =>
      countries
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((c) => ({ value: c.code, nombre: regionName(c.code, lang) })),
    [countries, lang]
  )
  const [pais, setPais] = useState<Pais>('')
  const [fuente, setFuente] = useState<FuenteInflacion>('proxy_dolar')
  const [valorManual, setValorManual] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [configurado, setConfigurado] = useState(false)

  // Lo que esta guardado en el backend: sirve para saber si hay cambios (B5).
  const [guardado, setGuardado] = useState<{
    pais: string | null
    fuente: FuenteInflacion
    valorManual: number | null
  }>({ pais: null, fuente: 'proxy_dolar', valorManual: null })

  // B8: cuando no hay config guardada, el pais por defecto es el del
  // usuario (p_config_region.pais_codigo), no uno fijo.
  useEffect(() => {
    if (pais || !countryCode) return
    if (paisesDisponibles.some((p) => p.value === countryCode)) {
      setPais(countryCode)
    }
  }, [pais, countryCode, paisesDisponibles])

  // T5/T8: precargar la config REAL del usuario. Antes no existía RPC de
  // lectura y el tab siempre mostraba AR/proxy_dolar, aunque el dueño ya
  // hubiera guardado otra cosa.
  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      setLoading(true)
      try {
        const res = await rpc<ConfigInflacionActual>('fn_obtener_config_inflacion')
        if (cancelled) return
        const actual = res || null
        const paisGuardado = String(actual?.pais ?? '').trim().toUpperCase()
        const fuenteGuardada = String(actual?.fuente_inflacion ?? '').trim() as FuenteInflacion
        const valorGuardado = actual?.inflacion_manual_anual_pct ?? null

        if (paisGuardado && PAISES.some((p) => p.value === paisGuardado)) {
          setPais(paisGuardado as Pais)
        }
        if (fuenteGuardada && FUENTES.some((f) => f.value === fuenteGuardada)) {
          setFuente(fuenteGuardada)
        }
        if (valorGuardado !== null && valorGuardado !== undefined) {
          setValorManual(String(valorGuardado))
        }
        setConfigurado(Boolean(actual?.configurado))
        setGuardado({
          pais: paisGuardado || null,
          fuente: fuenteGuardada && FUENTES.some((f) => f.value === fuenteGuardada)
            ? fuenteGuardada
            : 'proxy_dolar',
          valorManual: valorGuardado,
        })
      } catch (err) {
        if (!cancelled) {
          // La config previa no es crítica: se sigue con los defaults.
          const message = parseError(err) || t('error_generic')
          showToast(message, 'error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadConfig()
    return () => {
      cancelled = true
    }
  }, [showToast])

  const valorManualNum = Number(valorManual)
  const valorManualValido = valorManual.trim() !== '' && valorManualNum > 0

  // B5: el botón Guardar solo aparece si hay cambios. Sin cambios, guardar
  // otra vez no hace nada: es ruido.
  const hayCambios = useMemo(() => {
    if (!configurado) return true
    if (pais !== (guardado.pais ?? pais)) return true
    if (fuente !== guardado.fuente) return true
    if (fuente === 'manual') {
      const guardadoNum = guardado.valorManual
      if (guardadoNum === null) return valorManualValido
      return Math.abs(valorManualNum - guardadoNum) > 0.0001
    }
    return false
  }, [configurado, pais, guardado, fuente, valorManualNum, valorManualValido])

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

      setConfigurado(true)
      setGuardado({
        pais,
        fuente,
        valorManual: fuente === 'manual' ? valorManualNum : null,
      })
      showToast(t('msg_inflation_configured'), 'success')
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
          {!configurado
            ? t('inflation_source_not_configured')
            : t(fuenteSeleccionada?.key ?? 'inflation_source_proxy_dolar')}
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
          <div className="config-inflacion-field">
            <label className="config-inflacion-label" htmlFor="config-inflacion-pais">
              {t('label_country')}
            </label>
            <select
              id="config-inflacion-pais"
              value={pais}
              onChange={(event) => setPais(event.target.value as Pais)}
              disabled={saving || paisesDisponibles.length === 0}
            >
              {paisesDisponibles.length === 0 && (
                <option value="">{t('loading')}</option>
              )}
              {paisesDisponibles.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} - {option.nombre || option.value}
                </option>
              ))}
            </select>
          </div>

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