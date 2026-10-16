import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useModoApp } from '@/contexts/ModoAppContext'
import { rpc } from '@/lib/supabase'
import { t } from '@/locales/i18n'
import { resolveSettingsMenu } from '@/config/settingsMenu'
import type { SettingsMenuGroup, SettingsMenuItem } from '@/config/settingsMenu'
import { ToggleSwitch } from './ToggleSwitch'
import { MiCuentaCard } from './MiCuentaCard'
import { AparienciaCard } from './AparienciaCard'
import { NotificacionesCard } from './NotificacionesCard'
import { PWACard } from './PWACard'
import { MantenimientoAppCard } from './MantenimientoAppCard'
import './ConfiguracionHub.css'

const BASE_CERO_HOME_KEY = 'base_cero_como_inicio'

/** Icon of every row the hub renders from a `target:` destination. */
const ROW_ICONS: Record<string, ReactNode> = {
  region_format: '🌍',
  load_registry: '⚙️',
  home_config: '👥',
  import_export: <FileSpreadsheet size={22} />,
  about: '📱',
  report_issue: '🐞',
  my_reports: '📋',
  guided_tour: '🧭',
}

/**
 * Router state some rows carry so their destination still knows where the
 * user came from (report flows). Preserved from the support rows that used to
 * live in ConfiguracionPage before T2 wired them into the tree.
 */
const ROW_STATE: Record<string, Record<string, unknown>> = {
  report_issue: { origen: '/configuracion' },
  my_reports: { origen: '/configuracion' },
}

interface ConfigLinkCardProps {
  icon: ReactNode
  titleKey: string
  descKey?: string
  to: string
  state?: Record<string, unknown>
}

function ConfigLinkCard({ icon, titleKey, descKey, to, state }: ConfigLinkCardProps) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="config-hub-card"
      onClick={() => navigate(to, state ? { state } : undefined)}
    >
      <span className="config-hub-card-icon" aria-hidden="true">{icon}</span>
      <div className="config-hub-card-content">
        <h3>{t(titleKey)}</h3>
        {descKey && <p>{t(descKey)}</p>}
      </div>
      <span className="config-hub-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

/** Placeholder row: declared by the spec, no destination until its feature lands. */
function ConfigSoonCard({ item }: { item: SettingsMenuItem }) {
  return (
    <article className="config-hub-card config-hub-card--soon" aria-disabled="true">
      <span className="config-hub-card-icon" aria-hidden="true">{ROW_ICONS[item.id] ?? '✨'}</span>
      <div className="config-hub-card-content">
        <h3>{t(item.titleKey)}</h3>
        {item.descKey && <p>{t(item.descKey)}</p>}
      </div>
      <span className="config-hub-card-pill">{t('config_coming_soon')}</span>
    </article>
  )
}

/** S9 — the asymmetric Simple/Avanzado switch (same logic as ModoAppCard). */
function ModeSwitchRow({ item }: { item: SettingsMenuItem }) {
  const { activarModoAvanzado, desactivarModoAvanzado, loading } = useModoApp()
  const goAdvanced = item.target === 'mode:to_advanced'
  return (
    <button
      type="button"
      className={`config-hub-card${item.featured ? ' config-hub-card--featured' : ''}`}
      onClick={() => { void (goAdvanced ? activarModoAvanzado() : desactivarModoAvanzado()) }}
      disabled={loading}
    >
      <span className="config-hub-card-icon" aria-hidden="true">{goAdvanced ? '🚀' : '↩️'}</span>
      <div className="config-hub-card-content">
        <h3>{t(item.titleKey)}</h3>
        {item.descKey && <p>{t(item.descKey)}</p>}
      </div>
      <span className="config-hub-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

function PresupuestoCicloCard() {
  const navigate = useNavigate()
  const [isBaseCero, setIsBaseCero] = useState(false)
  const [baseCeroComoInicio, setBaseCeroComoInicio] = useState(
    () => localStorage.getItem(BASE_CERO_HOME_KEY) === 'true'
  )

  useEffect(() => {
    let cancelled = false
    rpc<Array<{ modo_presupuesto: string }>>('fn_obtener_preferencias_usuario')
      .then((data) => {
        if (cancelled) return
        const row = Array.isArray(data) ? data[0] : data
        if (row?.modo_presupuesto === 'base_cero') setIsBaseCero(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const toggleBaseCeroInicio = (val: boolean) => {
    setBaseCeroComoInicio(val)
    localStorage.setItem(BASE_CERO_HOME_KEY, String(val))
    window.dispatchEvent(new Event('base-cero-home-changed'))
  }

  return (
    <article className="config-hub-card presupuesto-ciclo-card" aria-labelledby="presupuesto-ciclo-title">
      <button
        type="button"
        className="presupuesto-ciclo-header"
        onClick={() => navigate('/presupuesto?openConfig=1&returnTo=configuracion')}
        aria-label={t('config_presupuesto_config_btn')}
      >
        <span className="config-hub-card-icon" aria-hidden="true">💰</span>
        <div className="config-hub-card-content">
          <h3 id="presupuesto-ciclo-title">{t('config_section_budget')}</h3>
          <p>{t('config_budget_desc')}</p>
        </div>
        <span className="config-hub-card-chevron" aria-hidden="true">›</span>
      </button>

      {isBaseCero && (
        <div className="presupuesto-ciclo-toggle">
          <div className="presupuesto-ciclo-toggle-label">
            <span>{t('config_base_cero_home_toggle')}</span>
            <p>{t('config_base_cero_home_toggle_desc')}</p>
          </div>
          <ToggleSwitch checked={baseCeroComoInicio} onChange={toggleBaseCeroInicio} />
        </div>
      )}
    </article>
  )
}

function ComponentSlot({ slot, userId }: { slot: string; userId: string | undefined }) {
  switch (slot) {
    case 'MiCuentaCard': return <MiCuentaCard />
    case 'AparienciaCard': return <AparienciaCard userId={userId} />
    case 'NotificacionesCard': return <NotificacionesCard />
    case 'PWACard': return <PWACard />
    case 'MantenimientoAppCard': return <MantenimientoAppCard />
    case 'PresupuestoCicloCard': return <PresupuestoCicloCard />
    default: return null
  }
}

/** Renders one entry of the resolved tree. */
function SettingsEntry({ item, userId }: { item: SettingsMenuItem; userId: string | undefined }) {
  if (item.soon || item.disabled) return <ConfigSoonCard item={item} />
  if (!item.target) return null
  if (item.target.startsWith('mode:')) return <ModeSwitchRow item={item} />
  if (item.target.startsWith('component:')) {
    return <ComponentSlot slot={item.target.slice('component:'.length)} userId={userId} />
  }
  if (item.target.startsWith('target:')) {
    return (
      <ConfigLinkCard
        icon={ROW_ICONS[item.id] ?? '•'}
        titleKey={item.titleKey}
        descKey={item.descKey}
        to={item.target.slice('target:'.length)}
        state={ROW_STATE[item.id]}
      />
    )
  }
  return null
}

/**
 * A subgroup with a target renders as one row until its leaves are wired
 * (T2/T4); the leaves are already declared by settingsMenu.
 */
function SettingsSubgroup({ group }: { group: SettingsMenuGroup }) {
  if (!group.target?.startsWith('target:')) return null
  return (
    <ConfigLinkCard
      icon={ROW_ICONS[group.id] ?? '⚙️'}
      titleKey={group.titleKey}
      descKey={group.descKey}
      to={group.target.slice('target:'.length)}
    />
  )
}

function isRenderable(item: SettingsMenuItem): boolean {
  return item.soon === true || item.disabled === true || item.target !== null
}

function SettingsGroupSection({ group, userId }: { group: SettingsMenuGroup; userId: string | undefined }) {
  const subgroups = group.groups ?? []
  const rendered = group.items.filter(isRenderable)
  const renderedSubgroups = subgroups.filter((sub) => sub.target?.startsWith('target:'))
  // An empty group is not rendered: everything in it is still deferred to a later task.
  if (rendered.length === 0 && renderedSubgroups.length === 0) return null

  const titleId = `config-group-${group.id}`
  return (
    <section className="config-hub-group" aria-labelledby={titleId}>
      <h2 id={titleId} className="config-hub-group-title">{t(group.titleKey)}</h2>
      <div className="config-hub-group-cards">
        {rendered.map((item) => (
          <SettingsEntry key={item.id} item={item} userId={userId} />
        ))}
        {renderedSubgroups.map((sub) => <SettingsSubgroup key={sub.id} group={sub} />)}
      </div>
    </section>
  )
}

export function ConfiguracionHub() {
  const { user } = useAuth()
  const { modo, proDisponible } = useModoApp()
  const tree = resolveSettingsMenu(modo)

  // S8/S9 — mode switch and placeholder entries live at the primary menu level.
  const rootEntries = tree.rootEntries.filter(
    (entry) => entry.id !== 'go_advanced' || proDisponible,
  )

  return (
    <div className="config-hub">
      {tree.groups.map((group) => (
        <SettingsGroupSection key={group.id} group={group} userId={user?.id} />
      ))}
      {rootEntries.map((entry) => (
        <SettingsEntry key={entry.id} item={entry} userId={user?.id} />
      ))}
    </div>
  )
}

export default ConfiguracionHub
