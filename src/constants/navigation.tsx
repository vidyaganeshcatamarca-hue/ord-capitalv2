import React from 'react'
import {
  House,
  Wallet,
  CreditCard,
  FileChartColumn,
  Inbox,
  Users,
  BrainCircuit,
  ShieldCheck,
  Brush,
  TrendingUp,
  HeartPulse,
  Mail,
  Settings,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  desktopLabel?: string
  icon: (active: boolean) => React.ReactNode
}

const navIconProps = (active: boolean) => ({
  size: 22,
  stroke: 'currentColor',
  fill: active ? 'currentColor' : 'none',
  strokeWidth: active ? 0 : 1.8,
})

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: 'menu_inicio',
    desktopLabel: 'menu_inicio',
    icon: (active: boolean) => <House {...navIconProps(active)} />,
  },
  {
    path: '/billeteras',
    label: 'menu_cuentas',
    desktopLabel: 'menu_cuentas',
    icon: (active: boolean) => <Wallet {...navIconProps(active)} />,
  },
  {
    path: '/tarjetas',
    label: 'menu_tarjetas',
    desktopLabel: 'menu_tarjetas',
    icon: (active: boolean) => <CreditCard {...navIconProps(active)} />,
  },
  {
    path: '/presupuesto',
    label: 'menu_presupuesto',
    desktopLabel: 'menu_presupuesto',
    icon: (active: boolean) => <FileChartColumn {...navIconProps(active)} />,
  },
  {
    path: '/cuarentena',
    label: 'menu_cuarentena',
    desktopLabel: 'menu_cuarentena',
    icon: (active: boolean) => <Inbox {...navIconProps(active)} />,
  },
  {
    path: '/familia',
    label: 'menu_familia',
    desktopLabel: 'menu_familia',
    icon: (active: boolean) => <Users {...navIconProps(active)} />,
  },
  {
    path: '/analisis-emocional',
    label: 'menu_analisis',
    desktopLabel: 'menu_analisis',
    icon: (active: boolean) => <BrainCircuit {...navIconProps(active)} />,
  },
  {
    path: '/supervivencia',
    label: 'menu_supervivencia',
    desktopLabel: 'menu_supervivencia',
    icon: (active: boolean) => <ShieldCheck {...navIconProps(active)} />,
  },
  {
    path: '/saneamiento',
    label: 'menu_saneamiento',
    desktopLabel: 'menu_saneamiento',
    icon: (active: boolean) => <Brush {...navIconProps(active)} />,
  },
  {
    path: '/inversiones',
    label: 'menu_inversiones',
    desktopLabel: 'menu_inversiones',
    icon: (active: boolean) => <TrendingUp {...navIconProps(active)} />,
  },
  {
    path: '/salud',
    label: 'menu_salud',
    desktopLabel: 'menu_salud',
    icon: (active: boolean) => <HeartPulse {...navIconProps(active)} />,
  },
  {
    path: '/sobres',
    label: 'menu_sobres',
    desktopLabel: 'menu_sobres',
    icon: (active: boolean) => <Mail {...navIconProps(active)} />,
  },
  {
    path: '/configuracion',
    label: 'menu_configuracion',
    desktopLabel: 'menu_configuracion',
    icon: (active: boolean) => <Settings {...navIconProps(active)} />,
  },
]
