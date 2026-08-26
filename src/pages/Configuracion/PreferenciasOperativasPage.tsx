import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { ToggleSwitch } from '@/components/configuracion/ToggleSwitch'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'

interface WalletOption {
  billetera_id: number
  nombre: string
  moneda: string
  es_fondo_prevision?: boolean
}

interface OperationalPrefs {
  billetera_default_egreso: number | null
  billetera_default_ingreso: number | null
  ocr_auto_aprobar: boolean
  ocr_enabled: boolean
  voz_activada: boolean
  tipo_movimiento_default: 'expense' | 'income'
  orden_billeteras: 'valor' | 'alfabetico' | null
}

const DEFAULT_PREFS: OperationalPrefs = {
  billetera_default_egreso: null,
  billetera_default_ingreso: null,
  ocr_auto_aprobar: false,
  ocr_enabled: true,
  voz_activada: true,
  tipo_movimiento_default: 'expense',
  orden_billeteras: 'valor',
}

export function PreferenciasOperativasPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [prefs, setPrefs] = useState<OperationalPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      setLoading(true)
      try {
        const [walletData, prefData] = await Promise.all([
          rpc<WalletOption[]>('fn_obtener_billeteras_activas').catch(() => [] as WalletOption[]),
          rpc<OperationalPrefs[]>('fn_obtener_preferencias_usuario').catch(() => [] as OperationalPrefs[]),
        ])
        if (cancelled) return
        const row = Array.isArray(prefData) ? prefData[0] : prefData
        setWallets(walletData ?? [])
        if (row) {
          const localTipo = localStorage.getItem('tipo_movimiento_default') as 'expense' | 'income'
          setPrefs({ 
            ...DEFAULT_PREFS, 
            ...row,
            tipo_movimiento_default: localTipo === 'income' ? 'income' : 'expense'
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadConfig()
    return () => { cancelled = true }
  }, [])

  const operationalWallets = useMemo(
    () => wallets.filter((w) => !w.es_fondo_prevision),
    [wallets]
  )

  const savePreferences = async (newPrefs: OperationalPrefs) => {
    try {
      await rpc('fn_actualizar_preferencia_usuario', {
        p_billetera_default_egreso: newPrefs.billetera_default_egreso ?? -1,
        p_billetera_default_ingreso: newPrefs.billetera_default_ingreso ?? -1,
        p_ocr_auto_aprobar: newPrefs.ocr_auto_aprobar,
        p_voz_activada: newPrefs.voz_activada,
        p_orden_billeteras: newPrefs.orden_billeteras ?? 'valor',
      })
      localStorage.setItem('tipo_movimiento_default', newPrefs.tipo_movimiento_default)
      if (newPrefs.billetera_default_egreso) {
        localStorage.setItem('billetera_default_egreso', String(newPrefs.billetera_default_egreso))
      } else {
        localStorage.removeItem('billetera_default_egreso')
      }
      if (newPrefs.billetera_default_ingreso) {
        localStorage.setItem('billetera_default_ingreso', String(newPrefs.billetera_default_ingreso))
      } else {
        localStorage.removeItem('billetera_default_ingreso')
      }
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

  const updatePref = <K extends keyof OperationalPrefs>(key: K, value: OperationalPrefs[K]) => {
    const nextPrefs = { ...prefs, [key]: value }
    setPrefs(nextPrefs)
    savePreferences(nextPrefs)
  }

  return (
    <main className="page config-page" aria-labelledby="operational-config-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="operational-config-title">{t('config_section_operational')}</h1>
        <p>{loading ? t('config_loading') : t('config_operational_desc')}</p>
      </header>

      <section className="config-section-list" aria-label={t('config_section_operational')}>

        {/* Atajos de navegación */}
        <article className="config-section-card">
          <h2>{t('config_operational_shortcuts')}</h2>
          <div className="config-section-actions">
            <button type="button" className="config-section-action" onClick={() => navigate('/billeteras?backTo=/configuracion/operativas')}>
              <span className="config-section-action-icon" aria-hidden="true">💳</span>
              <span>
                <span className="config-section-action-title">{t('config_billeteras')}</span>
                <span className="config-section-action-desc">{t('config_billeteras_desc')}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
            <button type="button" className="config-section-action" onClick={() => navigate('/billeteras?tab=categorias_egresos&backTo=/configuracion/operativas')}>
              <span className="config-section-action-icon" aria-hidden="true">🏷️</span>
              <span>
                <span className="config-section-action-title">{t('config_categorias')}</span>
                <span className="config-section-action-desc">{t('config_categorias_desc')}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
            <button type="button" className="config-section-action" onClick={() => navigate('/configuracion/hogar')}>
              <span className="config-section-action-icon" aria-hidden="true">👥</span>
              <span>
                <span className="config-section-action-title">{t('config_hogar')}</span>
                <span className="config-section-action-desc">{t('config_hogar_desc')}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </article>

        {/* Billeteras predeterminadas */}
        <article className="config-section-card">
          <h2>{t('config_default_wallets')}</h2>
          <div className="config-section-field">
            <label htmlFor="default-expense-wallet">{t('config_default_wallet_expense')}</label>
            <select
              id="default-expense-wallet"
              value={prefs.billetera_default_egreso ?? ''}
              onChange={(e) => updatePref('billetera_default_egreso', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('config_none')}</option>
              {operationalWallets.map((w) => (
                <option key={w.billetera_id} value={w.billetera_id}>
                  {w.nombre === 'wallet_cash_default_name' ? t('wallet_cash_default_name') : t(w.nombre)} ({w.moneda})
                </option>
              ))}
            </select>
          </div>
          <div className="config-section-field">
            <label htmlFor="default-income-wallet">{t('config_default_wallet_income')}</label>
            <select
              id="default-income-wallet"
              value={prefs.billetera_default_ingreso ?? ''}
              onChange={(e) => updatePref('billetera_default_ingreso', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('config_none')}</option>
              {operationalWallets.map((w) => (
                <option key={w.billetera_id} value={w.billetera_id}>
                  {w.nombre === 'wallet_cash_default_name' ? t('wallet_cash_default_name') : t(w.nombre)} ({w.moneda})
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de movimiento predeterminado al tocar + */}
          <div className="config-section-field">
            <label>{t('config_tipo_movimiento_default')}</label>
            <p style={{ margin: '2px 0 8px', color: 'var(--text-3)', fontSize: 'calc(0.8rem * var(--font-scale))' }}>
              {t('config_tipo_movimiento_default_desc')}
            </p>
            <div className="config-segmented">
              <button
                type="button"
                className={`config-seg-btn ${prefs.tipo_movimiento_default === 'expense' ? 'config-seg-btn--active config-seg-btn--expense' : ''}`}
                onClick={() => updatePref('tipo_movimiento_default', 'expense')}
              >
                {t('config_tipo_movimiento_egreso')}
              </button>
              <button
                type="button"
                className={`config-seg-btn ${prefs.tipo_movimiento_default === 'income' ? 'config-seg-btn--active config-seg-btn--income' : ''}`}
                onClick={() => updatePref('tipo_movimiento_default', 'income')}
              >
                {t('config_tipo_movimiento_ingreso')}
              </button>
            </div>
          </div>
        </article>

        {/* Orden de billeteras */}
        <article className="config-section-card">
          <h2>{t('config_wallet_order_section')}</h2>
          <div className="config-section-field">
            <label>{t('config_wallet_order_label')}</label>
            <div className="config-segmented">
              <button
                type="button"
                className={`config-seg-btn ${(prefs.orden_billeteras ?? 'valor') === 'valor' ? 'config-seg-btn--active' : ''}`}
                onClick={() => updatePref('orden_billeteras', 'valor')}
              >
                {t('config_wallet_order_value')}
              </button>
              <button
                type="button"
                className={`config-seg-btn ${prefs.orden_billeteras === 'alfabetico' ? 'config-seg-btn--active' : ''}`}
                onClick={() => updatePref('orden_billeteras', 'alfabetico')}
              >
                {t('config_wallet_order_alphabetical')}
              </button>
            </div>
          </div>
        </article>

        {/* Automatización */}
        <article className="config-section-card">
          <h2>{t('config_automation_section')}</h2>

          <div className="config-section-inline">
            <div>
              <span style={{ color: 'var(--text)', fontSize: 'calc(0.9rem * var(--font-scale))' }}>{t('config_ocr_enabled')}</span>
              <p style={{ margin: '2px 0 0', color: 'var(--text-3)', fontSize: 'calc(0.78rem * var(--font-scale))' }}>{t('config_ocr_enabled_desc')}</p>
            </div>
            <ToggleSwitch
              checked={prefs.ocr_enabled}
              onChange={(v) => updatePref('ocr_enabled', v)}
            />
          </div>

          <div className="config-section-inline" style={{ marginTop: 10 }}>
            <div>
              <span style={{ color: 'var(--text)', fontSize: 'calc(0.9rem * var(--font-scale))' }}>{t('config_voice_enabled')}</span>
              <p style={{ margin: '2px 0 0', color: 'var(--text-3)', fontSize: 'calc(0.78rem * var(--font-scale))' }}>{t('config_voice_enabled_desc')}</p>
            </div>
            <ToggleSwitch
              checked={prefs.voz_activada}
              onChange={(v) => updatePref('voz_activada', v)}
            />
          </div>

          <div className="config-section-inline" style={{ marginTop: 10 }}>
            <span style={{ color: 'var(--text)', fontSize: 'calc(0.9rem * var(--font-scale))' }}>{t('config_ocr_auto_approve')}</span>
            <ToggleSwitch
              checked={prefs.ocr_auto_aprobar}
              onChange={(v) => updatePref('ocr_auto_aprobar', v)}
            />
          </div>
        </article>

      </section>
    </main>
  )
}

export default PreferenciasOperativasPage
