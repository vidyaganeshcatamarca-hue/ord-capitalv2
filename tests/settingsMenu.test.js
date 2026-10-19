// tests/settingsMenu.test.js
// Contract checks for the Ajustes menu tree per app mode (feature: menu-ajustes, T1).
// Pure data + pure resolver: no React, no supabase, no network, no DOM.
// Node 24 native TypeScript type stripping lets us import the .ts module
// directly, same pattern as tests/import_parser.test.js.
//
//   node --test tests/settingsMenu.test.js
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { settingsMenu, resolveSettingsMenu } from '../src/config/settingsMenu.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODULE_PATH = path.join(__dirname, '..', 'src', 'config', 'settingsMenu.ts')
const ES_PATH = path.join(__dirname, '..', 'src', 'locales', 'es.ts')
const HUB_PATH = path.join(__dirname, '..', 'src', 'components', 'configuracion', 'ConfiguracionHub.tsx')
const REGION_PAGE_PATH = path.join(__dirname, '..', 'src', 'pages', 'Configuracion', 'RegionFormatoPage.tsx')
const ABOUT_PAGE_PATH = path.join(__dirname, '..', 'src', 'pages', 'Configuracion', 'AcercaPage.tsx')
const APP_PATH = path.join(__dirname, '..', 'src', 'App.tsx')

// S2 — Simple tree group order.
const SIMPLE_GROUP_IDS = ['account_security', 'preferences', 'help_support', 'application']
// S3 — Advanced tree group order (adds Datos y operaciones).
const ADVANCED_GROUP_IDS = [
  'account_security',
  'preferences',
  'data_operations',
  'help_support',
  'application',
]
// S3 — Carga y registro leaves. OCR auto-approval (S5) must NOT be here.
const LOAD_REGISTRY_IDS = ['default_wallets', 'default_movement', 'wallet_order', 'ocr', 'voice']
// S11/S12 — Ayuda y soporte entries, present in both modes.
const HELP_SUPPORT_IDS = ['report_issue', 'my_reports', 'guided_tour']
// S9 — asymmetric mode switch entries.
const MODE_SWITCH_TO_ADVANCED = 'mode:to_advanced'
const MODE_SWITCH_TO_SIMPLE = 'mode:to_simple'

function groupById(tree, id) {
  const group = tree.groups.find((candidate) => candidate.id === id)
  assert.ok(group, `group ${id} is missing from the ${tree.modo} tree`)
  return group
}

function groupItemIds(group) {
  return group.items.map((item) => item.id)
}

/** Flattens every group (including nested subgroups) and every entry. */
function collectTree(tree) {
  const groups = []
  const items = []
  const visit = (group) => {
    groups.push(group)
    items.push(...group.items)
    for (const sub of group.groups ?? []) visit(sub)
  }
  for (const group of tree.groups) visit(group)
  items.push(...tree.rootEntries)
  return { groups, items }
}

/** Mirrors the parsing used by tests/i18n/settings-keys.test.js. */
function readEsDictionary() {
  const dict = {}
  const source = fs.readFileSync(ES_PATH, 'utf-8')
  const pattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"((?:[^"\\]|\\.)*)"/gm
  for (const match of source.matchAll(pattern)) dict[match[1]] = match[2]
  return dict
}

/**
 * Naming contract: groups are `settings_group_*`, plain entries are
 * `settings_entry_*`, and rows that switch mode or are disabled placeholders
 * are `settings_action_*`.
 */
function expectedTitlePrefix(entry) {
  const isModeSwitch = typeof entry.target === 'string' && entry.target.startsWith('mode:')
  return isModeSwitch || entry.disabled === true ? 'settings_action_' : 'settings_entry_'
}

test('resolveSettingsMenu returns the pure tree for each mode', () => {
  assert.equal(resolveSettingsMenu('simple'), settingsMenu.simple)
  assert.equal(resolveSettingsMenu('avanzado'), settingsMenu.full)
  // Same reference on every call: consumers may rely on it (no fresh objects).
  assert.equal(resolveSettingsMenu('simple'), resolveSettingsMenu('simple'))
  assert.equal(settingsMenu.simple.modo, 'simple')
  assert.equal(settingsMenu.full.modo, 'avanzado')
})

test('the menu module stays pure: no React, no supabase', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf-8')
  assert.ok(!/from\s+['"]react['"]/.test(source), 'settingsMenu.ts must not import react')
  assert.ok(!/supabase/i.test(source), 'settingsMenu.ts must not touch supabase')
  assert.ok(!/from\s+['"]@\//.test(source), 'settingsMenu.ts must not import app aliases')
})

test('simple tree has exactly the four spec groups, in order (S2)', () => {
  assert.deepEqual(
    settingsMenu.simple.groups.map((group) => group.id),
    SIMPLE_GROUP_IDS,
  )
})

test('simple Preferencias includes Carga y registro but not notifications (S2 + L15)', () => {
  const preferences = groupById(settingsMenu.simple, 'preferences')
  assert.ok(groupItemIds(preferences).includes('region_format'))
  assert.ok(groupItemIds(preferences).includes('appearance'))
  // L15 (owner, 2026-10-19): Carga y registro is visible in Simple too.
  const simpleSubgroupIds = (preferences.groups ?? []).map((sub) => sub.id)
  assert.ok(simpleSubgroupIds.includes('load_registry'), 'load_registry must be exposed in Simple (L15)')
  const { items } = collectTree(settingsMenu.simple)
  const ids = items.map((item) => item.id)
  assert.ok(!ids.includes('notifications'), 'simple must not expose Notificaciones')
  // The Simple load_registry keeps the same five leaves / target as advanced (S3/L15).
  const loadRegistry = (preferences.groups ?? []).find((sub) => sub.id === 'load_registry')
  assert.equal(
    loadRegistry.target,
    groupById(settingsMenu.full, 'preferences').groups.find((sub) => sub.id === 'load_registry').target,
    'simple load_registry must point to the same operativas target',
  )
})

test('simple Cuenta y seguridad holds Perfil + the deletion entry (S2/S15)', () => {
  const account = groupById(settingsMenu.simple, 'account_security')
  assert.deepEqual(groupItemIds(account), ['profile', 'data_deletion'])
  assert.ok(!groupItemIds(account).includes('pin_protection'), 'PIN is advanced-only (S6)')
})

test('simple root entries: featured Pasar a Avanzado + soon invite/rate (S2/S8/S9)', () => {
  const rootIds = settingsMenu.simple.rootEntries.map((entry) => entry.id)
  assert.deepEqual(rootIds, ['go_advanced', 'invite_friend', 'rate_app'])

  const goAdvanced = settingsMenu.simple.rootEntries.find((entry) => entry.id === 'go_advanced')
  assert.equal(goAdvanced.featured, true)
  assert.equal(goAdvanced.target, MODE_SWITCH_TO_ADVANCED)
  assert.notEqual(goAdvanced.disabled, true)

  for (const id of ['invite_friend', 'rate_app']) {
    const entry = settingsMenu.simple.rootEntries.find((candidate) => candidate.id === id)
    assert.equal(entry.disabled, true, `${id} must stay disabled while it is not implemented`)
    assert.equal(entry.soon, true, `${id} must be flagged Próximamente`)
    assert.equal(entry.target, null, `${id} has no destination yet`)
  }
})

test('advanced tree has the five spec groups, in order (S3)', () => {
  assert.deepEqual(
    settingsMenu.full.groups.map((group) => group.id),
    ADVANCED_GROUP_IDS,
  )
})

test('advanced Preferencias adds notifications and the carga-y-registro subgroup (S3)', () => {
  const preferences = groupById(settingsMenu.full, 'preferences')
  assert.deepEqual(groupItemIds(preferences), ['region_format', 'appearance', 'notifications'])
  assert.deepEqual((preferences.groups ?? []).map((sub) => sub.id), ['load_registry'])
})

test('carga y registro leaves match the spec and drop OCR auto-approval (S3/S5)', () => {
  const preferences = groupById(settingsMenu.full, 'preferences')
  const loadRegistry = preferences.groups.find((sub) => sub.id === 'load_registry')
  assert.ok(loadRegistry, 'Carga y registro subgroup is missing')
  assert.deepEqual(groupItemIds(loadRegistry), LOAD_REGISTRY_IDS)

  const { items } = collectTree(settingsMenu.full)
  for (const entry of items) {
    assert.ok(!/auto/i.test(entry.id), `unexpected auto-approval entry: ${entry.id}`)
    assert.ok(!/auto/i.test(entry.titleKey), `unexpected auto-approval key: ${entry.titleKey}`)
  }
})

test('advanced Cuenta y seguridad turns the PIN entry live after the pi2 merge (S6 + peer integration)', () => {
  const account = groupById(settingsMenu.full, 'account_security')
  assert.deepEqual(groupItemIds(account), ['profile', 'pin_protection', 'data_deletion'])
  const pin = account.items.find((item) => item.id === 'pin_protection')
  // PI2 flip (integration contract): page entry at the flat convention route.
  assert.equal(pin.soon, false)
  assert.equal(pin.target, 'target:/configuracion/proteccion')
})

test('advanced Datos y operaciones holds hogar, presupuesto, import/export, volver a simple (S3/S9/S14)', () => {
  const data = groupById(settingsMenu.full, 'data_operations')
  assert.deepEqual(groupItemIds(data), ['home_config', 'budget_cycle', 'import_export', 'back_to_simple'])
  const backToSimple = data.items.find((item) => item.id === 'back_to_simple')
  assert.equal(backToSimple.target, MODE_SWITCH_TO_SIMPLE)
})

test('advanced tree never exposes Pasar a Avanzado (S9 asymmetry)', () => {
  const { items } = collectTree(settingsMenu.full)
  const ids = items.map((item) => item.id)
  assert.ok(!ids.includes('go_advanced'))
  assert.ok(!items.some((item) => item.target === MODE_SWITCH_TO_ADVANCED))
})

test('both trees keep the Ayuda y soporte entries (S11/S12)', () => {
  for (const tree of [settingsMenu.simple, settingsMenu.full]) {
    const help = groupById(tree, 'help_support')
    assert.deepEqual(groupItemIds(help), HELP_SUPPORT_IDS)
  }
})

test('every entry is well formed and every title key is prefixed by its kind', () => {
  for (const tree of [settingsMenu.simple, settingsMenu.full]) {
    const { groups, items } = collectTree(tree)
    const seen = new Set()

    const topLevel = new Set(tree.groups.map((group) => group.id))
    for (const group of groups) {
      assert.match(group.id, /^[a-z][a-z0-9_]*$/)
      if (topLevel.has(group.id)) {
        assert.ok(
          group.titleKey.startsWith('settings_group_'),
          `group ${group.id} must use a settings_group_ key`,
        )
      } else {
        // A nested subgroup renders as an entry row until its leaves are wired.
        assert.ok(
          /^settings_(group|entry)_/.test(group.titleKey),
          `subgroup ${group.id} must use a settings_group_ or settings_entry_ key`,
        )
      }
      assert.ok(!seen.has(group.id), `duplicate id ${group.id}`)
      seen.add(group.id)
    }

    for (const entry of items) {
      assert.match(entry.id, /^[a-z][a-z0-9_]*$/, `bad id: ${entry.id}`)
      assert.ok(!seen.has(entry.id), `duplicate id ${entry.id}`)
      seen.add(entry.id)
      assert.ok(
        entry.titleKey.startsWith(expectedTitlePrefix(entry)),
        `${entry.id} must start with ${expectedTitlePrefix(entry)}`,
      )
      if (entry.target !== null) {
        assert.match(entry.target, /^(target:\/|component:|mode:)/, `bad target: ${entry.target}`)
      }
      if (entry.disabled === true) {
        assert.equal(entry.soon, true, `${entry.id} is disabled, so it must be flagged Próximamente`)
      }
    }
  }
})

test('every i18n key referenced by the tree exists in src/locales/es.ts (S10)', () => {
  const dict = readEsDictionary()
  const missing = []
  for (const tree of [settingsMenu.simple, settingsMenu.full]) {
    const { groups, items } = collectTree(tree)
    for (const group of [...groups, ...items]) {
      for (const key of [group.titleKey, group.descKey]) {
        if (typeof key === 'string' && !dict[key]) missing.push(key)
      }
    }
  }
  assert.deepEqual(missing, [])
})

// ── T2 contract ─────────────────────────────────────────────────────────────
// S11/S12 wiring, no deferred entries, S5 OCR auto-approval gone from both
// trees, and the S6/S7 placeholders in their spec'd places.

test('help_support routes report_issue, my_reports and guided_tour in both modes (S11/S12)', () => {
  for (const tree of [settingsMenu.simple, settingsMenu.full]) {
    const help = groupById(tree, 'help_support')
    assert.deepEqual(groupItemIds(help), HELP_SUPPORT_IDS)
    const byId = Object.fromEntries(help.items.map((item) => [item.id, item]))
    assert.equal(byId.report_issue.target, 'target:/reportar-problema')
    assert.equal(byId.my_reports.target, 'target:/mis-reportes')
    // S11 — Tour Guiado reuses the existing /ayuda -> HelpIndexPage route.
    assert.equal(byId.guided_tour.target, 'target:/ayuda')
  }
})

test('S12 rename is data-driven: the report_issue title key carries the new wording', () => {
  const dict = readEsDictionary()
  for (const tree of [settingsMenu.simple, settingsMenu.full]) {
    const report = groupById(tree, 'help_support').items.find((item) => item.id === 'report_issue')
    assert.equal(report.titleKey, 'settings_entry_report_issue')
    assert.equal(dict[report.titleKey], 'Reportar un problema o sugerencia')
  }
})

test('every declared group renders at least one row and the hub defers nothing (T2)', () => {
  const isRenderable = (item) =>
    item.soon === true || item.disabled === true || item.target !== null
  for (const tree of [settingsMenu.simple, settingsMenu.full]) {
    const { groups } = collectTree(tree)
    for (const group of groups) {
      const renderableItems = group.items.filter(isRenderable)
      const renderableSubgroups = (group.groups ?? []).filter(
        (sub) => typeof sub.target === 'string' && sub.target.startsWith('target:'),
      )
      assert.ok(
        renderableItems.length + renderableSubgroups.length > 0,
        `group ${group.id} would render zero rows in the ${tree.modo} tree`,
      )
      for (const item of group.items) {
        assert.ok(isRenderable(item), `entry ${item.id} is neither renderable nor a placeholder`)
      }
    }
  }
  const hubSource = fs.readFileSync(HUB_PATH, 'utf-8')
  assert.ok(
    !hubSource.includes('DEFERRED_ENTRY_IDS'),
    'the hub must not defer settings entries anymore (T2 wires them all)',
  )
})

test('OCR auto-approval is absent from both trees (S5)', () => {
  for (const tree of [settingsMenu.simple, settingsMenu.full]) {
    const { items } = collectTree(tree)
    for (const entry of items) {
      assert.ok(!/auto/i.test(entry.id), `unexpected auto-approval entry ${entry.id} (${tree.modo})`)
      assert.ok(!/auto/i.test(entry.titleKey), `unexpected auto-approval key ${entry.titleKey} (${tree.modo})`)
    }
  }
})

test('S6/S7: PIN is advanced-only and Plan/Suscripcion is a soon entry inside Acerca de', () => {
  // S6 — the PIN placeholder never reaches the simple tree.
  const simpleAccount = groupById(settingsMenu.simple, 'account_security')
  assert.ok(!groupItemIds(simpleAccount).includes('pin_protection'))
  // PI2 flip: the entry is advanced-only but LIVE (page route), not a placeholder.
  const advancedPin = groupById(settingsMenu.full, 'account_security').items.find(
    (item) => item.id === 'pin_protection',
  )
  assert.equal(advancedPin.soon, false)
  assert.equal(advancedPin.target, 'target:/configuracion/proteccion')

  // S7 — Plan/Suscripcion lives under Acerca de, in both modes, as a placeholder.
  for (const tree of [settingsMenu.simple, settingsMenu.full]) {
    const application = groupById(tree, 'application')
    const about = (application.groups ?? []).find((group) => group.id === 'about')
    assert.ok(about, `Acerca de group is missing in the ${tree.modo} tree`)
    assert.equal(about.target, 'target:/configuracion/acerca')
    const plan = about.items.find((item) => item.id === 'plan_subscription')
    assert.ok(plan, `plan_subscription is missing in the ${tree.modo} tree`)
    assert.equal(plan.soon, true)
    assert.equal(plan.target, null)
  }
})

// ── T3 contract ─────────────────────────────────────────────────────────────
// S15 — one deletion entry in Cuenta y seguridad, in BOTH modes, sharing the
// 10-day + PIN rule. It is a live entry (not a Próximamente placeholder) and
// reuses the existing DeleteAccountCard through the hub's component slot.

const DELETION_SLOT = 'component:ConfiguracionBorradoCard'

test('both modes expose the same live deletion entry in Cuenta y seguridad (S15)', () => {
  for (const tree of [settingsMenu.simple, settingsMenu.full]) {
    const entry = groupById(tree, 'account_security').items.find((item) => item.id === 'data_deletion')
    assert.ok(entry, `data_deletion is missing from the ${tree.modo} tree`)
    assert.equal(entry.target, DELETION_SLOT)
    assert.notEqual(entry.soon, true, 'the deletion entry is live, not a Próximamente placeholder')
    assert.notEqual(entry.disabled, true, 'the entry is enabled; the gate lives inside the card')
    assert.equal(entry.titleKey, 'settings_entry_data_deletion')
  }
})

test('the hub routes the deletion slot to ConfiguracionBorradoCard (T3)', () => {
  const hubSource = fs.readFileSync(HUB_PATH, 'utf-8')
  assert.ok(
    hubSource.includes("case 'ConfiguracionBorradoCard'"),
    'the hub must resolve the ConfiguracionBorradoCard component slot',
  )
})

// ── U1 contract (menu-ajustes-ui-refinements, S1) ───────────────────────────
// Each top-level tree group becomes a tap-to-expand accordion section that
// starts collapsed. ONE reusable SettingsCollapsible primitive keeps the pattern
// (header button + aria-expanded/aria-controls + rotating chevron) in a single
// place. Leaf rows stay as they are and the cards that already own their internal
// state (MiCuentaCard / AparienciaCard / ConfiguracionBorradoCard) are not wrapped
// in a second accordion. U2 adds the two inline cards (region / about) through
// dedicated components: the leaf slices below still never contain the primitive.

const HUB_CSS_PATH = path.join(
  __dirname,
  '..',
  'src',
  'components',
  'configuracion',
  'ConfiguracionHub.css',
)
// Every group id that must appear in the per-group icon map (S1).
const GROUP_IDS = [...SIMPLE_GROUP_IDS, 'data_operations']

/** Source of the SettingsCollapsible component only (definition to next function). */
function collapsibleSource(source) {
  const start = source.indexOf('function SettingsCollapsible')
  assert.ok(start !== -1, 'the hub must define a SettingsCollapsible component')
  const end = source.indexOf('function SettingsGroupSection', start)
  assert.ok(end > start, 'SettingsGroupSection must follow SettingsCollapsible')
  return source.slice(start, end)
}

test('the hub defines one reusable SettingsCollapsible and all groups render through it (U1/S1)', () => {
  const source = fs.readFileSync(HUB_PATH, 'utf-8')
  assert.match(source, /function\s+SettingsCollapsible\s*\(/, 'the hub must define SettingsCollapsible')
  const groupSection = source.slice(source.indexOf('function SettingsGroupSection'))
  assert.match(
    groupSection,
    /<SettingsCollapsible[\s>]/,
    'every top-level group must render through SettingsCollapsible',
  )
  assert.match(
    source,
    /tree\.groups\.map\([\s\S]*?SettingsGroupSection/,
    'the hub must map every tree group to SettingsGroupSection',
  )
})

test('SettingsCollapsible is a button header with aria-expanded and aria-controls (U1/S1)', () => {
  const body = collapsibleSource(fs.readFileSync(HUB_PATH, 'utf-8'))
  assert.match(
    body,
    /<button[\s\S]*?className="config-hub-collapsible-header"/,
    'the header must be a <button> with the collapsible header class',
  )
  assert.ok(body.includes('aria-expanded={open}'), 'the header must expose aria-expanded')
  assert.match(body, /aria-controls=\{/, 'the header must expose aria-controls')
})

test('the group chevron reuses the hub base class and an --open rotation modifier (U1/S1)', () => {
  const body = collapsibleSource(fs.readFileSync(HUB_PATH, 'utf-8'))
  assert.ok(
    body.includes('config-hub-card-chevron'),
    'the header chevron must reuse the existing config-hub-card-chevron base',
  )
  assert.ok(
    body.includes('config-hub-collapsible-chevron--open'),
    'the open state must toggle a chevron rotation modifier',
  )
  const css = fs.readFileSync(HUB_CSS_PATH, 'utf-8')
  assert.match(
    css,
    /\.config-hub-collapsible-chevron--open\s*\{[^}]*transform:\s*rotate\(90deg\)/,
    'the rotation modifier must rotate the chevron in ConfiguracionHub.css',
  )
})

test('every group section starts collapsed and renders no body while closed (U1/S1)', () => {
  const body = collapsibleSource(fs.readFileSync(HUB_PATH, 'utf-8'))
  assert.match(body, /useState\(false\)/, 'the open state must default to false')
  assert.ok(!/useState\(true\)/.test(body), 'no collapsible section may default to open')
  assert.match(body, /\{open\s*&&\s*\(/, 'the body must render only when open')
})

test('GROUP_ICONS covers every top-level group id (U1/S1)', () => {
  const source = fs.readFileSync(HUB_PATH, 'utf-8')
  const match = source.match(/const GROUP_ICONS[^=]*=\s*\{([\s\S]*?)\n\}/)
  assert.ok(match, 'the hub must define a GROUP_ICONS map')
  for (const id of GROUP_IDS) {
    assert.ok(
      new RegExp(`\\b${id}\\b`).test(match[1]),
      `GROUP_ICONS is missing the ${id} group icon`,
    )
  }
})

test('U1 scope guard: leaf rows are never wrapped in a second accordion (U1/S1)', () => {
  const source = fs.readFileSync(HUB_PATH, 'utf-8')
  const entryStart = source.indexOf('function SettingsEntry')
  const entryEnd = source.indexOf('function SettingsSubgroup', entryStart)
  assert.ok(entryStart !== -1 && entryEnd > entryStart, 'SettingsEntry must stay a named component')
  const entrySource = source.slice(entryStart, entryEnd)
  assert.ok(
    !entrySource.includes('SettingsCollapsible'),
    'leaf entries (cards/links/soon/mode rows) must not be wrapped in SettingsCollapsible',
  )
  // U1 collapses the 5 top-level groups only (task: "the collapsible rule U1
  // applies ONLY to: top-level GROUPS (5) and their SECTION bodies"). The nested
  // subgroup rows (Aplicación > Acerca de, Preferencias > Carga y registro) keep
  // their existing link rendering; turning them inline belongs to U2.
  const subgroupStart = entryEnd
  const subgroupEnd = source.indexOf('function isRenderable', subgroupStart)
  const subgroupSource = source.slice(subgroupStart, subgroupEnd)
  assert.ok(
    !subgroupSource.includes('SettingsCollapsible'),
    'subgroup rows stay plain in the SettingsSubgroup body; U2 wires them through dedicated inline-card components this slice does not contain',
  )
})

// ── U2 contract (menu-ajustes-ui-refinements, S3 + S4) ──────────────────────
// Región y formato and Acerca de stop being standalone pages: each one becomes
// an inline accordion card in the hub. The two retired routes are gone from
// App.tsx, the page bodies survive as exported components (ConfigRegionBody /
// ConfigAboutBody) and the Legal rows open the shared LegalDocModal.

test('the hub renders Región y formato as an inline card backed by ConfigRegionBody (U2/S3)', () => {
  const hub = fs.readFileSync(HUB_PATH, 'utf-8')
  assert.match(hub, /function\s+RegionInlineCard\s*\(/, 'the hub must define the region inline card')
  assert.ok(
    hub.includes("from '@/pages/Configuracion/RegionFormatoPage'"),
    'the hub must import ConfigRegionBody from RegionFormatoPage',
  )
  assert.ok(hub.includes('<ConfigRegionBody />'), 'the region card must mount ConfigRegionBody')
  assert.match(
    hub,
    /item\.id === 'region_format'[\s\S]*?<RegionInlineCard/,
    'the region_format entry must dispatch to the inline card before the generic target branch',
  )
})

test('RegionFormatoPage exports the inline body (no CurrenciesBlock placeholder) (U2/S3)', () => {
  const page = fs.readFileSync(REGION_PAGE_PATH, 'utf-8')
  assert.match(page, /export\s+function\s+ConfigRegionBody\s*\(/, 'ConfigRegionBody must be exported')
  assert.ok(
    !/(function\s+CurrenciesBlock\s*\(|<CurrenciesBlock|coordination\/p3-tercera-moneda|t\('settings_entry_currencies_block'\))/.test(page),
    'the retired placeholder, its coordination pointer and its title key must NOT survive the extraction (bug-1)',
  )
  assert.match(page, /<BloqueMonedas/, 'the live editable BloqueMonedas (P3) must stay mounted')
  assert.ok(
    !page.includes('ConfigBackButton'),
    'the inline body must not keep the page-level back button',
  )
})
/** S9 + L15 — the switch to advanced requires a confirmation modal before the
 *  mode change: the hub must open it on click (goAdvanced), the confirm action
 *  must call activarModoAvanzado exactly once, and back-to-simple stays one-tap. */
test('Pasar a Avanzado opens a confirmation modal before activating (S9/L15)', () => {
  const hub = fs.readFileSync(HUB_PATH, 'utf-8')
  const row = hub.slice(hub.indexOf('function ModeSwitchRow'), hub.indexOf('function PresupuestoCicloCard'))
  assert.ok(
    row.includes("item.target === 'mode:to_advanced'") && row.includes('setConfirming(true)'),
    'goAdvanced must open the confirmation modal instead of activating directly',
  )
  const confirmBody = row.includes('onConfirm') ? row.slice(row.indexOf('onConfirm')) : ''
  assert.ok(
    confirmBody.replace(/\s/g, ' ').includes('void activarModoAvanzado()'),
    'the modal confirm action must call activarModoAvanzado',
  )
  assert.ok(
    row.includes('settings_confirm_go_advanced_title'),
    'the modal must use the i18n title key',
  )
  assert.ok(
    row.includes('void desactivarModoAvanzado()'),
    'back to simple stays one-tap (no confirmation)',
  )
})
test('the hub renders Acerca de inline and the legal rows open LegalDocModal (U2/S4)', () => {
  const hub = fs.readFileSync(HUB_PATH, 'utf-8')
  assert.match(hub, /function\s+AboutInlineCard\s*\(/, 'the hub must define the about inline card')
  assert.ok(
    hub.includes("from '@/pages/Configuracion/AcercaPage'"),
    'the hub must import ConfigAboutBody from AcercaPage',
  )
  assert.ok(hub.includes('<ConfigAboutBody />'), 'the about card must mount ConfigAboutBody')
  assert.match(
    hub,
    /group\.id === 'about'[\s\S]*?<AboutInlineCard/,
    'the about subgroup must dispatch to the inline card',
  )
})

test('AcercaPage exports ConfigAboutBody and wires LegalDocModal on both legal rows (U2/S4)', () => {
  const about = fs.readFileSync(ABOUT_PAGE_PATH, 'utf-8')
  assert.match(about, /export\s+function\s+ConfigAboutBody\s*\(/, 'ConfigAboutBody must be exported')
  assert.ok(
    about.includes("from '@/components/LegalDocModal/LegalDocModal'"),
    'the inline body must import the shared LegalDocModal',
  )
  assert.ok(about.includes("setLegalDoc('tyc')"), 'Términos must open the tyc document')
  assert.ok(about.includes("setLegalDoc('privacidad')"), 'Política must open the privacidad document')
  assert.ok(about.includes("t('config_terms')"), 'the Términos label key stays')
  assert.ok(about.includes("t('config_privacy_policy')"), 'the Política label key stays')
  assert.ok(!about.includes('ConfigBackButton'), 'the inline body must not keep the back button')
})

test('the legal rows no longer render the Próximamente pill (U2/S4)', () => {
  const about = fs.readFileSync(ABOUT_PAGE_PATH, 'utf-8')
  // Only the Plan/Suscripción placeholder keeps the pill.
  const pills = about.match(/config_coming_soon/g) ?? []
  assert.equal(pills.length, 1, 'the Legal rows must not keep a Próximamente pill')
})

test('App.tsx drops the retired region and about routes (U2/S3/S4)', () => {
  const app = fs.readFileSync(APP_PATH, 'utf-8')
  assert.ok(!app.includes('/configuracion/region'), 'the /configuracion/region route must be gone')
  assert.ok(!app.includes('/configuracion/acerca'), 'the /configuracion/acerca route must be gone')
  assert.ok(!app.includes('RegionFormatoPage'), 'the region lazy import must be gone')
  assert.ok(!app.includes('AcercaPage'), 'the about lazy import must be gone')
})
