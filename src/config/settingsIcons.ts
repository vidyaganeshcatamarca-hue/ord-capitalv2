// src/config/settingsIcons.ts
// El icono de cada entrada del menú de Ajustes (feature: ronda 7, S7).
//
// Dueño: "que sea en el menú de ajustes, todos los submenúes donde no tenemos
// iconos. Algunas opciones tienen iconos bien elegidos y otras no tienen ningún
// icono. Veamos de ponerle icono a casi todo lo que se pueda".
//
// Antes los iconos vivían dentro de ConfiguracionHub.tsx, en dos mapas que
// cubrían solo algunas entradas: las demás caían en un '•' genérico (así se
// veían "Protección con PIN" y "Eliminar datos y cuenta" en la captura). Un
// mapa en un .tsx no se puede recorrer desde un test, así que la cobertura no
// tenía red y la próxima entrada nueva iba a volver a salir con un punto.
//
// Vive acá, como dato puro y sin JSX, para que un test pueda recorrer el árbol
// completo de settingsMenu y exigir que toda entrada tenga icono. El hub sigue
// teniendo la última palabra visual: puede sobrescribir un id con un icono de
// lucide (ver ROW_ICON_OVERRIDES en ConfiguracionHub.tsx).

/**
 * Icono por id de entrada del árbol de Ajustes. Cubre los cinco grupos, los
 * subgrupos, las filas con destino, las filas "próximamente", el interruptor de
 * modo y las hojas declaradas de Carga y registro.
 */
export const SETTING_ICONS: Record<string, string> = {
  // ── Grupos de primer nivel ──
  account_security: '🛡️',
  preferences: '⚙️',
  data_operations: '📊',
  help_support: '🆘',
  application: '📱',

  // ── Cuenta y seguridad ──
  profile: '👤',
  pin_protection: '🔐',
  data_deletion: '🗑️',

  // ── Preferencias ──
  region_format: '🌍',
  appearance: '🎨',
  notifications: '🔔',

  // ── Carga y registro (subgrupo y sus hojas) ──
  // Teclado: es el tema del subgrupo, cómo se cargan los movimientos.
  load_registry: '⌨️',
  default_wallets: '👛',
  default_movement: '📝',
  wallet_order: '🔢',
  ocr: '📷',
  voice: '🎤',

  // ── Datos y operaciones ──
  home_config: '👥',
  budget_cycle: '📅',
  import_export: '📥',

  // ── Ayuda y soporte ──
  report_issue: '🐞',
  my_reports: '📋',
  guided_tour: '🧭',

  // ── Aplicación ──
  install_app: '📲',
  maintenance: '🧰',
  // "Acerca de" ya no comparte el 📱 del grupo Aplicación: se confundían.
  about: 'ℹ️',
  plan_subscription: '💳',

  // ── Entradas de raíz ──
  go_advanced: '🚀',
  back_to_simple: '↩️',
  invite_friend: '🎁',
  rate_app: '⭐',
}

/**
 * Icono de una entrada. El '•' queda solo como último recurso en runtime: un
 * test exige que ninguna entrada declarada caiga acá, así que si aparece en
 * pantalla es porque hay una entrada nueva sin icono.
 */
export function settingIcon(id: string): string {
  return SETTING_ICONS[id] ?? '•'
}

/** Icono de un grupo de primer nivel o de un subgrupo. */
export const settingGroupIcon = settingIcon
