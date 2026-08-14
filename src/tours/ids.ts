export const TOUR_IDS = {
  home: {
    heroCard: 'home-hero-card',
    familyBalance: 'home-family-balance',
    safeToSpend: 'home-safe-to-spend',
    alertsBadge: 'home-alerts-badge',
    recentMovements: 'home-recent-movements',
    fabRegistrar: 'home-fab-registrar',
  },
  cuentas: {
    tabSwitcher: 'cuentas-tab-switcher',
    walletList: 'cuentas-wallet-list',
    healthWidget: 'cuentas-health-widget',
    addCuentaBtn: 'cuentas-add-cuenta-btn',
    conciliarBtn: 'cuentas-conciliar-btn',
  },
  tarjetas: {
    debtWidget: 'tarjetas-debt-widget',
    alertsSection: 'tarjetas-alerts-section',
    cardList: 'tarjetas-card-list',
    newCardBtn: 'tarjetas-new-card-btn',
    pagarBtn: 'tarjetas-pagar-btn',
  },
  presupuestos: {
    termometro: 'presupuestos-termometro',
    saldoAsignar: 'presupuestos-saldo-asignar',
    reglasOro: 'presupuestos-reglas-oro',
    mesSelector: 'presupuestos-mes-selector',
    sobreList: 'presupuestos-sobre-list',
  },
  ajustes: {
    configHub: 'ajustes-config-hub',
    preferencias: 'ajustes-preferencias',
    notificaciones: 'ajustes-notificaciones',
    regionFormato: 'ajustes-region-formato',
    acerca: 'ajustes-acerca',
  },
} as const;

export type TourScreenId = keyof typeof TOUR_IDS;

export type TourId =
  | (typeof TOUR_IDS.home)[keyof typeof TOUR_IDS.home]
  | (typeof TOUR_IDS.cuentas)[keyof typeof TOUR_IDS.cuentas]
  | (typeof TOUR_IDS.tarjetas)[keyof typeof TOUR_IDS.tarjetas]
  | (typeof TOUR_IDS.presupuestos)[keyof typeof TOUR_IDS.presupuestos]
  | (typeof TOUR_IDS.ajustes)[keyof typeof TOUR_IDS.ajustes];
