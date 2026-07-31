// ==== Reemplazos aplicados (lucide-react@1.28.0) ====
// - HouseKey -> KeyRound (el icono "HouseKey" no existe; KeyRound es el alias semánticamente más cercano a "llave de casa")
// - Bottle   -> Milk     (el icono "Bottle" no existe; Milk es su alias oficial en lucide-react)
// - Broom    -> Brush    (el icono "Broom" no existe; Brush es el más cercano a escoba/limpieza)

// ==== Iconos para el picker de RUBROS/EGRESOS (20 iconos) ====
export const RUBRO_ICONS = [
  'Users',
  'HandHeart',
  'Dog',
  'BriefcaseBusiness',
  'Store',
  'ShieldCheck',
  'Scale',
  'FileText',
  'Church',
  'HeartHandshake',
  'Balloon',
  'Gift',
  'BrushCleaning',
  'LockKeyhole',
  'Truck',
  'UsersRound',
  'Palette',
  'Lightbulb',
  'Sprout',
  'HandCoins',
] as const

// ==== Iconos para el picker de FUENTES DE INGRESO (20 iconos) ====
export const INGRESO_ICONS = [
  'Briefcase',
  'Laptop',
  'FilePenLine',
  'Rocket',
  'ShoppingCart',
  'Percent',
  'Wrench',
  'HousePlus',
  'GraduationCap',
  'MessageCircle',
  'KeyRound',
  'Car',
  'ChartNoAxesCombined',
  'PiggyBank',
  'SquarePlay',
  'Copyright',
  'Bike',
  'CarTaxiFront',
  'Tag',
  'Armchair',
] as const

// ==== Iconos para el picker de BILLETERAS (20 iconos) ====
export const WALLET_ICONS = [
  'Wallet',
  'WalletCards',
  'Smartphone',
  'QrCode',
  'Nfc',
  'CreditCard',
  'Landmark',
  'Building2',
  'Vault',
  'PiggyBank',
  'Banknote',
  'Coins',
  'HandCoins',
  'DollarSign',
  'Euro',
  'PoundSterling',
  'JapaneseYen',
  'SwissFranc',
  'IndianRupee',
  'Bitcoin',
] as const

// ==== Alias para retrocompatibilidad ====
export const LUCIDE_RUBRO_ICONS = RUBRO_ICONS
export const LUCIDE_INGRESO_ICONS = INGRESO_ICONS
export const LUCIDE_WALLET_ICONS = WALLET_ICONS

// ==== Otros arrays existentes (proyectos, etc.) ====
export const PROJECT_ICONS = [
  'Target',
  'Home',
  'Building2',
  'Car',
  'GraduationCap',
  'Briefcase',
  'Gamepad2',
  'ShoppingCart',
  'Plane',
  'Gift',
] as const

// ==== Arrays históricos (mantenidos para compatibilidad con imports existentes) ====
export const LUCIDE_PROJECT_ICONS = PROJECT_ICONS
export const LUCIDE_FINANCIAL_ICONS = [
  'Wallet',
  'CreditCard',
  'Banknote',
  'Coins',
  'Landmark',
  'PiggyBank',
  'Receipt',
  'DollarSign',
  'TrendingUp',
  'HandCoins',
] as const
