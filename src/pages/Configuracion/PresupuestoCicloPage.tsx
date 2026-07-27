import { useEffect, useState } from 'react'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { ToggleSwitch } from '@/components/configuracion/ToggleSwitch'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'

const BASE_CERO_HOME_KEY = 'base_cero_como_inicio'

interface BudgetConfig {
  modo_presupuesto: 'anticipado' | 'base_cero'
  porcentaje_necesidades: number
  porcentaje_deseos: number
  porcentaje_ahorro: number
  porcentaje_diezmo: number
  dia_ancla_ciclo: number
}

const DEFAULT_CONFIG: BudgetConfig = {
  modo_presupuesto: 'anticipado',
  porcentaje_necesidades: 50,
  porcentaje_deseos: 30,
  porcentaje_ahorro: 20,
  porcentaje_diezmo: 0,
  dia_ancla_ciclo: 1,
}

export function PresupuestoCicloPage() {
  const { showToast } = useToast()
  const [config, setConfig] = useState<BudgetConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [baseCeroComoInicio, setBaseCeroComoInicio] = useState(
    () => localStorage.getItem(BASE_CERO_HOME_KEY) === 'true'
  )

  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      setLoading(true)
      try {
        const data = await rpc<BudgetConfig[]>('fn_obtener_config_presupuesto')
        if (cancelled) return
        const row = Array.isArray(data) ? data[0] : data
        if (row) {
          setConfig({
            modo_presupuesto: (row.modo_presupuesto as 'anticipado' | 'base_cero') || 'anticipado',
            porcentaje_necesidades: Number(row.porcentaje_necesidades) || 50,
            porcentaje_deseos: Number(row.porcentaje_deseos) || 30,
            porcentaje_ahorro: Number(row.porcentaje_ahorro) || 20,
            porcentaje_diezmo: Number(row.porcentaje_diezmo) || 0,
            dia_ancla_ciclo: Number(row.dia_ancla_ciclo) || 1,
          })
        }
      } catch (err) {
        showToast(parseError(err), 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadConfig()
    return () => { cancelled = true }
  }, [showToast])

  const sumPercentages = config.porcentaje_necesidades + config.porcentaje_deseos + config.porcentaje_ahorro + config.porcentaje_diezmo
  const isRulesValid = sumPercentages === 100

  const saveReglas = async (newConfig: BudgetConfig) => {
    const sum = newConfig.porcentaje_necesidades + newConfig.porcentaje_deseos + newConfig.porcentaje_ahorro + newConfig.porcentaje_diezmo
    if (sum !== 100) return // Solo guardamos si la suma es válida

    setSaving(true)
    try {
      await rpc('fn_configurar_reglas_oro', {
        p_pct_necesidades: newConfig.porcentaje_necesidades,
        p_pct_deseos: newConfig.porcentaje_deseos,
        p_pct_ahorro: newConfig.porcentaje_ahorro,
        p_pct_diezmo: newConfig.porcentaje_diezmo,
        p_dia_ancla_ciclo: newConfig.dia_ancla_ciclo,
      })
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveModo = async (modo: 'anticipado' | 'base_cero') => {
    setSaving(true)
    try {
      await rpc('fn_configurar_modo_presupuesto', { p_modo: modo })
      window.dispatchEvent(new CustomEvent('budget-mode-changed'))
      showToast(t('success_preferences_saved'), 'success')
    } catch (err) {
      showToast(parseError(err), 'error')
      // Revertir estado si falla
      setConfig(prev => ({ ...prev, modo_presupuesto: modo === 'base_cero' ? 'anticipado' : 'base_cero' }))
    } finally {
      setSaving(false)
    }
  }

  const updateMode = (modo: 'anticipado' | 'base_cero') => {
    const nextConfig = { ...config, modo_presupuesto: modo }
    setConfig(nextConfig)
    saveModo(modo)
  }

  const updateField = <K extends keyof BudgetConfig>(key: K, value: BudgetConfig[K]) => {
    const nextConfig = { ...config, [key]: value }
    setConfig(nextConfig)
    saveReglas(nextConfig)
  }

  const handleToggleBaseCeroInicio = (val: boolean) => {
    setBaseCeroComoInicio(val)
    localStorage.setItem(BASE_CERO_HOME_KEY, String(val))
    window.dispatchEvent(new Event('base-cero-home-changed'))
  }

  return (
    <main className="page config-page" aria-labelledby="budget-config-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="budget-config-title">{t('config_section_budget')}</h1>
        <p>{loading ? t('config_loading') : t('config_budget_desc')}</p>
      </header>

      <section className="config-section-list" aria-label={t('config_section_budget')}>
        
        {/* Modo de Presupuesto */}
        <article className="config-section-card">
          <h2>{t('config_budget_mode_title')}</h2>
          <div className="config-section-field">
            <label htmlFor="modo-presupuesto">{t('config_budget_mode_label')}</label>
            <select
              id="modo-presupuesto"
              value={config.modo_presupuesto}
              onChange={(e) => updateMode(e.target.value as 'anticipado' | 'base_cero')}
              disabled={loading || saving}
            >
              <option value="anticipado">🕊️ {t('budget_mode_anticipado')}</option>
              <option value="base_cero">🔒 {t('budget_mode_base_cero')}</option>
            </select>
          </div>

          {config.modo_presupuesto === 'base_cero' && (
            <div className="config-section-inline" style={{ marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div>
                <span style={{ color: 'var(--text)', fontSize: 'calc(0.9rem * var(--font-scale))', fontWeight: 650 }}>
                  {t('config_base_cero_home_toggle')}
                </span>
                <p style={{ margin: '2px 0 0', color: 'var(--text-3)', fontSize: 'calc(0.78rem * var(--font-scale))' }}>
                  {t('config_base_cero_home_toggle_desc')}
                </p>
              </div>
              <ToggleSwitch checked={baseCeroComoInicio} onChange={handleToggleBaseCeroInicio} />
            </div>
          )}
        </article>

        {/* Reglas de Oro */}
        <article className="config-section-card">
          <h2>{t('budget_modal_title_golden_rules')}</h2>
          <p>{t('budget_label_ideal_distribution')}</p>
          
          <div className="config-section-field">
            <label htmlFor="dia-ancla">{t('config_budget_anchor_day_label')}</label>
            <select
              id="dia-ancla"
              value={config.dia_ancla_ciclo}
              onChange={(e) => updateField('dia_ancla_ciclo', Number(e.target.value))}
              disabled={loading}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>

          <div className="config-section-field">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>🏠 {t('budget_rule_necesidades')}</span>
              <span>{config.porcentaje_necesidades}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={config.porcentaje_necesidades}
              onChange={(e) => updateField('porcentaje_necesidades', Number(e.target.value))}
              disabled={loading}
            />
          </div>

          <div className="config-section-field">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>✨ {t('budget_rule_deseos')}</span>
              <span>{config.porcentaje_deseos}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={config.porcentaje_deseos}
              onChange={(e) => updateField('porcentaje_deseos', Number(e.target.value))}
              disabled={loading}
            />
          </div>

          <div className="config-section-field">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>💎 {t('budget_rule_ahorro')}</span>
              <span>{config.porcentaje_ahorro}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={config.porcentaje_ahorro}
              onChange={(e) => updateField('porcentaje_ahorro', Number(e.target.value))}
              disabled={loading}
            />
          </div>

          <div className="config-section-field">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>🙏 {t('budget_rule_diezmo')}</span>
              <span>{config.porcentaje_diezmo}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={config.porcentaje_diezmo}
              onChange={(e) => updateField('porcentaje_diezmo', Number(e.target.value))}
              disabled={loading}
            />
          </div>

          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: 'calc(0.9rem * var(--font-scale))',
              backgroundColor: isRulesValid ? 'rgba(78, 205, 196, 0.12)' : 'rgba(255, 107, 107, 0.12)',
              color: isRulesValid ? 'var(--mint)' : 'var(--coral)',
              border: `1px solid ${isRulesValid ? 'rgba(78, 205, 196, 0.3)' : 'rgba(255, 107, 107, 0.3)'}`
            }}
          >
            {isRulesValid
              ? `✅ Total: 100% — ${t('budget_rules_valid_sum')}`
              : `⚠️ Total: ${sumPercentages}% — ${t('budget_rules_invalid_sum')}`}
          </div>
        </article>

      </section>
    </main>
  )
}

export default PresupuestoCicloPage
