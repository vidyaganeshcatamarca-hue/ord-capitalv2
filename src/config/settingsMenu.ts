// src/config/settingsMenu.ts
// Ajustes menu definition per app mode — feature: menu-ajustes, task T1.
//
// Pure data + pure resolver: no React, no backend access, no network, no side effects.
// The tree is the single source of truth for WHAT Ajustes shows per mode; the
// hub (ConfiguracionHub.tsx) decides HOW each entry is rendered.
//
// Entry shape (see SettingsMenuItem):
//   - id:       english snake_case identifier, unique across a tree.
//   - titleKey: i18n key (settings_group_* / settings_entry_* / settings_action_*).
//   - descKey:  optional i18n key for the row subtitle.
//   - target:   'target:<route>' | 'component:<slot>' | 'mode:to_advanced'
//               | 'mode:to_simple' | null (placeholder without destination yet).
//   - soon / disabled / featured: visibility and emphasis flags.
//
// Specs covered here: S2 (Simple tree), S3 (Advanced tree), S5 (no OCR
// auto-approval entry), S6 (PIN placeholder is advanced-only), S8 (invite/rate
// as root entries), S9 (asymmetric mode switch), S10 (all copy through i18n),
// S11/S12 (Ayuda y soporte), S14 (hogar inside Datos y operaciones),
// S15 (deletion entry in Cuenta y seguridad, both modes).

export type SettingsMenuModo = 'simple' | 'avanzado'

export interface SettingsMenuItem {
  id: string
  titleKey: string
  descKey?: string
  target: string | null
  soon?: boolean
  disabled?: boolean
  featured?: boolean
}

export interface SettingsMenuGroup {
  id: string
  titleKey: string
  /**
   * A subgroup with a target renders as a single row until its leaves are
   * wired (T2/T4). Its leaves are already declared for the spec contract.
   */
  descKey?: string
  target?: string | null
  items: SettingsMenuItem[]
  groups?: SettingsMenuGroup[]
}

export interface SettingsMenuTree {
  modo: SettingsMenuModo
  groups: SettingsMenuGroup[]
  /** Entries that sit at the same level as the primary groups (S8, S9). */
  rootEntries: SettingsMenuItem[]
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry))
    Object.freeze(value)
  }
  return value
}

// ── Shared entries ─────────────────────────────────────────────────────────
// S11/S12 — Ayuda y soporte is identical in both modes. T2 wired all three
// rows through the hub: report_issue, my_reports and the guided tour.
const HELP_SUPPORT_GROUP: SettingsMenuGroup = {
  id: 'help_support',
  titleKey: 'settings_group_help_support',
  items: [
    {
      id: 'report_issue',
      titleKey: 'settings_entry_report_issue',
      descKey: 'ajustes_reportar_problema_desc',
      target: 'target:/reportar-problema',
    },
    {
      id: 'my_reports',
      titleKey: 'settings_entry_my_reports',
      descKey: 'ajustes_mis_reportes_desc',
      target: 'target:/mis-reportes',
    },
    {
      id: 'guided_tour',
      titleKey: 'settings_entry_guided_tour',
      target: 'target:/ayuda',
    },
  ],
}

// S7 — Acerca de keeps Versión + Legal (existing AcercaPage interior) and
// declares the Plan/Suscripción placeholder. Like Carga y registro, it renders
// as a single row (its target) until its leaves are wired; declaring the leaf
// keeps the spec contract in the tree.
const ABOUT_GROUP: SettingsMenuGroup = {
  id: 'about',
  titleKey: 'settings_entry_about',
  descKey: 'config_about_desc',
  target: 'target:/configuracion/acerca',
  items: [
    {
      // S7 — placeholder only: the subscription feature is out of this phase.
      id: 'plan_subscription',
      titleKey: 'settings_entry_plan_subscription',
      descKey: 'settings_entry_plan_subscription_desc',
      target: null,
      soon: true,
    },
  ],
}

const APPLICATION_GROUP: SettingsMenuGroup = {
  id: 'application',
  titleKey: 'settings_group_application',
  items: [
    { id: 'install_app', titleKey: 'settings_entry_install_app', target: 'component:PWACard' },
    {
      id: 'maintenance',
      titleKey: 'settings_entry_maintenance',
      target: 'component:MantenimientoAppCard',
    },
  ],
  groups: [ABOUT_GROUP],
}

// S8 — root entries, disabled until the feature exists.
const INVITE_FRIEND_ENTRY: SettingsMenuItem = {
  id: 'invite_friend',
  titleKey: 'settings_action_invite_friend',
  descKey: 'config_invite_desc',
  target: null,
  disabled: true,
  soon: true,
}

const RATE_APP_ENTRY: SettingsMenuItem = {
  id: 'rate_app',
  titleKey: 'settings_action_rate_app',
  descKey: 'config_rate_desc',
  target: null,
  disabled: true,
  soon: true,
}

const PROFILE_ENTRY: SettingsMenuItem = {
  id: 'profile',
  titleKey: 'settings_entry_profile',
  target: 'component:MiCuentaCard',
}

// S15 / T3 — the deletion entry lives in Cuenta y seguridad in BOTH trees under
// the same access rule (first 10 days without PIN, then the security PIN of mode
// Avanzado). It is a live entry: the 10-day + PIN gate and the two options
// (delete data / delete account) live inside ConfiguracionBorradoCard, which
// reuses the existing DeleteAccountCard for the account option.
const DATA_DELETION_ENTRY: SettingsMenuItem = {
  id: 'data_deletion',
  titleKey: 'settings_entry_data_deletion',
  target: 'component:ConfiguracionBorradoCard',
}

const REGION_FORMAT_ENTRY: SettingsMenuItem = {
  id: 'region_format',
  titleKey: 'settings_entry_region_format',
  descKey: 'config_region_desc',
  target: 'target:/configuracion/region',
  // S18 (T7): the reserved Monedas block lives inside Región y formato.
}

const APPEARANCE_ENTRY: SettingsMenuItem = {
  id: 'appearance',
  titleKey: 'settings_entry_appearance',
  target: 'component:AparienciaCard',
}

// ── S2 — Simple tree ───────────────────────────────────────────────────────
const SIMPLE_TREE: SettingsMenuTree = {
  modo: 'simple',
  groups: [
    {
      id: 'account_security',
      titleKey: 'settings_group_account_security',
      items: [
        PROFILE_ENTRY,
        DATA_DELETION_ENTRY,
      ],
    },
    {
      id: 'preferences',
      titleKey: 'settings_group_preferences',
      items: [REGION_FORMAT_ENTRY, APPEARANCE_ENTRY],
    },
    HELP_SUPPORT_GROUP,
    APPLICATION_GROUP,
  ],
  // S9 — "Pasar a Avanzado" is a root entry here and nowhere else.
  rootEntries: [
    {
      id: 'go_advanced',
      titleKey: 'settings_action_go_advanced',
      descKey: 'settings_action_go_advanced_desc',
      target: 'mode:to_advanced',
      featured: true,
    },
    INVITE_FRIEND_ENTRY,
    RATE_APP_ENTRY,
  ],
}

// ── S3 — Advanced tree ─────────────────────────────────────────────────────
const ADVANCED_TREE: SettingsMenuTree = {
  modo: 'avanzado',
  groups: [
    {
      id: 'account_security',
      titleKey: 'settings_group_account_security',
      items: [
        PROFILE_ENTRY,
        {
          // S6 — placeholder only: the feature itself is out of this phase.
          id: 'pin_protection',
          titleKey: 'settings_entry_pin_protection',
          descKey: 'settings_entry_pin_protection_desc',
          target: null,
          soon: true,
        },
        // T3 (S15): the deletion entry shares the rule with the simple tree.
        DATA_DELETION_ENTRY,
      ],
    },
    {
      id: 'preferences',
      titleKey: 'settings_group_preferences',
      items: [
        REGION_FORMAT_ENTRY,
        APPEARANCE_ENTRY,
        {
          id: 'notifications',
          titleKey: 'settings_entry_notifications',
          target: 'component:NotificacionesCard',
        },
      ],
      groups: [
        {
          id: 'load_registry',
          titleKey: 'settings_entry_load_registry',
          descKey: 'settings_entry_load_registry_desc',
          // T1 renders the subgroup as one row into the current page; T2/T4
          // decompose it into the five leaves declared below.
          target: 'target:/configuracion/operativas',
          items: [
            { id: 'default_wallets', titleKey: 'settings_entry_default_wallets', target: 'target:/configuracion/operativas' },
            { id: 'default_movement', titleKey: 'settings_entry_default_movement', target: 'target:/configuracion/operativas' },
            { id: 'wallet_order', titleKey: 'settings_entry_wallet_order', target: 'target:/configuracion/operativas' },
            { id: 'ocr', titleKey: 'settings_entry_ocr', target: 'target:/configuracion/operativas' },
            { id: 'voice', titleKey: 'settings_entry_voice', target: 'target:/configuracion/operativas' },
            // S5: OCR auto-approval is gone on purpose. Do not re-add it.
          ],
        },
      ],
    },
    {
      id: 'data_operations',
      titleKey: 'settings_group_data_operations',
      items: [
        {
          id: 'home_config',
          titleKey: 'settings_entry_home_config',
          descKey: 'config_hogar_desc',
          target: 'target:/configuracion/hogar',
        },
        {
          id: 'budget_cycle',
          titleKey: 'settings_entry_budget_cycle',
          descKey: 'config_budget_desc',
          target: 'component:PresupuestoCicloCard',
        },
        {
          id: 'import_export',
          titleKey: 'settings_entry_import_export',
          descKey: 'config_ie_desc',
          target: 'target:/configuracion/importar-exportar',
        },
        {
          // S9 — the advanced tree goes back to Simple from here.
          id: 'back_to_simple',
          titleKey: 'settings_action_back_to_simple',
          descKey: 'settings_action_back_to_simple_desc',
          target: 'mode:to_simple',
        },
      ],
    },
    HELP_SUPPORT_GROUP,
    APPLICATION_GROUP,
  ],
  rootEntries: [INVITE_FRIEND_ENTRY, RATE_APP_ENTRY],
}

export const settingsMenu = {
  simple: deepFreeze(SIMPLE_TREE),
  full: deepFreeze(ADVANCED_TREE),
} as const

/** Returns the frozen tree for the given app mode. Pure: no I/O, no React. */
export function resolveSettingsMenu(modo: SettingsMenuModo): SettingsMenuTree {
  return modo === 'avanzado' ? settingsMenu.full : settingsMenu.simple
}
