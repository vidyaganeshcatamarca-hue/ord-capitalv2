import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '@/constants/navigation'
import { t } from '@/locales/i18n'
import { supabase } from '@/lib/supabase'
import { useModoApp } from '@/contexts/ModoAppContext'
import { HelpCircle } from 'lucide-react'
import './BottomNav.css'

interface BottomNavProps {
  onAddPress: () => void
  /** Fired once when the central "+" is held for {@link VOICE_LONG_PRESS_MS} ms. */
  onVoiceLongPress: () => void
}

/** How long the "+" must stay held before the voice recorder takes over. */
const VOICE_LONG_PRESS_MS = 2000

export function BottomNav({ onAddPress, onVoiceLongPress }: BottomNavProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { hasFeature } = useModoApp()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [modoPresupuesto, setModoPresupuesto] = useState<'base_cero' | 'anticipado'>('anticipado')
  // True while the "+" is held and the long-press timer is still running.
  const [isVoicePressing, setIsVoicePressing] = useState(false)

  const longPressTimerRef = useRef<number | null>(null)
  // Set when the long-press already fired, so the trailing click is swallowed.
  const longPressFiredRef = useRef(false)
  // Keep the latest callback without restarting the press lifecycle.
  const onVoiceLongPressRef = useRef(onVoiceLongPress)
  useEffect(() => {
    onVoiceLongPressRef.current = onVoiceLongPress
  }, [onVoiceLongPress])

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase.rpc('fn_obtener_config_presupuesto')
        if (!error && data) {
          const rawData = data as any[]
          const cfg = Array.isArray(rawData) ? rawData[0] : rawData
          if (cfg?.modo_presupuesto) {
            setModoPresupuesto(cfg.modo_presupuesto)
          }
        }
      } catch (err) {
        console.error('Error fetching budget mode in BottomNav:', err)
      }
    }
    fetchConfig()

    const handleBudgetChange = () => {
      fetchConfig()
    }
    window.addEventListener('budget-mode-changed', handleBudgetChange)
    return () => {
      window.removeEventListener('budget-mode-changed', handleBudgetChange)
    }
  }, [])

  const clearLongPressTimer = useCallback((): void => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  // Never leave a timer running after unmount.
  useEffect(() => clearLongPressTimer, [clearLongPressTimer])

  const handleAddPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      // Primary button / touch only: a right or middle click is not a gesture.
      if (event.button !== 0) return
      clearLongPressTimer()
      longPressFiredRef.current = false
      setIsVoicePressing(true)
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null
        longPressFiredRef.current = true
        setIsVoicePressing(false)
        setIsMenuOpen(false)
        onVoiceLongPressRef.current()
      }, VOICE_LONG_PRESS_MS)
    },
    [clearLongPressTimer]
  )

  // Release or drift away before the threshold: it was a tap, keep the timer off.
  const handleAddPointerEnd = useCallback((): void => {
    clearLongPressTimer()
    setIsVoicePressing(false)
  }, [clearLongPressTimer])

  const handleAddClick = useCallback((): void => {
    // A long-press already opened the recorder: swallow the synthetic click so
    // the manual movement modal does not open on top of it.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    setIsMenuOpen(false)
    onAddPress()
  }, [onAddPress])

  // Mobile long-press opens the OS context menu; the "+" owns that gesture.
  const handleAddContextMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
  }, [])

  const isBaseCero = modoPresupuesto === 'base_cero'

  // Rutas que se muestran en la barra inferior directamente
  const allowedMobilePaths = isBaseCero
    ? ['/', '/billeteras', '/presupuesto']
    : ['/', '/billeteras', '/tarjetas']
  const allowedMobileSet = useMemo(() => new Set(allowedMobilePaths), [isBaseCero])
  const mobileNavItems = NAV_ITEMS.filter(item => allowedMobileSet.has(item.path))

  // Rutas que se agrupan dentro del menú desplegable "Menú"
  const dropdownPaths = isBaseCero
    ? ['/tarjetas', '/cuarentena', '/familia', '/saneamiento', '/inversiones', '/salud', '/sobres', '/configuracion', '/ayuda']
    : ['/presupuesto', '/cuarentena', '/familia', '/saneamiento', '/inversiones', '/salud', '/sobres', '/configuracion', '/ayuda']
  const dropdownSet = useMemo(() => new Set(dropdownPaths), [isBaseCero])
  const dropdownNavItems = NAV_ITEMS.filter(item => dropdownSet.has(item.path) && hasFeature(item.label))

  const AYUDA_ITEM = {
    path: '/ayuda',
    label: 'menu_ayuda',
    icon: (active: boolean) => <HelpCircle size={22} stroke="currentColor" fill={active ? 'currentColor' : 'none'} strokeWidth={active ? 0 : 1.8} />,
  } as const

  const handleDropdownItemClick = (path: string) => {
    setIsMenuOpen(false)
    navigate(path)
  }

  // Comprobar si la ruta actual pertenece a las opciones secundarias del menú
  const isDropdownActive = dropdownSet.has(pathname)

  return (
    <>
      {isMenuOpen && (
        <div className="bottom-nav-overlay" onClick={() => setIsMenuOpen(false)} />
      )}

      {isMenuOpen && (
        <div className="bottom-nav-menu-panel">
          {dropdownNavItems.map((item) => {
            const active = pathname === item.path
            return (
              <button
                key={item.path}
                className={`bottom-nav-menu-item ${active ? 'active' : ''}`}
                onClick={() => handleDropdownItemClick(item.path)}
              >
                <span className="bottom-nav-menu-item-icon">{item.icon(active)}</span>
                <span>{t(item.label)}</span>
              </button>
            )
          })}
          <div className="bottom-nav-menu-divider" />
          <button
            className={`bottom-nav-menu-item ${pathname === AYUDA_ITEM.path ? 'active' : ''}`}
            onClick={() => handleDropdownItemClick(AYUDA_ITEM.path)}
          >
            <span className="bottom-nav-menu-item-icon">{AYUDA_ITEM.icon(pathname === AYUDA_ITEM.path)}</span>
            <span>{t(AYUDA_ITEM.label)}</span>
          </button>
        </div>
      )}

      <nav className="bottom-nav">
        {/* Inicio y Cuentas */}
        {mobileNavItems.slice(0, 2).map((item) => {
          const active = pathname === item.path
          return (
            <button
              key={item.path}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={() => {
                setIsMenuOpen(false)
                navigate(item.path)
              }}
              aria-label={t(item.label)}
            >
              {item.icon(active)}
              {item.label && <span>{t(item.label)}</span>}
            </button>
          )
        })}

        {/* FAB Central: tap adds a movement, press-and-hold opens the voice recorder */}
        <button
          className="nav-item"
          data-tour-id="home-fab-registrar"
          onPointerDown={handleAddPointerDown}
          onPointerUp={handleAddPointerEnd}
          onPointerCancel={handleAddPointerEnd}
          onPointerLeave={handleAddPointerEnd}
          onContextMenu={handleAddContextMenu}
          onClick={handleAddClick}
          aria-label={`${t('menu_registrar_movimiento')}. ${t('menu_add_voice_hint')}`}
          title={t('menu_add_voice_hint')}
        >
          <div className={`fab ${isVoicePressing ? 'is-voice-press' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
              <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
            </svg>
          </div>
        </button>

        {/* Tarjetas / Base 0 */}
        {mobileNavItems.slice(2, 3).map((item) => {
          const active = pathname === item.path
          const labelText = (item.path === '/presupuesto' && isBaseCero) ? t('menu_base_cero_short') : t(item.label)
          return (
            <button
              key={item.path}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={() => {
                setIsMenuOpen(false)
                navigate(item.path)
              }}
              aria-label={labelText}
            >
              {item.icon(active)}
              {item.label && <span>{labelText}</span>}
            </button>
          )
        })}

        {/* Botón Menú (Borde inferior derecho) */}
        <button
          className={`nav-item ${isDropdownActive || isMenuOpen ? 'active' : ''}`}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label={t('menu_more')}
        >
          <svg viewBox="0 0 24 24" fill={isDropdownActive || isMenuOpen ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isDropdownActive || isMenuOpen ? 0 : 1.8}>
            <circle cx="5" cy="5" r="1.5" />
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="19" cy="5" r="1.5" />
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
            <circle cx="5" cy="19" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
            <circle cx="19" cy="19" r="1.5" />
          </svg>
          <span>{t('menu_more')}</span>
        </button>
      </nav>
    </>
  )
}
