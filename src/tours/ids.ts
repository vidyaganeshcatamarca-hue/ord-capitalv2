export const TOUR_IDS = {
  home: {
    heroCard: 'home-hero-card',
    expensesDonut: 'home-expenses-donut',
    expensesToggle: 'home-expenses-toggle-rubros',
    expensesVerTodos: 'home-expenses-ver-todos',
    billeteras: 'home-billeteras',
    billeterasFiltro: 'home-billeteras-filtro',
    misterioAlerta: 'home-misterio-alerta',
    actividad: 'home-actividad',
    actividadFiltro: 'home-actividad-filtro',
    headerAux: 'home-header-aux',
    fabRegistrar: 'home-fab-registrar',
  },
  cuentas: {
    _placeholder: 'cuentas-placeholder',
  },
  tarjetas: {
    _placeholder: 'tarjetas-placeholder',
  },
  presupuestos: {
    _placeholder: 'presupuestos-placeholder',
  },
  ajustes: {
    _placeholder: 'ajustes-placeholder',
  },
} as const;

export type TourScreenId = keyof typeof TOUR_IDS;

export type TourId =
  | (typeof TOUR_IDS.home)[keyof typeof TOUR_IDS.home]
  | (typeof TOUR_IDS.cuentas)[keyof typeof TOUR_IDS.cuentas]
  | (typeof TOUR_IDS.tarjetas)[keyof typeof TOUR_IDS.tarjetas]
  | (typeof TOUR_IDS.presupuestos)[keyof typeof TOUR_IDS.presupuestos]
  | (typeof TOUR_IDS.ajustes)[keyof typeof TOUR_IDS.ajustes];
