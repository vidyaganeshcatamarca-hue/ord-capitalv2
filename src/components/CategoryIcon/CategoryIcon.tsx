import React from 'react'
import {
  Home,
  Wallet,
  CreditCard,
  FileBarChart2,
  Inbox,
  Users,
  BrainCircuit,
  ShieldCheck,
  BrushCleaning,
  TrendingUp,
  HeartPulse,
  Mail,
  Settings,
  CheckCircle2,
  CircleX,
  TriangleAlert,
  Info,
  Banknote,
  CircleDollarSign,
  Tag,
  HandCoins,
  Target,
  ShoppingCart,
  ArrowRightLeft,
  Scale,
  Refrigerator,
  PaperBag,
  Milk,
  SoapDispenserDroplet,
  PawPrint,
  Shirt,
  Car,
  Stethoscope,
  GraduationCap,
  BarChart3,
  Monitor,
  PartyPopper,
  Utensils,
  Beef,
  Fish,
  Coffee,
  Leaf,
  Soup,
  Beer,
  Wine,
  CakeSlice,
  Apple,
  Croissant,
  CookingPot,
  IceCreamCone,
  SendHorizontal,
  Landmark,
  TrendingDown,
  Gem,
  Coins,
  Briefcase,
  Dices,
  Euro,
  Building2,
  Gamepad2,
  Plane,
  Gift,
  EyeOff,
  UtensilsCrossed,
  Search,
  Edit,
  Plus,
  Trash2,
  Bug,
  Moon,
  ArrowUpFromLine,
  ArrowDownFromLine,
  Sparkles,
  Scissors,
  Plug,
  BookOpen,
  Umbrella,
  Dog,
  Pizza,
  Lightbulb,
  Music,
  Smartphone,
  Popcorn,
  Dumbbell,
  Baby,
} from 'lucide-react'

// Replacements for icons not present in lucide-react@1.28.0:
// - Broom        -> BrushCleaning
// - Bottle       -> Milk
// - UtensilsCross -> UtensilsCrossed
export interface CategoryIconProps {
  name: string
  size?: number | string
  color?: string
  strokeWidth?: number
  className?: string
  style?: React.CSSProperties
}

const ICON_MAP: Record<string, React.ElementType> = {
  Home,
  Wallet,
  CreditCard,
  FileBarChart2,
  Inbox,
  Users,
  BrainCircuit,
  ShieldCheck,
  BrushCleaning,
  TrendingUp,
  HeartPulse,
  Mail,
  Settings,
  CheckCircle2,
  CircleX,
  TriangleAlert,
  Info,
  Banknote,
  CircleDollarSign,
  Tag,
  HandCoins,
  Target,
  ShoppingCart,
  ArrowRightLeft,
  Scale,
  Refrigerator,
  PaperBag,
  Milk,
  SoapDispenserDroplet,
  PawPrint,
  Shirt,
  Car,
  Stethoscope,
  GraduationCap,
  BarChart3,
  Monitor,
  PartyPopper,
  Utensils,
  Beef,
  Fish,
  Coffee,
  Leaf,
  Soup,
  Beer,
  Wine,
  CakeSlice,
  Apple,
  Croissant,
  CookingPot,
  IceCreamCone,
  SendHorizontal,
  Landmark,
  TrendingDown,
  Gem,
  Coins,
  Briefcase,
  Dices,
  Euro,
  Building2,
  Gamepad2,
  Plane,
  Gift,
  EyeOff,
  UtensilsCrossed,
  Search,
  Edit,
  Plus,
  Trash2,
  Bug,
  Moon,
  ArrowUpFromLine,
  ArrowDownFromLine,
  Sparkles,
  Scissors,
  Plug,
  BookOpen,
  Umbrella,
  Dog,
  Pizza,
  Lightbulb,
  Music,
  Smartphone,
  Popcorn,
  Dumbbell,
  Baby,
}

export const LUCIDE_ICON_NAMES = [
  'Home',
  'Wallet',
  'CreditCard',
  'FileBarChart2',
  'Inbox',
  'Users',
  'BrainCircuit',
  'ShieldCheck',
  'BrushCleaning',
  'TrendingUp',
  'HeartPulse',
  'Mail',
  'Settings',
  'CheckCircle2',
  'CircleX',
  'TriangleAlert',
  'Info',
  'Banknote',
  'CircleDollarSign',
  'Tag',
  'HandCoins',
  'Target',
  'ShoppingCart',
  'ArrowRightLeft',
  'Scale',
  'Refrigerator',
  'PaperBag',
  'Milk',
  'SoapDispenserDroplet',
  'PawPrint',
  'Shirt',
  'Car',
  'Stethoscope',
  'GraduationCap',
  'BarChart3',
  'Monitor',
  'PartyPopper',
  'Utensils',
  'Beef',
  'Fish',
  'Coffee',
  'Leaf',
  'Soup',
  'Beer',
  'Wine',
  'CakeSlice',
  'Apple',
  'Croissant',
  'CookingPot',
  'IceCreamCone',
  'SendHorizontal',
  'Landmark',
  'TrendingDown',
  'Gem',
  'Coins',
  'Briefcase',
  'Dices',
  'Euro',
  'Building2',
  'Gamepad2',
  'Plane',
  'Gift',
  'EyeOff',
  'UtensilsCrossed',
  'Search',
  'Edit',
  'Plus',
  'Trash2',
  'Bug',
  'Moon',
  'ArrowUpFromLine',
  'ArrowDownFromLine',
  'Sparkles',
  'Scissors',
  'Plug',
  'BookOpen',
  'Umbrella',
  'Dog',
  'Pizza',
  'Lightbulb',
  'Music',
  'Smartphone',
  'Popcorn',
  'Dumbbell',
  'Baby',
]

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

function isEmoji(value: string): boolean {
  return EMOJI_REGEX.test(value)
}

export function CategoryIcon({
  name,
  size = 24,
  color,
  strokeWidth = 2,
  className,
  style,
}: CategoryIconProps) {
  const trimmed = name.trim()

  if (!trimmed) {
    console.warn('CategoryIcon received an empty name')
    return null
  }

  const Icon = ICON_MAP[trimmed]
  if (Icon) {
    return (
      <Icon
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        className={className}
        style={style}
      />
    )
  }

  if (isEmoji(trimmed)) {
    return (
      <span
        className={className}
        style={{
          fontSize: size,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...style,
        }}
      >
        {trimmed}
      </span>
    )
  }

  console.warn(`CategoryIcon: no lucide icon or emoji found for "${trimmed}"`)
  return null
}
