import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import './ConfigInflacionView.css'

export interface ConfigInflacionViewProps {
  className?: string
  onSaved?: () => void
}

type Pais = 'AR' | 'MX' | 'BR' | 'CL' | 'CO' | 'UY' | 'PY' | 'BO' | 'PE'
type FuenteInflacion = 'proxy_dolar' | 'desactivado' | 'api_automatica'

const PAISES: { value: Pais; key: string }[] = [
  { value: 'AR', key: 'country_argentina' },
  { value: 'MX', key: 'country_mexico' },
  { value: 'BR', key: 'country_brazil' },
  { value: 'CL', key: 'country_chile' },
  { value: 'CO', key: 'country_colombia' },
  { value: 'UY', key: 'country_uruguay' },
  { value: 'PY', key: 'country_paraguay' },
  { value: 'BO', key: 'country_bolivia' },
  { value: 'PE', key: 'country_peru' },
]

const FUENTES: { value: FuenteInflacion; key: string; disabled?: boolean }[] = [
  { value: 'proxy_dolar', key: 'inflation_source_proxy_dolar' },
  { value: 'desactivado', key: 'inflation_source_desactivado' },
  { value: 'api_automatica', key: 'inflation_source_api_automatica', disabled: true },
]

export function ConfigInflacionView({ className, onSaved }: ConfigInflacionViewProps) {
  const { showToast } = useToast()
  const [pais, setPais] = useState<Pais>('AR')
  const [fuente, setFuente] = useState<FuenteInflacion>('proxy_dolar')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(false)
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading || saving) return

    setSaving(true)
    setError('')

    try {
      const { error: rpcError } = await supabase.rpc('fn_configurar_inflacion', {
        p_pais: pais,
        p_fuente_inflacion: fuente,
      })

      if (rpcError) throw rpcError

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

  return (
    <section className={rootClass} aria-busy={loading || saving}>
      <header className="config-inflacion-header">
        <div>
          <p className="config-inflacion-eyebrow">{t('label_inflation_source')}</p>
          <h2 className="config-inflacion-title">{t('modal_config_inflation_title')}</h2>
        </div>
        <span className="config-inflacion-pill">{t('inflation_source_proxy_dolar')}</span>
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
              disabled={saving}
            >
              {PAISES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} - {t(option.key)}
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
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  title={option.disabled ? t('tooltip_api_unavailable') : undefined}
                >
                  {t(option.key)}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="config-inflacion-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary font-semibold config-inflacion-submit"
            disabled={saving}
          >
            {saving ? t('loading') : t('btn_save')}
          </button>
        </form>
      )}
    </section>
  )
}

export default ConfigInflacionView
