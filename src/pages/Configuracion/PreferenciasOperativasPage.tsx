import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
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

interface CategoryNode {
  estructura_id: number
  nombre_cuenta: string
  hijos?: CategoryNode[]
}

interface OperationalPrefs {
  billetera_default_egreso: number | null
  billetera_default_ingreso: number | null
  categoria_default_sin_clasificar: number | null
  ocr_auto_aprobar: boolean
  ocr_confianza_minima: number
  voz_activada: boolean
}

const DEFAULT_PREFS: OperationalPrefs = {
  billetera_default_egreso: null,
  billetera_default_ingreso: null,
  categoria_default_sin_clasificar: null,
  ocr_auto_aprobar: false,
  ocr_confianza_minima: 80,
  voz_activada: true,
}

function flattenCategories(nodes: CategoryNode[]) {
  return nodes.flatMap((node) => {
    const children = node.hijos ?? []
    if (children.length === 0) return [node]
    return children.map((child) => ({
      ...child,
      nombre_cuenta: `${node.nombre_cuenta} / ${child.nombre_cuenta}`,
    }))
  })
}

export function PreferenciasOperativasPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [prefs, setPrefs] = useState<OperationalPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      setLoading(true)
      try {
        const [walletData, categoryData, prefData] = await Promise.all([
          rpc<WalletOption[]>('fn_obtener_billeteras_activas').catch(() => [] as WalletOption[]),
          rpc<CategoryNode[]>('fn_obtener_arbol_categorias').catch(() => [] as CategoryNode[]),
          rpc<OperationalPrefs[]>('fn_obtener_preferencias_usuario').catch(() => [] as OperationalPrefs[]),
        ])

        if (cancelled) return
        const row = Array.isArray(prefData) ? prefData[0] : prefData
        setWallets(walletData ?? [])
        setCategories(flattenCategories(categoryData ?? []))
        if (row) setPrefs({ ...DEFAULT_PREFS, ...row })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadConfig()
    return () => { cancelled = true }
  }, [])

  const operationalWallets = useMemo(
    () => wallets.filter((wallet) => !wallet.es_fondo_prevision),
    [wallets]
  )

  const save = async () => {
    setSaving(true)
    try {
      await rpc('fn_actualizar_preferencia_usuario', {
        p_billetera_default_egreso: prefs.billetera_default_egreso,
        p_billetera_default_ingreso: prefs.billetera_default_ingreso,
        p_categoria_default_sin_clasificar: prefs.categoria_default_sin_clasificar,
        p_ocr_auto_aprobar: prefs.ocr_auto_aprobar,
        p_ocr_confianza_minima: prefs.ocr_confianza_minima,
        p_voz_activada: prefs.voz_activada,
      })
      showToast(t('success_preferences_saved'), 'success')
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page config-page" aria-labelledby="operational-config-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="operational-config-title">{t('config_section_operational')}</h1>
        <p>{loading ? t('config_loading') : t('config_operational_desc')}</p>
      </header>

      <section className="config-section-list" aria-label={t('config_section_operational')}>
        <article className="config-section-card">
          <h2>{t('config_operational_shortcuts')}</h2>
          <div className="config-section-actions">
            <button type="button" className="config-section-action" onClick={() => navigate('/billeteras')}>
              <span className="config-section-action-icon" aria-hidden="true">💳</span>
              <span>
                <span className="config-section-action-title">{t('config_billeteras')}</span>
                <span className="config-section-action-desc">{t('config_billeteras_desc')}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
            <button type="button" className="config-section-action" onClick={() => navigate('/configuracion/categorias')}>
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

        <article className="config-section-card">
          <h2>{t('config_default_wallets')}</h2>
          <div className="config-section-field">
            <label htmlFor="default-expense-wallet">{t('config_default_wallet_expense')}</label>
            <select id="default-expense-wallet" value={prefs.billetera_default_egreso ?? ''} onChange={(event) => setPrefs((current) => ({ ...current, billetera_default_egreso: event.target.value ? Number(event.target.value) : null }))}>
              <option value="">{t('config_none')}</option>
              {operationalWallets.map((wallet) => (
                <option key={wallet.billetera_id} value={wallet.billetera_id}>{wallet.nombre} ({wallet.moneda})</option>
              ))}
            </select>
          </div>
          <div className="config-section-field">
            <label htmlFor="default-income-wallet">{t('config_default_wallet_income')}</label>
            <select id="default-income-wallet" value={prefs.billetera_default_ingreso ?? ''} onChange={(event) => setPrefs((current) => ({ ...current, billetera_default_ingreso: event.target.value ? Number(event.target.value) : null }))}>
              <option value="">{t('config_none')}</option>
              {operationalWallets.map((wallet) => (
                <option key={wallet.billetera_id} value={wallet.billetera_id}>{wallet.nombre} ({wallet.moneda})</option>
              ))}
            </select>
          </div>
        </article>

        <article className="config-section-card">
          <h2>{t('config_default_category')}</h2>
          <div className="config-section-field">
            <label htmlFor="default-category">{t('config_default_category')}</label>
            <select id="default-category" value={prefs.categoria_default_sin_clasificar ?? ''} onChange={(event) => setPrefs((current) => ({ ...current, categoria_default_sin_clasificar: event.target.value ? Number(event.target.value) : null }))}>
              <option value="">{t('config_none')}</option>
              {categories.map((category) => (
                <option key={category.estructura_id} value={category.estructura_id}>{category.nombre_cuenta}</option>
              ))}
            </select>
          </div>
        </article>

        <article className="config-section-card">
          <h2>{t('config_automation')}</h2>
          <label className="config-section-inline">
            <span>{t('config_ocr_auto_approve')}</span>
            <input type="checkbox" checked={prefs.ocr_auto_aprobar} onChange={(event) => setPrefs((current) => ({ ...current, ocr_auto_aprobar: event.target.checked }))} />
          </label>
          <div className="config-section-field">
            <label htmlFor="ocr-confidence">{t('config_ocr_confidence')}</label>
            <select id="ocr-confidence" value={prefs.ocr_confianza_minima} onChange={(event) => setPrefs((current) => ({ ...current, ocr_confianza_minima: Number(event.target.value) }))}>
              <option value={70}>70%</option>
              <option value={80}>80%</option>
              <option value={90}>90%</option>
            </select>
          </div>
          <label className="config-section-inline">
            <span>{t('config_voice_enabled')}</span>
            <input type="checkbox" checked={prefs.voz_activada} onChange={(event) => setPrefs((current) => ({ ...current, voz_activada: event.target.checked }))} />
          </label>
          <button type="button" className="config-section-save" disabled={saving || loading} onClick={save}>
            {saving ? t('btn_saving') : t('btn_save_changes')}
          </button>
        </article>
      </section>
    </main>
  )
}

export default PreferenciasOperativasPage
