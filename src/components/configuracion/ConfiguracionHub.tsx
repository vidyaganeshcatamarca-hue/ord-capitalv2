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
import { settingIcon, settingGroupIcon } from '@/config/settingsIcons'
import { ToggleSwitch } from './ToggleSwitch'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { MiCuentaCard } from './MiCuentaCard'
import './ConfiguracionHub.css'

const BASE_CERO_HOME_KEY = 'base_cero_como_inicio'
// L17 — persisted open-section id: back from a submenu screen returns expanded.
const OPEN_GROUP_STORAGE_KEY = 'config-hub.open-group-id'

/**
 * Ronda 7 (S7): el dueño pidió icono en todos los submenúes. El mapa vive en
 * src/config/settingsIcons.ts (dato puro, recorrible desde un test) y acá solo
 * quedan las excepciones que el hub pinta con un icono de lucide en vez de un
 * emoji. Cualquier id sin entrada acá sale del mapa compartido.
 */
const ROW_ICON_OVERRIDES: Record<string, ReactNode> = {
  import_export: <FileSpreadsheet size={22} />,
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

/** Icono de una fila: la excepción de lucide o el emoji del mapa compartido. */
function rowIcon(id: string): ReactNode {
  return ROW_ICON_OVERRIDES[id] ?? settingIcon(id)
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
      <span className="config-hub-card-icon" aria-hidden="true">{rowIcon(item.id)}</span>
      <div className="config-hub-card-content">
        <h3>{t(item.titleKey)}</h3>
        {item.descKey && <p>{t(item.descKey)}</p>}
      </div>
      <span className="config-hub-card-pill">{t('config_coming_soon')}</span>
    </article>
  )
}

/** S9 + L15 — el interruptor entre modo Simple y Avanzado. Confirmación en las
 *  DOS direcciones (ronda 7, S10): entrar al avanzado siempre preguntó, y desde
 *  la ronda 7 volver al simple también, porque un toque equivocado cambiaba el
 *  menú sin vuelta atrás visible. */
function ModeSwitchRow({ item }: { item: SettingsMenuItem }) {
  const { activarModoAvanzado, desactivarModoAvanzado, loading } = useModoApp()
  const goAdvanced = item.target === 'mode:to_advanced'
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <button
        type="button"
        className={`config-hub-card${item.featured ? ' config-hub-card--featured' : ''}`}
        onClick={() => setConfirming(true)}
        disabled={loading}
      >
        <span className="config-hub-card-icon" aria-hidden="true">{rowIcon(goAdvanced ? 'go_advanced' : 'back_to_simple')}</span>
        <div className="config-hub-card-content">
          <h3>{t(item.titleKey)}</h3>
          {item.descKey && <p>{t(item.descKey)}</p>}
        </div>
        <span className="config-hub-card-chevron" aria-hidden="true">›</span>
      </button>
      {/* Ronda 7 (S10, dueño): "al volver del modo avanzado al modo simple, pasa
          sin ninguna confirmación previa [...] para que evitemos los errores de
          vuelta al modo simple por error de mala digitación". Las DOS
          direcciones confirman, cada una con su propio texto: entrar y salir del
          modo avanzado cambian el menú, así que ninguno es un toque inocente. */}
      <ConfirmModal
        isOpen={confirming}
        type="primary"
        title={t(goAdvanced ? 'settings_confirm_go_advanced_title' : 'settings_confirm_back_to_simple_title')}
        message={t(goAdvanced ? 'settings_confirm_go_advanced_message' : 'settings_confirm_back_to_simple_message')}
        confirmText={t(goAdvanced ? 'settings_confirm_go_advanced_confirm' : 'settings_confirm_back_to_simple_confirm')}
        cancelText={t('btn_cancel')}
        onConfirm={() => {
          setConfirming(false)
          if (goAdvanced) void activarModoAvanzado()
          else void desactivarModoAvanzado()
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}

function ComponentSlot({ slot, userId }: { slot: string; userId: string | undefined }) {
  switch (slot) {
    // L17 (owner, tanda 2): Perfil is the ONLY in-situ component left; every
    // other submenu navigates to its own screen.
    case 'MiCuentaCard': return <MiCuentaCard />
    default: return null
  }
}

/**
 * L17: Perfil stays in situ (the ONLY in-situ component); Borrado de datos y
 * cuentas navigates to its screen, where the card owns the bug-12 collapsed
 * sub-options, the 10-day + PIN gate and both confirmation flows.
 */
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
        icon={rowIcon(item.id)}
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
      icon={rowIcon(group.id)}
      titleKey={group.titleKey}
      descKey={group.descKey}
      to={group.target.slice('target:'.length)}
    />
  )
}

function isRenderable(item: SettingsMenuItem): boolean {
  return item.soon === true || item.disabled === true || item.target !== null
}

interface SettingsCollapsibleProps {
  id: string
  icon: ReactNode
  titleKey: string
  descKey?: string
  children: ReactNode
  /** Bug 9 — controlled mode: the hub owns the single open state so opening
   *  one top-level section collapses all others (exclusive accordion). */
  open?: boolean
  onOpenChange?: (next: boolean) => void
}

/**
 * U1 (S1) — one reusable accordion section. Every top-level tree group renders
 * through it and starts collapsed. The header mirrors the MiCuentaCard /
 * AparienciaCard pattern (button + aria-expanded + aria-controls + rotating
 * chevron). Leaf rows and the cards that already own their internal state are
 * not wrapped by it; U2 mounts the two inline cards (region / about) through it.
 */
function SettingsCollapsible({ id, icon, titleKey, descKey, children, open: controlledOpen, onOpenChange }: SettingsCollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else setInternalOpen(next)
  }
  const titleId = `${id}-title`
  const bodyId = `${id}-body`
  return (
    <section className="config-hub-card config-hub-collapsible" aria-labelledby={titleId}>
      <button
        type="button"
        className="config-hub-collapsible-header"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span className="config-hub-card-icon" aria-hidden="true">{icon}</span>
        <div className="config-hub-card-content">
          <h2 id={titleId} className="config-hub-collapsible-title">{t(titleKey)}</h2>
          {descKey && <p>{t(descKey)}</p>}
        </div>
        <span
          className={`config-hub-card-chevron config-hub-collapsible-chevron${open ? ' config-hub-collapsible-chevron--open' : ''}`}
          aria-hidden="true"
        >›</span>
      </button>
      {open && (
        <div id={bodyId} className="config-hub-collapsible-body">
          {children}
        </div>
      )}
    </section>
  )
}

/** Bug 9 — exclusive accordion: the hub owns a single open-section id; opening
 *  a section replaces it, so all other expanded top-level sections collapse. */
function SettingsGroupSection({ group, userId, openGroupId, onOpenGroup }: { group: SettingsMenuGroup; userId: string | undefined; openGroupId: string | null; onOpenGroup: (id: string | null) => void }) {
  const subgroups = group.groups ?? []
  const rendered = group.items.filter(isRenderable)
  const renderedSubgroups = subgroups.filter((sub) => sub.target?.startsWith('target:'))
  // An empty group is not rendered: everything in it is still deferred to a later task.
  if (rendered.length === 0 && renderedSubgroups.length === 0) return null

  return (
    <SettingsCollapsible
      id={`config-group-${group.id}`}
      icon={settingGroupIcon(group.id)}
      titleKey={group.titleKey}
      open={openGroupId === group.id}
      onOpenChange={(next) => onOpenGroup(next ? group.id : null)}
    >
      <div className="config-hub-group-cards">
        {rendered.map((item) => (
          <SettingsEntry key={item.id} item={item} userId={userId} />
        ))}
        {renderedSubgroups.map((sub) => <SettingsSubgroup key={sub.id} group={sub} />)}
      </div>
    </SettingsCollapsible>
  )
}

export function ConfiguracionHub() {
  const { user } = useAuth()
  const { modo, proDisponible } = useModoApp()
  const tree = resolveSettingsMenu(modo)
  // Bug 9 — one shared open-section state: opening a section collapses the rest.
  // L17 — the state persists in sessionStorage: returning from a submenu screen
  // remounts the hub and the parent section comes back expanded.
  const [openGroupId, setOpenGroupIdState] = useState<string | null>(
    () => sessionStorage.getItem(OPEN_GROUP_STORAGE_KEY),
  )
  const setOpenGroupId = (id: string | null) => {
    setOpenGroupIdState(id)
    if (id === null) sessionStorage.removeItem(OPEN_GROUP_STORAGE_KEY)
    else sessionStorage.setItem(OPEN_GROUP_STORAGE_KEY, id)
  }

  // S8/S9 — mode switch and placeholder entries live at the primary menu level.
  const rootEntries = tree.rootEntries.filter(
    (entry) => entry.id !== 'go_advanced' || proDisponible,
  )

  return (
    <div className="config-hub">
      {tree.groups.map((group) => (
        <SettingsGroupSection key={group.id} group={group} userId={user?.id} openGroupId={openGroupId} onOpenGroup={setOpenGroupId} />
      ))}
      {rootEntries.map((entry) => (
        <SettingsEntry key={entry.id} item={entry} userId={user?.id} />
      ))}
    </div>
  )
}

export default ConfiguracionHub
