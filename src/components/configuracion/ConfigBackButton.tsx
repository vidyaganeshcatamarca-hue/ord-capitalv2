import { t } from '@/locales/i18n'
import { PageBackButton } from '@/components/PageBackButton/PageBackButton'

interface ConfigBackButtonProps {
  /** Explicit destination. Defaults to /configuracion */
  to?: string
}

/**
 * Settings-sections back button. Kept as a named wrapper so the 14 settings
 * pages share the geometry of PageBackButton without touching their call sites.
 */
export function ConfigBackButton({ to = '/configuracion' }: ConfigBackButtonProps) {
  return <PageBackButton to={to} ariaLabel={t('config_back_to_settings')} />
}

export default ConfigBackButton
